interface TreeSitterNode {
  type: string;
  text: string;
  namedChildren: TreeSitterNode[];
  children: TreeSitterNode[];
  childForFieldName(name: string): TreeSitterNode | null;
  parent: TreeSitterNode | null;
}

export interface CSharpRoute {
  id: string;
  routePath: string;
  kind: "api-route";
  httpMethods: string[];
  hasAuth: boolean;
  handlerSymbolId?: string;
}

const HTTP_ATTRIBUTE_MAP: Record<string, string> = {
  HttpGet: "GET",
  HttpPost: "POST",
  HttpPut: "PUT",
  HttpDelete: "DELETE",
  HttpPatch: "PATCH",
  HttpHead: "HEAD",
  HttpOptions: "OPTIONS",
};

const MINIMAL_API_MAP: Record<string, string> = {
  MapGet: "GET",
  MapPost: "POST",
  MapPut: "PUT",
  MapDelete: "DELETE",
  MapPatch: "PATCH",
};

/**
 * Extract ASP.NET routes from a parsed C# file.
 * Handles both controller-based and minimal API patterns.
 */
export function extractCSharpRoutes(
  tree: { rootNode: TreeSitterNode },
  relativePath: string,
): CSharpRoute[] {
  const routes: CSharpRoute[] = [];

  extractControllerRoutes(tree.rootNode, routes, relativePath);
  extractMinimalApiRoutes(tree.rootNode, routes, relativePath);

  return routes;
}

// --- Controller-based routes ---

function extractControllerRoutes(
  root: TreeSitterNode,
  routes: CSharpRoute[],
  relativePath: string,
): void {
  const classes = findAllNodes(root, "class_declaration");

  for (const cls of classes) {
    if (!isControllerClass(cls)) continue;

    const classRoute = getRoutePrefix(cls);
    const className = getIdentifier(cls);
    const classHasAuth = hasAuthorizeAttribute(cls);

    // Find methods with HTTP attributes
    const methods = findAllNodes(cls, "method_declaration");
    for (const method of methods) {
      const httpInfo = getHttpMethodFromAttributes(method);
      if (!httpInfo) continue;

      const methodName = getIdentifier(method);
      const methodHasAuth = hasAuthorizeAttribute(method);

      // Build route path
      let routePath = classRoute ?? "";
      if (httpInfo.template) {
        routePath = routePath ? `${routePath}/${httpInfo.template}` : httpInfo.template;
      }

      // Replace [controller] placeholder
      if (className && routePath.includes("[controller]")) {
        const controllerName = className.replace(/Controller$/, "").toLowerCase();
        routePath = routePath.replace("[controller]", controllerName);
      }

      // Ensure leading slash
      routePath = routePath.startsWith("/") ? routePath : `/${routePath}`;

      const id = `route::${routePath.slice(1)}::${httpInfo.method}`;
      routes.push({
        id,
        routePath,
        kind: "api-route",
        httpMethods: [httpInfo.method],
        hasAuth: classHasAuth || methodHasAuth,
      });
    }
  }
}

function isControllerClass(node: TreeSitterNode): boolean {
  // Check for [ApiController] attribute
  if (hasAttribute(node, "ApiController")) return true;

  // Check for ControllerBase in base list
  const baseList = findChild(node, "base_list");
  if (baseList && baseList.text.includes("ControllerBase")) return true;
  if (baseList && baseList.text.includes("Controller")) return true;

  return false;
}

function getRoutePrefix(node: TreeSitterNode): string | null {
  const attrs = getAttributes(node);
  for (const attr of attrs) {
    const name = getAttributeName(attr);
    if (name === "Route") {
      return getAttributeArgument(attr);
    }
  }
  return null;
}

function getHttpMethodFromAttributes(
  node: TreeSitterNode,
): { method: string; template: string | null } | null {
  const attrs = getAttributes(node);
  for (const attr of attrs) {
    const name = getAttributeName(attr);
    if (!name) continue;

    const httpMethod = HTTP_ATTRIBUTE_MAP[name];
    if (httpMethod) {
      return { method: httpMethod, template: getAttributeArgument(attr) };
    }
  }
  return null;
}

function hasAuthorizeAttribute(node: TreeSitterNode): boolean {
  return hasAttribute(node, "Authorize");
}

// --- Minimal API routes ---

function extractMinimalApiRoutes(
  root: TreeSitterNode,
  routes: CSharpRoute[],
  _relativePath: string,
): void {
  // Find MapGroup calls to track prefixes
  const groupPrefixes = new Map<string, string>();
  extractGroupPrefixes(root, groupPrefixes);

  // Find Map{Method} calls
  const invocations = findAllNodes(root, "invocation_expression");
  for (const invocation of invocations) {
    const methodName = getInvokedMethodName(invocation);
    if (!methodName) continue;

    const httpMethod = MINIMAL_API_MAP[methodName];
    if (!httpMethod) continue;

    // Get the route template from the first argument
    const template = getFirstStringArgument(invocation);
    if (template === null) continue;

    // Determine the receiver to check for group prefix
    const receiver = getReceiverName(invocation);
    const prefix = receiver ? (groupPrefixes.get(receiver) ?? "") : "";

    // Check for .RequireAuthorization() in the chain
    const hasAuth = hasRequireAuthorization(invocation);

    let routePath: string;
    if (prefix && template) {
      routePath = `${prefix}/${template}`;
    } else if (prefix) {
      routePath = prefix;
    } else {
      routePath = template;
    }
    routePath = routePath.startsWith("/") ? routePath : `/${routePath}`;
    // Clean up multiple slashes and trailing slashes (but keep root /)
    routePath = routePath.replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/";

    const id = `route::${routePath.slice(1)}::${httpMethod}`;
    routes.push({
      id,
      routePath,
      kind: "api-route",
      httpMethods: [httpMethod],
      hasAuth,
    });
  }
}

