interface TreeSitterNode {
  type: string;
  text: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  children: TreeSitterNode[];
  childCount: number;
  child(index: number): TreeSitterNode | null;
  namedChildren: TreeSitterNode[];
  childForFieldName(name: string): TreeSitterNode | null;
  previousSibling: TreeSitterNode | null;
  parent: TreeSitterNode | null;
}

export interface GoRoute {
  id: string;
  routePath: string;
  kind: "api-route";
  httpMethods: string[];
  hasAuth: boolean;
}

const GIN_METHODS: Record<string, string> = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  DELETE: "DELETE",
  PATCH: "PATCH",
  HEAD: "HEAD",
  OPTIONS: "OPTIONS",
};

const CHI_METHODS: Record<string, string> = {
  Get: "GET",
  Post: "POST",
  Put: "PUT",
  Delete: "DELETE",
  Patch: "PATCH",
  Head: "HEAD",
  Options: "OPTIONS",
};

const NET_HTTP_METHODS = new Set(["HandleFunc", "Handle"]);

/**
 * Extract HTTP routes from a parsed Go file.
 * Handles Gin, Chi, and net/http patterns.
 */
export function extractGoRoutes(
  tree: { rootNode: TreeSitterNode },
  _relativePath: string,
): GoRoute[] {
  const routes: GoRoute[] = [];

  // Build scoped prefix list (for Gin groups and Chi routes)
  const scopedPrefixes = extractGroupPrefixes(tree.rootNode);

  // Track Chi r.Use() auth middleware at scope level
  const authScopes = findAuthUseScopes(tree.rootNode);

  const calls = findAllNodes(tree.rootNode, "call_expression");

  for (const call of calls) {
    const funcNode = call.childForFieldName("function");
    if (!funcNode || funcNode.type !== "selector_expression") continue;

    const fieldNode = funcNode.childForFieldName("field");
    if (!fieldNode) continue;
    const methodName = fieldNode.text;

    const receiverNode = funcNode.childForFieldName("operand");
    const receiverName = receiverNode?.type === "identifier" ? receiverNode.text : null;

    // Determine which framework and HTTP method
    // For Gin/Chi, the method name maps to a specific HTTP method.
    // For net/http (HandleFunc/Handle), the handler accepts any method —
    // we use an empty array to signal "any/unknown" rather than misreporting.
    let httpMethods: string[] | null = null;
    let isNetHttp = false;

    if (GIN_METHODS[methodName]) {
      httpMethods = [GIN_METHODS[methodName]];
    } else if (CHI_METHODS[methodName]) {
      httpMethods = [CHI_METHODS[methodName]];
    } else if (NET_HTTP_METHODS.has(methodName)) {
      httpMethods = [];
      isNetHttp = true;
    }

    if (httpMethods === null) continue;

    // Extract route path from first string argument
    const routeTemplate = getFirstStringArgument(call);
    if (routeTemplate === null) continue;

    // Determine prefix from group (scope-aware)
    const prefix = receiverName ? resolvePrefix(receiverName, call, scopedPrefixes) : "";

    // Build full route path
    let routePath: string;
    if (prefix && routeTemplate) {
      routePath = `${prefix}/${routeTemplate}`.replace(/\/{2,}/g, "/");
    } else if (prefix) {
      routePath = prefix;
    } else {
      routePath = routeTemplate;
    }
    routePath = routePath.startsWith("/") ? routePath : `/${routePath}`;
    routePath = routePath.replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/";

    // Auth detection
    let hasAuth = false;
    if (!isNetHttp) {
      // Check if any argument contains "auth" or "Auth" (Gin pattern)
      hasAuth = hasAuthArgument(call);
      // Check if within a Chi auth scope
      if (!hasAuth && authScopes.length > 0) {
        hasAuth = isInsideAuthScope(call, authScopes);
      }
    }

    const cleanPath = routePath.slice(1) || "";
    const idMethod = httpMethods.length > 0 ? httpMethods.join(",") : "ANY";
    const id = `route::${cleanPath}::${idMethod}`;

    routes.push({
      id,
      routePath,
      kind: "api-route",
      httpMethods,
      hasAuth,
    });
  }

  return routes;
}

// --- Group prefix extraction ---

/** A prefix entry scoped to a specific func_literal (or null for top-level assignments) */
interface ScopedPrefix {
  varName: string;
  prefix: string;
  // Scope node this prefix is valid in (func_literal, function_declaration,
  // or method_declaration). null = truly file-level (e.g. package-scoped var).
  scope: TreeSitterNode | null;
}

