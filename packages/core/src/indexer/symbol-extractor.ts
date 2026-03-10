import ts from "typescript";
import type { ExtractedSymbol, SymbolKind } from "./types.js";

export function extractSymbols(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  relativePath: string,
  contentHash: string,
): ExtractedSymbol[] {
  const symbols: ExtractedSymbol[] = [];

  function getLocation(node: ts.Node) {
    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
    return {
      startLine: start.line + 1,
      startCol: start.character + 1,
      endLine: end.line + 1,
      endCol: end.character + 1,
    };
  }

  function getDocComment(node: ts.Node): string | null {
    const symbol = checker.getSymbolAtLocation(
      (node as ts.NamedDeclaration).name ?? node,
    );
    if (!symbol) return null;

    const docs = symbol.getDocumentationComment(checker);
    if (docs.length === 0) return null;
    return ts.displayPartsToString(docs);
  }

  function getSignature(node: ts.Node): string | null {
    const type = checker.getTypeAtLocation(node);
    const callSigs = type.getCallSignatures();
    if (callSigs.length === 0) return null;

    const sig = callSigs[0]!;
    return checker.signatureToString(
      sig,
      undefined,
      ts.TypeFormatFlags.WriteArrowStyleSignature,
    );
  }

  function getReturnType(node: ts.Node): string | null {
    const type = checker.getTypeAtLocation(node);
    const callSigs = type.getCallSignatures();
    if (callSigs.length === 0) return null;

    const sig = callSigs[0]!;
    return checker.typeToString(checker.getReturnTypeOfSignature(sig));
  }

  function isExported(node: ts.Node): boolean {
    const flags = ts.getCombinedModifierFlags(node as ts.Declaration);
    if (flags & ts.ModifierFlags.Export) return true;
    // Check for `export default`
    if (
      node.kind === ts.SyntaxKind.ExportAssignment ||
      (ts.isExportAssignment && ts.isExportAssignment(node))
    ) {
      return true;
    }
    return false;
  }

  function isAsync(node: ts.Node): boolean {
    const flags = ts.getCombinedModifierFlags(node as ts.Declaration);
    return (flags & ts.ModifierFlags.Async) !== 0;
  }

  function makeId(name: string, kind: SymbolKind, qualifier?: string): string {
    const qualifiedPart = qualifier ? `${qualifier}.${name}` : name;
    return `${relativePath}::${qualifiedPart}#${kind}`;
  }

  function isCallableInitializer(
    init: ts.Expression | undefined,
  ): init is ts.ArrowFunction | ts.FunctionExpression {
    if (!init) return false;
    return (
      ts.isArrowFunction(init) || ts.isFunctionExpression(init)
    );
  }

  // ---- React detection helpers ----

  /**
   * Check if a node's subtree contains JSX elements (JsxElement, JsxSelfClosingElement, JsxFragment).
   * Used to classify functions as React components.
   */
  function containsJsx(node: ts.Node): boolean {
    let found = false;
    function walk(n: ts.Node): void {
      if (found) return;
      if (
        ts.isJsxElement(n) ||
        ts.isJsxSelfClosingElement(n) ||
        ts.isJsxFragment(n)
      ) {
        found = true;
        return;
      }
      ts.forEachChild(n, walk);
    }
    walk(node);
    return found;
  }

  /**
   * Check if a name follows the React hook convention: starts with "use" followed by uppercase.
   */
  function isHookName(name: string): boolean {
    return /^use[A-Z]/.test(name);
  }

  /**
   * Check if an initializer is a createContext() call.
   */
  function isCreateContextCall(init: ts.Expression | undefined): boolean {
    if (!init || !ts.isCallExpression(init)) return false;
    const expr = init.expression;
    // createContext(...)
    if (ts.isIdentifier(expr) && expr.text === "createContext") return true;
    // React.createContext(...)
    if (
      ts.isPropertyAccessExpression(expr) &&
      ts.isIdentifier(expr.name) &&
      expr.name.text === "createContext"
    ) {
      return true;
    }
    return false;
  }

  /**
   * Check if an initializer is a React.memo() or React.forwardRef() wrapper
   * containing a function that returns JSX.
   */
  function isReactWrapperCall(init: ts.Expression | undefined): boolean {
    if (!init || !ts.isCallExpression(init)) return false;
    const expr = init.expression;
    const wrapperNames = ["memo", "forwardRef"];

    let isWrapper = false;
    // memo(...) / forwardRef(...)
    if (ts.isIdentifier(expr) && wrapperNames.includes(expr.text)) {
      isWrapper = true;
    }
    // React.memo(...) / React.forwardRef(...)
    if (
      ts.isPropertyAccessExpression(expr) &&
      ts.isIdentifier(expr.name) &&
      wrapperNames.includes(expr.name.text)
    ) {
      isWrapper = true;
    }
    if (!isWrapper) return false;

    // Check if any argument contains JSX
    for (const arg of init.arguments) {
      if (containsJsx(arg)) return true;
    }
    return false;
  }

  /**
   * Classify a function-like symbol: is it a component, hook, or plain function?
   */
  function classifyFunction(
    name: string,
    body: ts.Node | undefined,
    init?: ts.Expression | undefined,
  ): SymbolKind {
    // React.memo() / React.forwardRef() wrappers
    if (init && isReactWrapperCall(init)) return "component";
    // Hook: starts with "use" + uppercase
    if (isHookName(name)) return "hook";
    // Component: PascalCase function that returns JSX
    if (body && /^[A-Z]/.test(name) && containsJsx(body)) return "component";
    return "function";
  }

  function visit(node: ts.Node): void {
    // Function declarations
    if (ts.isFunctionDeclaration(node) && node.name) {
      const name = node.name.text;
      const kind = classifyFunction(name, node.body);
      symbols.push({
        id: makeId(name, kind),
        name,
        qualifiedName: name,
        kind,
        filePath: relativePath,
        ...getLocation(node),
        signature: getSignature(node),
        returnType: getReturnType(node),
        docComment: getDocComment(node),
        isExported: isExported(node),
        isAsync: isAsync(node),
        contentHash,
      });
      return;
    }

    // Class declarations
    if (ts.isClassDeclaration(node) && node.name) {
      const name = node.name.text;
      symbols.push({
        id: makeId(name, "class"),
        name,
        qualifiedName: name,
        kind: "class",
        filePath: relativePath,
        ...getLocation(node),
        signature: null,
        returnType: null,
        docComment: getDocComment(node),
        isExported: isExported(node),
        isAsync: false,
        contentHash,
      });

      // Extract class methods as symbols
      for (const member of node.members) {
        if (
          (ts.isMethodDeclaration(member) || ts.isPropertyDeclaration(member)) &&
          member.name &&
          ts.isIdentifier(member.name)
        ) {
          const memberName = member.name.text;
          const memberKind: SymbolKind = ts.isMethodDeclaration(member)
            ? "function"
            : isCallableInitializer(
                  (member as ts.PropertyDeclaration).initializer,
                )
              ? "function"
              : "variable";

          symbols.push({
            id: makeId(memberName, memberKind, name),
            name: memberName,
            qualifiedName: `${name}.${memberName}`,
            kind: memberKind,
            filePath: relativePath,
            ...getLocation(member),
            signature:
              memberKind === "function" ? getSignature(member) : null,
            returnType:
              memberKind === "function" ? getReturnType(member) : null,
            docComment: getDocComment(member),
            isExported: isExported(node), // class export implies member export
            isAsync: isAsync(member),
            contentHash,
          });
        }
      }
      return;
    }

    // Interface declarations
    if (ts.isInterfaceDeclaration(node)) {
      const name = node.name.text;
      symbols.push({
        id: makeId(name, "interface"),
        name,
        qualifiedName: name,
        kind: "interface",
        filePath: relativePath,
        ...getLocation(node),
        signature: null,
        returnType: null,
        docComment: getDocComment(node),
        isExported: isExported(node),
        isAsync: false,
        contentHash,
      });
      return;
    }

    // Type alias declarations
    if (ts.isTypeAliasDeclaration(node)) {
      const name = node.name.text;
      symbols.push({
        id: makeId(name, "type"),
        name,
        qualifiedName: name,
        kind: "type",
        filePath: relativePath,
        ...getLocation(node),
        signature: null,
        returnType: checker.typeToString(
          checker.getTypeAtLocation(node),
        ),
        docComment: getDocComment(node),
        isExported: isExported(node),
        isAsync: false,
        contentHash,
      });
      return;
    }

    // Enum declarations
    if (ts.isEnumDeclaration(node)) {
      const name = node.name.text;
      symbols.push({
        id: makeId(name, "enum"),
        name,
        qualifiedName: name,
        kind: "enum",
        filePath: relativePath,
        ...getLocation(node),
        signature: null,
        returnType: null,
        docComment: getDocComment(node),
        isExported: isExported(node),
        isAsync: false,
        contentHash,
      });
      return;
    }

    // Variable statements (const, let, var)
    if (ts.isVariableStatement(node)) {
      const exported = isExported(node);

      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue;

        const name = decl.name.text;
        const callable = isCallableInitializer(decl.initializer);

        let kind: SymbolKind;
        if (isCreateContextCall(decl.initializer)) {
          kind = "context";
        } else if (callable) {
          kind = classifyFunction(name, decl.initializer!.body, undefined);
        } else if (isReactWrapperCall(decl.initializer)) {
          kind = "component";
        } else {
          kind = node.declarationList.flags & ts.NodeFlags.Const
            ? "constant"
            : "variable";
        }

        symbols.push({
          id: makeId(name, kind),
          name,
          qualifiedName: name,
          kind,
          filePath: relativePath,
          ...getLocation(decl),
          signature: callable || kind === "component" ? getSignature(decl) : null,
          returnType: callable || kind === "component" ? getReturnType(decl) : null,
          docComment: getDocComment(decl),
          isExported: exported,
          isAsync: callable
            ? decl.initializer !== undefined && isAsync(decl.initializer)
            : false,
          contentHash,
        });
      }
      return;
    }

    // Export assignments (export default ...)
    if (ts.isExportAssignment(node) && !node.isExportEquals) {
      // Only handle named identifiers as default exports
      if (ts.isIdentifier(node.expression)) {
        // Skip — the actual declaration is indexed elsewhere
        return;
      }
    }
  }

  ts.forEachChild(sourceFile, visit);

  return symbols;
}
