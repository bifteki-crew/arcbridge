import ts from "typescript";
import { relative } from "node:path";

export type DependencyKind =
  | "imports"
  | "calls"
  | "extends"
  | "implements"
  | "uses_type"
  | "renders"
  | "provides_context"
  | "consumes_context";

export interface ExtractedDependency {
  sourceSymbolId: string;
  targetSymbolId: string;
  kind: DependencyKind;
}

/**
 * Build a lookup from (filePath, symbolName, kind?) to symbol ID.
 * Used to resolve TS compiler symbols to our indexed symbol IDs.
 */
export interface SymbolLookup {
  /** All indexed symbol IDs keyed by "filePath::name" */
  byFileAndName: Map<string, string>;
  /** All indexed symbol IDs */
  allIds: Set<string>;
}

export function buildSymbolLookup(
  symbols: Array<{ id: string; filePath: string; name: string }>,
): SymbolLookup {
  const byFileAndName = new Map<string, string>();
  const allIds = new Set<string>();

  for (const s of symbols) {
    byFileAndName.set(`${s.filePath}::${s.name}`, s.id);
    allIds.add(s.id);
  }

  return { byFileAndName, allIds };
}

export function extractDependencies(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  relativePath: string,
  projectRoot: string,
  lookup: SymbolLookup,
): ExtractedDependency[] {
  const deps: ExtractedDependency[] = [];
  const seen = new Set<string>();

  function addDep(
    sourceId: string,
    targetId: string,
    kind: ExtractedDependency["kind"],
  ): void {
    const key = `${sourceId}|${targetId}|${kind}`;
    if (seen.has(key)) return;
    if (!lookup.allIds.has(sourceId) || !lookup.allIds.has(targetId)) return;
    if (sourceId === targetId) return;
    seen.add(key);
    deps.push({ sourceSymbolId: sourceId, targetSymbolId: targetId, kind });
  }

  function resolveSymbolId(tsSymbol: ts.Symbol): string | null {
    // Get the declaration to find the file path
    const decls = tsSymbol.getDeclarations();
    if (!decls || decls.length === 0) return null;

    const decl = decls[0]!;
    const declFile = decl.getSourceFile();
    if (declFile.isDeclarationFile) return null;

    const declRelPath = relative(projectRoot, declFile.fileName);
    const name = tsSymbol.getName();

    // Direct lookup: file::name
    const directId = lookup.byFileAndName.get(`${declRelPath}::${name}`);
    if (directId) return directId;

    return null;
  }

  // ---- Extract import dependencies ----
  function extractImports(): void {
    for (const stmt of sourceFile.statements) {
      if (!ts.isImportDeclaration(stmt)) continue;
      if (!stmt.importClause) continue;

      const moduleSymbol = checker.getSymbolAtLocation(stmt.moduleSpecifier);
      if (!moduleSymbol) continue;

      // Named imports: import { Foo, Bar } from './module'
      const namedBindings = stmt.importClause.namedBindings;
      if (namedBindings && ts.isNamedImports(namedBindings)) {
        for (const specifier of namedBindings.elements) {
          const importedSymbol = checker.getSymbolAtLocation(specifier.name);
          if (!importedSymbol) continue;

          // Resolve through aliases
          const resolved = checker.getAliasedSymbol
            ? checker.getAliasedSymbol(importedSymbol)
            : importedSymbol;

          const targetId = resolveSymbolId(resolved);
          if (!targetId) continue;

          // Find which source symbols in this file use this import
          // For simplicity, we attribute imports to the file's top-level symbols
          const fileSymbols = getFileTopLevelSymbols(relativePath, lookup);
          for (const sourceId of fileSymbols) {
            addDep(sourceId, targetId, "imports");
          }
        }
      }

      // Default import: import Foo from './module'
      if (stmt.importClause.name) {
        const importedSymbol = checker.getSymbolAtLocation(stmt.importClause.name);
        if (importedSymbol) {
          const resolved = checker.getAliasedSymbol
            ? checker.getAliasedSymbol(importedSymbol)
            : importedSymbol;

          const targetId = resolveSymbolId(resolved);
          if (targetId) {
            const fileSymbols = getFileTopLevelSymbols(relativePath, lookup);
            for (const sourceId of fileSymbols) {
              addDep(sourceId, targetId, "imports");
            }
          }
        }
      }
    }
  }

  // ---- Extract extends/implements ----
  function extractHeritage(): void {
    ts.forEachChild(sourceFile, function visit(node) {
      if (ts.isClassDeclaration(node) && node.name) {
        const className = node.name.text;
        const classId = lookup.byFileAndName.get(`${relativePath}::${className}`);
        if (!classId) return;

        if (node.heritageClauses) {
          for (const clause of node.heritageClauses) {
            const kind: ExtractedDependency["kind"] =
              clause.token === ts.SyntaxKind.ExtendsKeyword
                ? "extends"
                : "implements";

            for (const typeExpr of clause.types) {
              const exprSymbol = checker.getSymbolAtLocation(typeExpr.expression);
              if (!exprSymbol) continue;

              const resolved = exprSymbol.flags & ts.SymbolFlags.Alias
                ? checker.getAliasedSymbol(exprSymbol)
                : exprSymbol;

              const targetId = resolveSymbolId(resolved);
              if (targetId) {
                addDep(classId, targetId, kind);
              }
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    });
  }

  // ---- Extract call dependencies ----
  function extractCalls(): void {
    ts.forEachChild(sourceFile, function visitTopLevel(node) {
      const ownerName = getOwnerName(node);
      if (!ownerName) return;

      const ownerIdOrUndef = lookup.byFileAndName.get(`${relativePath}::${ownerName}`);
      if (!ownerIdOrUndef) return;
      const ownerId: string = ownerIdOrUndef;

      // Walk the body looking for call expressions
      function walkForCalls(n: ts.Node): void {
        if (ts.isCallExpression(n)) {
          const calledSymbol = checker.getSymbolAtLocation(n.expression);
          if (calledSymbol) {
            const resolved = calledSymbol.flags & ts.SymbolFlags.Alias
              ? checker.getAliasedSymbol(calledSymbol)
              : calledSymbol;

            const targetId = resolveSymbolId(resolved);
            if (targetId) {
              addDep(ownerId, targetId, "calls");
            }
          }
        }
        ts.forEachChild(n, walkForCalls);
      }

      // Walk function/method bodies
      if (ts.isFunctionDeclaration(node) && node.body) {
        walkForCalls(node.body);
      } else if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (decl.initializer) {
            if (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) {
              if (decl.initializer.body) {
                walkForCalls(decl.initializer.body);
              }
            }
          }
        }
      } else if (ts.isClassDeclaration(node)) {
        for (const member of node.members) {
          if (ts.isMethodDeclaration(member) && member.body) {
            const memberName = member.name && ts.isIdentifier(member.name)
              ? member.name.text
              : null;
            if (memberName) {
              const memberId = lookup.byFileAndName.get(
                `${relativePath}::${ownerName}.${memberName}`,
              );
              // Attribute calls to the method if we have it, else to the class
              const callOwnerId = memberId ?? ownerId;
              function walkMethodCalls(n: ts.Node): void {
                if (ts.isCallExpression(n)) {
                  const calledSymbol = checker.getSymbolAtLocation(n.expression);
                  if (calledSymbol) {
                    const resolved = calledSymbol.flags & ts.SymbolFlags.Alias
                      ? checker.getAliasedSymbol(calledSymbol)
                      : calledSymbol;
                    const targetId = resolveSymbolId(resolved);
                    if (targetId) {
                      addDep(callOwnerId, targetId, "calls");
                    }
                  }
                }
                ts.forEachChild(n, walkMethodCalls);
              }
              walkMethodCalls(member.body);
            }
          }
        }
      }
    });
  }

  // ---- Extract type usage ----
  function extractTypeUsage(): void {
    ts.forEachChild(sourceFile, function visitTopLevel(node) {
      const ownerName = getOwnerName(node);
      if (!ownerName) return;

      const ownerIdOrUndef = lookup.byFileAndName.get(`${relativePath}::${ownerName}`);
      if (!ownerIdOrUndef) return;
      const ownerId: string = ownerIdOrUndef;

      function walkForTypes(n: ts.Node): void {
        if (ts.isTypeReferenceNode(n)) {
          const typeSymbol = checker.getSymbolAtLocation(n.typeName);
          if (typeSymbol) {
            const resolved = typeSymbol.flags & ts.SymbolFlags.Alias
              ? checker.getAliasedSymbol(typeSymbol)
              : typeSymbol;

            const targetId = resolveSymbolId(resolved);
            if (targetId) {
              addDep(ownerId, targetId, "uses_type");
            }
          }
        }
        ts.forEachChild(n, walkForTypes);
      }

      walkForTypes(node);
    });
  }

  // ---- Extract JSX renders (component A renders component B) ----
  function extractRenders(): void {
    ts.forEachChild(sourceFile, function visitTopLevel(node) {
      const ownerName = getOwnerName(node);
      if (!ownerName) return;

      const ownerIdOrUndef = lookup.byFileAndName.get(`${relativePath}::${ownerName}`);
      if (!ownerIdOrUndef) return;
      const ownerId: string = ownerIdOrUndef;

      function walkForJsx(n: ts.Node): void {
        // <Component /> or <Component>...</Component>
        const tagName = ts.isJsxOpeningElement(n)
          ? n.tagName
          : ts.isJsxSelfClosingElement(n)
            ? n.tagName
            : null;

        if (tagName) {
          const jsxSymbol = checker.getSymbolAtLocation(tagName);
          if (jsxSymbol) {
            const resolved = jsxSymbol.flags & ts.SymbolFlags.Alias
              ? checker.getAliasedSymbol(jsxSymbol)
              : jsxSymbol;
            const targetId = resolveSymbolId(resolved);
            if (targetId) {
              addDep(ownerId, targetId, "renders");
            }
          }

          // Check for .Provider pattern: <XContext.Provider>
          if (
            ts.isPropertyAccessExpression(tagName) &&
            ts.isIdentifier(tagName.name) &&
            tagName.name.text === "Provider"
          ) {
            const ctxSymbol = checker.getSymbolAtLocation(tagName.expression);
            if (ctxSymbol) {
              const resolved = ctxSymbol.flags & ts.SymbolFlags.Alias
                ? checker.getAliasedSymbol(ctxSymbol)
                : ctxSymbol;
              const targetId = resolveSymbolId(resolved);
              if (targetId) {
                addDep(ownerId, targetId, "provides_context");
              }
            }
          }
        }

        ts.forEachChild(n, walkForJsx);
      }

      // Walk function/arrow function bodies for JSX
      if (ts.isFunctionDeclaration(node) && node.body) {
        walkForJsx(node.body);
      } else if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (decl.initializer) {
            if (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) {
              if (decl.initializer.body) {
                walkForJsx(decl.initializer.body);
              }
            }
            // React.memo/forwardRef wrappers
            if (ts.isCallExpression(decl.initializer)) {
              for (const arg of decl.initializer.arguments) {
                if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
                  if (arg.body) walkForJsx(arg.body);
                }
              }
            }
          }
        }
      }
    });
  }

  // ---- Extract useContext → consumes_context ----
  function extractContextConsumption(): void {
    ts.forEachChild(sourceFile, function visitTopLevel(node) {
      const ownerName = getOwnerName(node);
      if (!ownerName) return;

      const ownerIdOrUndef = lookup.byFileAndName.get(`${relativePath}::${ownerName}`);
      if (!ownerIdOrUndef) return;
      const ownerId: string = ownerIdOrUndef;

      function walkForContext(n: ts.Node): void {
        if (
          ts.isCallExpression(n) &&
          ts.isIdentifier(n.expression) &&
          n.expression.text === "useContext" &&
          n.arguments.length > 0
        ) {
          const arg = n.arguments[0]!;
          const ctxSymbol = checker.getSymbolAtLocation(arg);
          if (ctxSymbol) {
            const resolved = ctxSymbol.flags & ts.SymbolFlags.Alias
              ? checker.getAliasedSymbol(ctxSymbol)
              : ctxSymbol;
            const targetId = resolveSymbolId(resolved);
            if (targetId) {
              addDep(ownerId, targetId, "consumes_context");
            }
          }
        }
        ts.forEachChild(n, walkForContext);
      }

      // Walk function bodies
      if (ts.isFunctionDeclaration(node) && node.body) {
        walkForContext(node.body);
      } else if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (decl.initializer) {
            if (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) {
              if (decl.initializer.body) {
                walkForContext(decl.initializer.body);
              }
            }
          }
        }
      }
    });
  }

  extractImports();
  extractHeritage();
  extractCalls();
  extractTypeUsage();
  extractRenders();
  extractContextConsumption();

  return deps;
}

// ---- Helpers ----

function getFileTopLevelSymbols(
  filePath: string,
  lookup: SymbolLookup,
): string[] {
  const results: string[] = [];
  for (const [key, id] of lookup.byFileAndName) {
    if (key.startsWith(`${filePath}::`)) {
      results.push(id);
    }
  }
  return results;
}

function getOwnerName(node: ts.Node): string | null {
  if (ts.isFunctionDeclaration(node) && node.name) {
    return node.name.text;
  }
  if (ts.isClassDeclaration(node) && node.name) {
    return node.name.text;
  }
  if (ts.isInterfaceDeclaration(node)) {
    return node.name.text;
  }
  if (ts.isTypeAliasDeclaration(node)) {
    return node.name.text;
  }
  if (ts.isEnumDeclaration(node)) {
    return node.name.text;
  }
  if (ts.isVariableStatement(node)) {
    const decl = node.declarationList.declarations[0];
    if (decl && ts.isIdentifier(decl.name)) {
      return decl.name.text;
    }
  }
  return null;
}
