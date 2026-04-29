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

export interface PythonRoute {
  id: string;
  routePath: string;
  kind: "api-route";
  httpMethods: string[];
  hasAuth: boolean;
}

const FASTAPI_HTTP_METHODS = new Set([
  "get",
  "post",
  "put",
  "delete",
  "patch",
  "head",
  "options",
]);

/**
 * Extract FastAPI and Flask routes from a parsed Python file.
 */
export function extractPythonRoutes(
  tree: { rootNode: TreeSitterNode },
  _relativePath: string,
): PythonRoute[] {
  const routes: PythonRoute[] = [];

  const decoratedDefs = findAllNodes(tree.rootNode, "decorated_definition");

  for (const decorated of decoratedDefs) {
    const decorators = decorated.namedChildren.filter(
      (c) => c.type === "decorator",
    );

    for (const decorator of decorators) {
      const routeInfo = parseDecorator(decorator);
      if (!routeInfo) continue;

      for (const method of routeInfo.methods) {
        const routePath = routeInfo.path.startsWith("/")
          ? routeInfo.path
          : `/${routeInfo.path}`;

        const id = `route::${routePath.slice(1)}::${method}`;
        routes.push({
          id,
          routePath,
          kind: "api-route",
          httpMethods: [method],
          hasAuth: routeInfo.hasAuth,
        });
      }
    }
  }

  return routes;
}

// --- Decorator parsing ---

interface DecoratorInfo {
  path: string;
  methods: string[];
  hasAuth: boolean;
}

function parseDecorator(decorator: TreeSitterNode): DecoratorInfo | null {
  // The decorator's child is typically a `call` node (e.g., @app.get("/path"))
  const callNode = findFirstChild(decorator, "call");
  if (!callNode) return null;

  const funcNode = callNode.childForFieldName("function");
  if (!funcNode || funcNode.type !== "attribute") return null;

  const attrName = funcNode.childForFieldName("attribute");
  if (!attrName) return null;

  const methodName = attrName.text;

  // FastAPI pattern: @app.get("/path"), @router.post("/path")
  if (FASTAPI_HTTP_METHODS.has(methodName)) {
    const path = getFirstStringArgument(callNode);
    if (path === null) return null;

    const hasAuth = detectAuthInCall(callNode);

    return {
      path,
      methods: [methodName.toUpperCase()],
      hasAuth,
    };
  }

  // Flask pattern: @app.route("/path", methods=["GET", "POST"])
  if (methodName === "route") {
    const path = getFirstStringArgument(callNode);
    if (path === null) return null;

    const methods = getMethodsKeywordArgument(callNode);
    const hasAuth = detectAuthInCall(callNode);

    return {
      path,
      methods: methods.length > 0 ? methods : ["GET"],
      hasAuth,
    };
  }

  return null;
}

// --- Auth detection ---

function detectAuthInCall(callNode: TreeSitterNode): boolean {
  const args = callNode.childForFieldName("arguments");
  if (!args) return false;

  // Check for Depends(auth_...) or dependencies=[Depends(auth_...)] patterns
  const text = args.text;
  if (/Depends\s*\(\s*auth/.test(text)) return true;
  if (/login_required|auth_required|require_auth|jwt_required/.test(text))
    return true;

  return false;
}

// --- Argument helpers ---

function getFirstStringArgument(callNode: TreeSitterNode): string | null {
  const args = callNode.childForFieldName("arguments");
  if (!args) return null;

  for (const child of args.namedChildren) {
    // Skip keyword arguments
    if (child.type === "keyword_argument") continue;

    // Direct string literal
    if (child.type === "string") {
      return stripQuotes(child.text);
    }

    // Might be a concatenated_string or other expression — check children
    const strNode = findFirstChild(child, "string");
    if (strNode) {
      return stripQuotes(strNode.text);
    }
  }

  return null;
}

function getMethodsKeywordArgument(callNode: TreeSitterNode): string[] {
  const args = callNode.childForFieldName("arguments");
  if (!args) return [];

  for (const child of args.namedChildren) {
    if (child.type !== "keyword_argument") continue;

    const nameNode = child.childForFieldName("name");
    if (!nameNode || nameNode.text !== "methods") continue;

    const valueNode = child.childForFieldName("value");
    if (!valueNode) continue;

    // Value should be a list like ["GET", "POST"]
    return extractStringListValues(valueNode);
  }

  return [];
}

function extractStringListValues(node: TreeSitterNode): string[] {
  const values: string[] = [];

  if (node.type === "list") {
    for (const child of node.namedChildren) {
      if (child.type === "string") {
        values.push(stripQuotes(child.text));
      }
    }
  }

  return values;
}

// --- General node helpers ---

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

function findFirstChild(
  node: TreeSitterNode,
  type: string,
): TreeSitterNode | null {
  for (const child of node.namedChildren) {
    if (child.type === type) return child;
  }
  // Also check unnamed children (decorators often have the call as a direct child)
  for (const child of node.children) {
    if (child.type === type) return child;
  }
  return null;
}

function stripQuotes(text: string): string {
  // Handle f-strings, raw strings, byte strings, etc.
  return text.replace(/^[fFrRbBuU]*["']|["']$/g, "");
}
