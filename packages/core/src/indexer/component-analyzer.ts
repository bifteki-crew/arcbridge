import ts from "typescript";
import { relative } from "node:path";
import type { Database } from "../db/connection.js";
import { transaction } from "../db/connection.js";
import { containsJsx } from "./react-utils.js";

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
  _checker: ts.TypeChecker,
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
 * @param allClient - When true, all components are treated as client-side
 *   (e.g., react-vite where there's no server component concept).
 */
export function analyzeComponents(
  sourceFiles: readonly ts.SourceFile[],
  checker: ts.TypeChecker,
  projectRoot: string,
  db: Database,
  allClient = false,
): number {
  const components: ComponentInfo[] = [];

  for (const sf of sourceFiles) {
    const relPath = relative(projectRoot, sf.fileName);
    const directive = getFileDirective(sf);
    // In client-only frameworks (react-vite), all components are client
    const isClient = allClient || directive === "use client";
    const isServerAction = !allClient && directive === "use server";

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

      // Angular @Component class detection
      if (ts.isClassDeclaration(node) && node.name && node.modifiers) {
        const componentDecorator = node.modifiers.find(
          (mod): mod is ts.Decorator =>
            ts.isDecorator(mod) &&
            ts.isCallExpression(mod.expression) &&
            ts.isIdentifier(mod.expression.expression) &&
            mod.expression.expression.text === "Component",
        );

        if (componentDecorator && ts.isCallExpression(componentDecorator.expression)) {
          const name = node.name.text;
          // Align with TypeScript symbol extractor which indexes classes as #class
          const symbolId = `${relPath}::${name}#class`;

          // Extract selector from @Component metadata
          let propsType: string | null = null;
          const metaArg = componentDecorator.expression.arguments[0];
          if (metaArg && ts.isObjectLiteralExpression(metaArg)) {
            const selectorProp = metaArg.properties.find(
              (p): p is ts.PropertyAssignment =>
                ts.isPropertyAssignment(p) &&
                ts.isIdentifier(p.name) &&
                p.name.text === "selector",
            );
            if (selectorProp && ts.isStringLiteral(selectorProp.initializer)) {
              propsType = `selector: ${selectorProp.initializer.text}`;
            }
          }

          // Check for signal-based state (signal(), computed())
          let hasState = false;
          if (node.members) {
            for (const member of node.members) {
              if (ts.isPropertyDeclaration(member) && member.initializer) {
                const initText = member.initializer.getText(sf);
                if (/\bsignal\s*\(/.test(initText) || /\bcomputed\s*\(/.test(initText)) {
                  hasState = true;
                  break;
                }
              }
            }
          }

          // Extract imports array (standalone component dependencies)
          const componentImports: string[] = [];
          if (metaArg && ts.isObjectLiteralExpression(metaArg)) {
            const importsProp = metaArg.properties.find(
              (p): p is ts.PropertyAssignment =>
                ts.isPropertyAssignment(p) &&
                ts.isIdentifier(p.name) &&
                p.name.text === "imports",
            );
            if (importsProp && ts.isArrayLiteralExpression(importsProp.initializer)) {
              for (const el of importsProp.initializer.elements) {
                if (ts.isIdentifier(el)) {
                  componentImports.push(el.text);
                }
              }
            }
          }

          components.push({
            symbolId,
            isClient: true, // Angular components are always client-side
            isServerAction: false,
            hasState,
            contextProviders: [],
            contextConsumers: componentImports, // Reuse field for Angular component imports
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

function writeComponents(
  db: Database,
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

  // Build set of existing symbol IDs for bulk lookup (avoids N+1 queries)
  const existingIds = new Set(
    (db.prepare("SELECT id FROM symbols").all() as { id: string }[]).map((r) => r.id),
  );

  transaction(db, () => {
    for (const c of components) {
      if (!existingIds.has(c.symbolId)) continue;

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

}