function extractGroupPrefixes(
  root: TreeSitterNode,
): ScopedPrefix[] {
  const prefixes: ScopedPrefix[] = [];
  const calls = findAllNodes(root, "call_expression");

  for (const call of calls) {
    const funcNode = call.childForFieldName("function");
    if (funcNode?.type !== "selector_expression") continue;

    const fieldNode = funcNode.childForFieldName("field");
    const methodName = fieldNode?.text;

    if (methodName !== "Group" && methodName !== "Route") continue;

    const prefix = getFirstStringArgument(call);
    if (prefix === null) continue;

    // Gin: api := r.Group("/api")
    // AST: short_var_declaration > expression_list > call_expression
    const assignNode = findAncestor(call, ["short_var_declaration", "assignment_statement"]);
    if (assignNode) {
      const left = assignNode.childForFieldName("left");
      if (left) {
        const varNode = left.type === "expression_list"
          ? left.namedChildren[0]
          : left;
        if (varNode?.type === "identifier") {
          // Scope to the nearest enclosing function body — most Gin setups
          // use a normal function_declaration, not a func_literal.
          const scope = findAncestor(call, [
            "func_literal",
            "function_declaration",
            "method_declaration",
          ]);
          prefixes.push({ varName: varNode.text, prefix, scope });
        }
      }
    }

    // Chi: r.Route("/admin", func(r chi.Router) { ... })
    // The inner "r" parameter shadows the outer — routes inside the func_literal
    // use that parameter name with this prefix.
    if (methodName === "Route") {
      const argList = findChild(call, "argument_list");
      if (argList) {
        for (const arg of argList.namedChildren) {
          if (arg.type === "func_literal") {
            const paramList = arg.childForFieldName("parameters");
            if (paramList) {
              const firstParam = paramList.namedChildren[0];
              if (firstParam?.type === "parameter_declaration") {
                const paramName = firstParam.childForFieldName("name");
                if (paramName?.type === "identifier") {
                  prefixes.push({ varName: paramName.text, prefix, scope: arg });
                }
              }
            }
          }
        }
      }
    }
  }

  return prefixes;
}

/** Find the prefix for a given receiver name, respecting scope. */
function resolvePrefix(
  receiverName: string,
  callNode: TreeSitterNode,
  scopedPrefixes: ScopedPrefix[],
): string {
  // Find the most specific (innermost scope) matching prefix
  let best: ScopedPrefix | null = null;

  for (const sp of scopedPrefixes) {
    if (sp.varName !== receiverName) continue;

    if (sp.scope === null) {
      // File-level prefix — use as fallback
      if (!best) best = sp;
    } else {
      // Check if callNode is inside this scope
      if (isDescendantOf(callNode, sp.scope)) {
        // Prefer more specific (narrower) scope
        if (!best || best.scope === null || isDescendantOf(sp.scope, best.scope)) {
          best = sp;
        }
      }
    }
  }

  return best?.prefix ?? "";
}

function isSameNode(a: TreeSitterNode, b: TreeSitterNode): boolean {
  return a.type === b.type
    && a.startPosition.row === b.startPosition.row
    && a.startPosition.column === b.startPosition.column
    && a.endPosition.row === b.endPosition.row
    && a.endPosition.column === b.endPosition.column;
}

function isDescendantOf(node: TreeSitterNode, ancestor: TreeSitterNode): boolean {
  let current: TreeSitterNode | null = node.parent;
  while (current) {
    if (isSameNode(current, ancestor)) return true;
    current = current.parent;
  }
  return false;
}

function findAncestor(node: TreeSitterNode, types: string[]): TreeSitterNode | null {
  let current: TreeSitterNode | null = node.parent;
  while (current) {
    if (types.includes(current.type)) return current;
    current = current.parent;
  }
  return null;
}

// --- Auth detection ---

/** Find scopes (func_literal nodes) that contain r.Use(authMiddleware) */
function findAuthUseScopes(root: TreeSitterNode): TreeSitterNode[] {
  const scopes: TreeSitterNode[] = [];
  const calls = findAllNodes(root, "call_expression");

  for (const call of calls) {
    const funcNode = call.childForFieldName("function");
    if (funcNode?.type !== "selector_expression") continue;

    const fieldNode = funcNode.childForFieldName("field");
    if (fieldNode?.text !== "Use") continue;

    // Check if any argument references auth
    if (hasAuthArgument(call)) {
      // Scope is the nearest enclosing function/method body or func_literal.
      // We deliberately do NOT fall back to source_file — a top-level Use()
      // (which would be unusual) shouldn't mark every route in the file as auth.
      let scope: TreeSitterNode | null = call.parent;
      while (
        scope &&
        scope.type !== "func_literal" &&
        scope.type !== "function_declaration" &&
        scope.type !== "method_declaration"
      ) {
        scope = scope.parent;
      }
      if (scope) {
        scopes.push(scope);
      }
    }
  }

  return scopes;
}

function isInsideAuthScope(node: TreeSitterNode, scopes: TreeSitterNode[]): boolean {
  let current: TreeSitterNode | null = node.parent;
  while (current) {
    for (const scope of scopes) {
      if (isSameNode(current, scope)) return true;
    }
    current = current.parent;
  }
  return false;
}

function hasAuthArgument(call: TreeSitterNode): boolean {
  const argList = findChild(call, "argument_list");
  if (!argList) return false;

  for (const arg of argList.namedChildren) {
    const text = arg.text;
    if (/[Aa]uth/.test(text)) return true;
  }
  return false;
}

// --- Node helpers ---

function findChild(node: TreeSitterNode, type: string): TreeSitterNode | null {
  for (const child of node.namedChildren) {
    if (child.type === type) return child;
  }
  return null;
}

function findAllNodes(root: TreeSitterNode, type: string): TreeSitterNode[] {
  const results: TreeSitterNode[] = [];
  function walk(node: TreeSitterNode): void {
    if (node.type === type) results.push(node);
    for (const child of node.namedChildren) {
      walk(child);
    }
  }
  walk(root);
  return results;
}

function getFirstStringArgument(node: TreeSitterNode): string | null {
  const argList = findChild(node, "argument_list");
  if (!argList) return null;

  for (const arg of argList.namedChildren) {
    if (arg.type === "interpreted_string_literal") {
      // Remove surrounding double quotes
      return arg.text.replace(/^"|"$/g, "");
    }
    if (arg.type === "raw_string_literal") {
      // Remove surrounding backticks
      return arg.text.replace(/^`|`$/g, "");
    }
  }
  return null;
}
