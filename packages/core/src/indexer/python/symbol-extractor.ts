import type { ExtractedSymbol, SymbolKind } from "../types.js";
import { hashContent } from "../content-hash.js";

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

/**
 * Extract symbols from a tree-sitter CST of a Python file.
 */
export function extractPythonSymbols(
  tree: { rootNode: TreeSitterNode },
  relativePath: string,
  fileContent: string,
): ExtractedSymbol[] {
  const symbols: ExtractedSymbol[] = [];
  const contentHash = hashContent(fileContent);

  const root = tree.rootNode;

  for (const child of root.namedChildren) {
    walkNode(child, null, relativePath, contentHash, symbols);
  }

  return symbols;
}

function walkNode(
  node: TreeSitterNode,
  currentClassName: string | null,
  relativePath: string,
  contentHash: string,
  symbols: ExtractedSymbol[],
): void {
  switch (node.type) {
    case "decorated_definition": {
      // A decorated_definition wraps a function_definition or class_definition
      // with one or more decorator nodes. Extract decorators, then process the inner definition.
      const decorators = extractDecorators(node);
      const definition = findChild(node, "function_definition") ?? findChild(node, "class_definition");
      if (definition) {
        walkDefinitionNode(definition, currentClassName, relativePath, contentHash, symbols, decorators);
      }
      return;
    }

    case "function_definition":
    case "class_definition":
      walkDefinitionNode(node, currentClassName, relativePath, contentHash, symbols, []);
      return;

    case "expression_statement": {
      // Module-level assignments (constants/variables)
      if (!currentClassName) {
        extractAssignment(node, relativePath, contentHash, symbols);
      }
      return;
    }
  }

  // Continue walking for nodes not handled above
  for (const child of node.namedChildren) {
    walkNode(child, currentClassName, relativePath, contentHash, symbols);
  }
}

function walkDefinitionNode(
  node: TreeSitterNode,
  currentClassName: string | null,
  relativePath: string,
  contentHash: string,
  symbols: ExtractedSymbol[],
  decorators: string[],
): void {
  if (node.type === "function_definition") {
    const name = getIdentifierName(node);
    if (!name) return;

    const isMethod = currentClassName !== null;
    const qualifiedName = isMethod ? `${currentClassName}.${name}` : name;
    const isAsync = hasAsyncKeyword(node);
    const signature = extractFunctionSignature(node);
    const returnType = extractReturnType(node);
    const docComment = extractDocstring(node);
    const decoratorText = decorators.length > 0 ? decorators.join("\n") : null;
    const fullDocComment = decoratorText
      ? (docComment ? `${decoratorText}\n${docComment}` : decoratorText)
      : docComment;

    symbols.push(makeSymbol({
      name,
      qualifiedName,
      kind: "function",
      node,
      relativePath,
      contentHash,
      isExported: !name.startsWith("_"),
      isAsync,
      signature,
      returnType,
      docComment: fullDocComment,
    }));

    // Don't walk into function bodies for nested functions (keep it flat like C#)
    return;
  }

  if (node.type === "class_definition") {
    const name = getIdentifierName(node);
    if (!name) return;

    const qualifiedName = currentClassName ? `${currentClassName}.${name}` : name;
    const docComment = extractDocstring(node);
    const decoratorText = decorators.length > 0 ? decorators.join("\n") : null;
    const fullDocComment = decoratorText
      ? (docComment ? `${decoratorText}\n${docComment}` : decoratorText)
      : docComment;

    symbols.push(makeSymbol({
      name,
      qualifiedName,
      kind: "class",
      node,
      relativePath,
      contentHash,
      isExported: !name.startsWith("_"),
      docComment: fullDocComment,
    }));

    // Walk class body for methods
    const body = findChild(node, "block");
    if (body) {
      for (const child of body.namedChildren) {
        walkNode(child, qualifiedName, relativePath, contentHash, symbols);
      }
    }
    return;
  }
}

/**
 * Extract module-level assignments as variable/constant symbols.
 * Handles: `NAME = expr`, `NAME: type = expr`, `NAME: type`
 */