function extractGroupPrefixes(
  node: TreeSitterNode,
  prefixes: Map<string, string>,
): void {
  if (node.type === "invocation_expression") {
    const methodName = getInvokedMethodName(node);
    if (methodName === "MapGroup") {
      const prefix = getFirstStringArgument(node);
      if (prefix !== null) {
        // Find the variable this is assigned to
        const parent = node.parent;
        if (parent?.type === "variable_declarator") {
          const varName = getIdentifier(parent);
          if (varName) {
            prefixes.set(varName, prefix);
          }
        } else if (parent?.type === "equals_value_clause") {
          const grandParent = parent.parent;
          if (grandParent?.type === "variable_declarator") {
            const varName = getIdentifier(grandParent);
            if (varName) {
              prefixes.set(varName, prefix);
            }
          }
        }
      }
    }
  }

  for (const child of node.namedChildren) {
    extractGroupPrefixes(child, prefixes);
  }
}

function hasRequireAuthorization(node: TreeSitterNode): boolean {
  // Check if the invocation is part of a chain that includes .RequireAuthorization()
  // Pattern: mapCall(...).RequireAuthorization(...)
  let current: TreeSitterNode | null = node.parent;

  // Walk up looking for member_access_expression → invocation_expression patterns
  while (current) {
    if (current.type === "invocation_expression") {
      const methodName = getInvokedMethodName(current);
      if (methodName === "RequireAuthorization") return true;
    }
    if (current.type === "member_access_expression") {
      current = current.parent;
      continue;
    }
    // Check if we're inside a larger expression statement
    if (current.type === "expression_statement") {
      // Search the full text for RequireAuthorization
      if (current.text.includes("RequireAuthorization")) return true;
      break;
    }
    current = current.parent;
  }

  return false;
}

// --- Attribute helpers ---

function getAttributes(node: TreeSitterNode): TreeSitterNode[] {
  const attrs: TreeSitterNode[] = [];
  for (const child of node.namedChildren) {
    if (child.type === "attribute_list") {
      for (const attr of child.namedChildren) {
        if (attr.type === "attribute") {
          attrs.push(attr);
        }
      }
    }
  }
  return attrs;
}

function hasAttribute(node: TreeSitterNode, name: string): boolean {
  const attrs = getAttributes(node);
  return attrs.some((a) => getAttributeName(a) === name);
}

function getAttributeName(attr: TreeSitterNode): string | null {
  const nameNode = attr.childForFieldName("name");
  if (nameNode) return nameNode.text;
  for (const child of attr.namedChildren) {
    if (child.type === "identifier") return child.text;
  }
  return null;
}

function getAttributeArgument(attr: TreeSitterNode): string | null {
  const argList = findChild(attr, "attribute_argument_list");
  if (!argList) return null;

  // Find the first string literal argument
  for (const arg of argList.namedChildren) {
    const expr = arg.type === "attribute_argument"
      ? arg.namedChildren[0]
      : arg;
    if (expr?.type === "string_literal" || expr?.type === "verbatim_string_literal") {
      // Remove quotes
      return expr.text.replace(/^[@$]*"|"$/g, "");
    }
  }

  // Check for named arguments like Name = "..."
  for (const arg of argList.namedChildren) {
    for (const child of arg.namedChildren) {
      if (child.type === "string_literal" || child.type === "verbatim_string_literal") {
        return child.text.replace(/^[@$]*"|"$/g, "");
      }
    }
  }

  return null;
}

// --- General node helpers ---

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

function getIdentifier(node: TreeSitterNode): string | null {
  const nameNode = node.childForFieldName("name");
  if (nameNode) return nameNode.text;
  for (const child of node.namedChildren) {
    if (child.type === "identifier") return child.text;
  }
  return null;
}

function getInvokedMethodName(node: TreeSitterNode): string | null {
  const funcNode = node.childForFieldName("function");
  if (!funcNode) return node.namedChildren[0]?.text ?? null;

  if (funcNode.type === "member_access_expression") {
    const nameNode = funcNode.childForFieldName("name");
    return nameNode?.text ?? null;
  }
  if (funcNode.type === "identifier") {
    return funcNode.text;
  }
  return null;
}

function getReceiverName(node: TreeSitterNode): string | null {
  const funcNode = node.childForFieldName("function");
  if (!funcNode || funcNode.type !== "member_access_expression") return null;
  const expr = funcNode.childForFieldName("expression");
  if (expr?.type === "identifier") return expr.text;
  return null;
}

function getFirstStringArgument(node: TreeSitterNode): string | null {
  const argList = findChild(node, "argument_list");
  if (!argList) return null;

  for (const arg of argList.namedChildren) {
    const expr = arg.type === "argument" ? arg.namedChildren[0] : arg;
    if (expr?.type === "string_literal" || expr?.type === "verbatim_string_literal") {
      return expr.text.replace(/^[@$]*"|"$/g, "");
    }
  }
  return null;
}
