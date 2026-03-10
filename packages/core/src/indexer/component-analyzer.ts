import ts from "typescript";
import { relative } from "node:path";
import type Database from "better-sqlite3";

export interface ComponentInfo {
  symbolId: string;
  isClient: boolean;
  isServerAction: boolean;
  hasState: boolean;
  contextProviders: string[];
  contextConsumers: string[];
  propsType: string | null;
}

/**
 * Detect file-level directives: "use client" or "use server".
 * These appear as the first statement in a file as a string literal expression.
 */
function getFileDirective(
  sourceFile: ts.SourceFile,
): "use client" | "use server" | null {
  for (const stmt of sourceFile.statements) {
    if (
      ts.isExpressionStatement(stmt) &&
      ts.isStringLiteral(stmt.expression)
    ) {
      const text = stmt.expression.text;
      if (text === "use client") return "use client";
      if (text === "use server") return "use server";
    }
    // Directives must be at the top; stop at the first non-directive statement
    break;
  }
  return null;
}

/**
 * Analyze a component function body for state usage and context patterns.
 */
function analyzeComponentBody(
  node: ts.Node,
  checker: ts.TypeChecker,
): {
  hasState: boolean;
  contextProviders: string[];
  contextConsumers: string[];
} {
  let hasState = false;
  const contextProviders = new Set<string>();
  const contextConsumers = new Set<string>();

  function walk(n: ts.Node): void {
    if (ts.isCallExpression(n)) {
      const name = getCallName(n);

      // useState / useReducer → has state
      if (name === "useState" || name === "useReducer") {
        hasState = true;
      }

      // useContext(XContext) → consumer
      if (name === "useContext" && n.arguments.length > 0) {
        const arg = n.arguments[0]!;
        const ctxName = getExpressionName(arg);
        if (ctxName) {
          contextConsumers.add(ctxName);
        }
      }
    }

    // <XContext.Provider> → provider
    if (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) {
      const tagName = n.tagName;
      if (
        ts.isPropertyAccessExpression(tagName) &&
        ts.isIdentifier(tagName.name) &&
        tagName.name.text === "Provider"
      ) {
        const ctxName = getExpressionName(tagName.expression);
        if (ctxName) {
          contextProviders.add(ctxName);
        }
      }
    }

    ts.forEachChild(n, walk);
  }

  walk(node);

  return {
    hasState,
    contextProviders: [...contextProviders],
    contextConsumers: [...contextConsumers],
  };
}

function getCallName(callExpr: ts.CallExpression): string | null {
  const expr = callExpr.expression;
  if (ts.isIdentifier(expr)) return expr.text;
  if (
    ts.isPropertyAccessExpression(expr) &&
    ts.isIdentifier(expr.name)
  ) {
    return expr.name.text;
  }
  return null;
}

function getExpressionName(expr: ts.Node): string | null {
  if (ts.isIdentifier(expr)) return expr.text;
  return null;
}

/**
 * Extract props type from a component function's first parameter.
 */
function getPropsType(
  node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression,
  checker: ts.TypeChecker,
): string | null {
  const params = node.parameters;
  if (params.length === 0) return null;

  const firstParam = params[0]!;
  const type = checker.getTypeAtLocation(firstParam);
  const typeStr = checker.typeToString(type);

  // Skip empty or trivial types
  if (typeStr === "{}" || typeStr === "any") return null;
  return typeStr;
}

/**
 * Extract component information from source files and populate the components table.
 */
export function analyzeComponents(
  sourceFiles: readonly ts.SourceFile[],
  checker: ts.TypeChecker,
  projectRoot: string,
  db: Database.Database,
): number {
  const components: ComponentInfo[] = [];

  for (const sf of sourceFiles) {
    const relPath = relative(projectRoot, sf.fileName);
    const directive = getFileDirective(sf);
    const isClient = directive === "use client";
    const isServerAction = directive === "use server";

    // Find component symbols in this file
    ts.forEachChild(sf, (node) => {
      // Function declaration components
      if (ts.isFunctionDeclaration(node) && node.name) {
        const name = node.name.text;
        if (!/^[A-Z]/.test(name)) return;
        if (!node.body || !containsJsx(node.body)) return;

        const symbolId = `${relPath}::${name}#component`;
        const analysis = analyzeComponentBody(node.body, checker);
        const propsType = getPropsType(node, checker);

        components.push({
          symbolId,
          isClient,
          isServerAction,
          hasState: analysis.hasState,
          contextProviders: analysis.contextProviders,
          contextConsumers: analysis.contextConsumers,
          propsType,
        });
      }

      // Variable declaration components (arrow functions, memo, forwardRef)
      if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (!ts.isIdentifier(decl.name)) continue;
          const name = decl.name.text;
          if (!/^[A-Z]/.test(name)) continue;

          const init = decl.initializer;
          if (!init) continue;

          let body: ts.Node | undefined;
          let funcNode: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression | undefined;

          if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
            body = init.body;
            funcNode = init;
          } else if (ts.isCallExpression(init)) {
            // React.memo() / React.forwardRef() wrappers
            for (const arg of init.arguments) {
              if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
                body = arg.body;
                funcNode = arg;
                break;
              }
            }
          }

          if (!body || !containsJsx(body)) continue;

          const symbolId = `${relPath}::${name}#component`;
          const analysis = analyzeComponentBody(body, checker);
          const propsType = funcNode ? getPropsType(funcNode, checker) : null;

          components.push({
            symbolId,
            isClient,
            isServerAction,
            hasState: analysis.hasState,
            contextProviders: analysis.contextProviders,
            contextConsumers: analysis.contextConsumers,
            propsType,
          });
        }
      }
    });
  }

  // Write to database
  writeComponents(db, components);
  return components.length;
}

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

function writeComponents(
  db: Database.Database,
  components: ComponentInfo[],
): void {
  if (components.length === 0) return;

  // Clear existing components and re-insert
  db.prepare("DELETE FROM components").run();

  const insert = db.prepare(`
    INSERT OR IGNORE INTO components (
      symbol_id, is_client, is_server_action, has_state,
      context_providers, context_consumers, props_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const run = db.transaction(() => {
    for (const c of components) {
      // Only insert if the symbol exists in the symbols table
      const exists = db
        .prepare("SELECT 1 FROM symbols WHERE id = ?")
        .get(c.symbolId);
      if (!exists) continue;

      insert.run(
        c.symbolId,
        c.isClient ? 1 : 0,
        c.isServerAction ? 1 : 0,
        c.hasState ? 1 : 0,
        JSON.stringify(c.contextProviders),
        JSON.stringify(c.contextConsumers),
        c.propsType,
      );
    }
  });

  run();
}