function extractAssignment(
  node: TreeSitterNode,
  relativePath: string,
  contentHash: string,
  symbols: ExtractedSymbol[],
): void {
  // expression_statement contains an assignment (we skip augmented_assignment
  // like `FOO += 1` since those modify rather than define symbols)
  const assignment = findChild(node, "assignment");
  if (!assignment) return;

  // Left side should be a simple identifier
  const left = assignment.childForFieldName("left") ?? assignment.namedChildren[0];
  if (!left || left.type !== "identifier") return;

  const name = left.text;
  // Skip dunder variables and private variables that aren't meaningful symbols
  if (name.startsWith("__") && name.endsWith("__")) return;

  const isAllCaps = /^[A-Z][A-Z0-9_]*$/.test(name);
  const kind: SymbolKind = isAllCaps ? "constant" : "variable";

  // Try to extract type annotation
  const typeNode = assignment.childForFieldName("type");
  const returnType = typeNode ? typeNode.text : null;

  symbols.push(makeSymbol({
    name,
    qualifiedName: name,
    kind,
    node: assignment,
    relativePath,
    contentHash,
    isExported: !name.startsWith("_"),
    returnType,
  }));
}

interface MakeSymbolArgs {
  name: string;
  qualifiedName: string;
  kind: SymbolKind;
  node: TreeSitterNode;
  relativePath: string;
  contentHash: string;
  isExported?: boolean;
  docComment?: string | null;
  signature?: string | null;
  returnType?: string | null;
  isAsync?: boolean;
}

function makeSymbol(args: MakeSymbolArgs): ExtractedSymbol {
  const { name, qualifiedName, kind, node, relativePath, contentHash } = args;
  return {
    id: `${relativePath}::${qualifiedName}#${kind}`,
    name,
    qualifiedName,
    kind,
    filePath: relativePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    startCol: node.startPosition.column + 1,
    endCol: node.endPosition.column + 1,
    signature: args.signature ?? null,
    returnType: args.returnType ?? null,
    docComment: args.docComment ?? null,
    isExported: args.isExported ?? true,
    isAsync: args.isAsync ?? false,
    contentHash,
  };
}

function getIdentifierName(node: TreeSitterNode): string | null {
  const nameNode = node.childForFieldName("name");
  if (nameNode) return nameNode.text;

  // Fallback: find first identifier child
  for (const child of node.namedChildren) {
    if (child.type === "identifier") return child.text;
  }
  return null;
}

function findChild(node: TreeSitterNode, type: string): TreeSitterNode | null {
  for (const child of node.namedChildren) {
    if (child.type === type) return child;
  }
  return null;
}

/**
 * Check if a function_definition has an `async` keyword.
 * In tree-sitter-python, async functions have "async" as a child token.
 */
function hasAsyncKeyword(node: TreeSitterNode): boolean {
  for (const child of node.children) {
    if (child.type === "async") return true;
    // Stop after we reach the "def" keyword
    if (child.type === "def") break;
  }
  return false;
}

/**
 * Extract the function signature (parameter list text).
 */
function extractFunctionSignature(node: TreeSitterNode): string | null {
  const params = node.childForFieldName("parameters") ?? findChild(node, "parameters");
  if (!params) return null;

  const name = getIdentifierName(node) ?? "func";
  return `${name}${params.text}`;
}

/**
 * Extract return type annotation (the `-> Type` part).
 * In tree-sitter-python, function_definition has a "return_type" field
 * containing the type node from the `-> Type` annotation.
 */
function extractReturnType(node: TreeSitterNode): string | null {
  const returnType = node.childForFieldName("return_type");
  if (returnType) return returnType.text;
  return null;
}

/**
 * Extract docstring from the first statement in a function/class body.
 * A docstring is the first expression_statement containing a string literal.
 */
function extractDocstring(node: TreeSitterNode): string | null {
  const body = findChild(node, "block");
  if (!body || body.namedChildren.length === 0) return null;

  const firstStmt = body.namedChildren[0];
  if (firstStmt.type !== "expression_statement") return null;

  const expr = firstStmt.namedChildren[0];
  if (!expr || expr.type !== "string") return null;

  // Strip triple quotes and clean up
  let text = expr.text;
  // Remove triple-quote delimiters (""" or ''')
  if (text.startsWith('"""') && text.endsWith('"""')) {
    text = text.slice(3, -3);
  } else if (text.startsWith("'''") && text.endsWith("'''")) {
    text = text.slice(3, -3);
  } else if (text.startsWith('"') && text.endsWith('"')) {
    text = text.slice(1, -1);
  } else if (text.startsWith("'") && text.endsWith("'")) {
    text = text.slice(1, -1);
  }

  return text.trim() || null;
}

/**
 * Extract decorator strings from a decorated_definition node.
 */
function extractDecorators(node: TreeSitterNode): string[] {
  const decorators: string[] = [];
  for (const child of node.namedChildren) {
    if (child.type === "decorator") {
      decorators.push(child.text);
    }
  }
  return decorators;
}
