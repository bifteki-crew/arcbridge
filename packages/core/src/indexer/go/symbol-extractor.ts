import type { ExtractedSymbol, SymbolKind } from "../types.js";

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
 * Extract symbols from a tree-sitter CST of a Go file.
 */
export function extractGoSymbols(
  tree: { rootNode: TreeSitterNode },
  relativePath: string,
  contentHash: string,
): ExtractedSymbol[] {
  const symbols: ExtractedSymbol[] = [];

  const root = tree.rootNode;

  for (const child of root.namedChildren) {
    walkNode(child, relativePath, contentHash, symbols);
  }

  return symbols;
}

function walkNode(
  node: TreeSitterNode,
  relativePath: string,
  contentHash: string,
  symbols: ExtractedSymbol[],
): void {
  switch (node.type) {
    case "function_declaration": {
      const name = getFieldName(node);
      if (!name) break;
      const signature = extractFunctionSignature(node, name);
      const returnType = extractReturnType(node);
      symbols.push(makeSymbol({
        name,
        qualifiedName: name,
        kind: "function",
        node,
        relativePath,
        contentHash,
        docComment: extractDocComment(node),
        signature,
        returnType,
      }));
      return;
    }

    case "method_declaration": {
      const name = getFieldName(node);
      if (!name) break;
      const receiverType = extractReceiverType(node);
      const qualifiedName = receiverType ? `${receiverType}.${name}` : name;
      const signature = extractFunctionSignature(node, name);
      const returnType = extractReturnType(node);
      symbols.push(makeSymbol({
        name,
        qualifiedName,
        kind: "function",
        node,
        relativePath,
        contentHash,
        docComment: extractDocComment(node),
        signature,
        returnType,
      }));
      return;
    }

    case "type_declaration": {
      for (const child of node.namedChildren) {
        if (child.type === "type_spec") {
          extractTypeSpec(child, node, relativePath, contentHash, symbols);
        }
      }
      return;
    }

    case "const_declaration": {
      for (const child of node.namedChildren) {
        if (child.type === "const_spec") {
          const names = getSpecNames(child);
          const doc = extractDocComment(child) ?? extractDocComment(node);
          for (const name of names) {
            symbols.push(makeSymbol({
              name,
              qualifiedName: name,
              kind: "constant",
              node: child,
              relativePath,
              contentHash,
              docComment: doc,
            }));
          }
        }
      }
      return;
    }

    case "var_declaration": {
      for (const child of node.namedChildren) {
        if (child.type === "var_spec") {
          const names = getSpecNames(child);
          const doc = extractDocComment(child) ?? extractDocComment(node);
          for (const name of names) {
            symbols.push(makeSymbol({
              name,
              qualifiedName: name,
              kind: "variable",
              node: child,
              relativePath,
              contentHash,
              docComment: doc,
            }));
          }
        }
      }
      return;
    }
  }

  // Continue walking for nodes not handled above
  for (const child of node.namedChildren) {
    walkNode(child, relativePath, contentHash, symbols);
  }
}

function extractTypeSpec(
  spec: TreeSitterNode,
  parentDecl: TreeSitterNode,
  relativePath: string,
  contentHash: string,
  symbols: ExtractedSymbol[],
): void {
  const name = getFieldName(spec);
  if (!name) return;

  const typeNode = spec.childForFieldName("type");
  let kind: SymbolKind = "type";

  if (typeNode) {
    if (typeNode.type === "struct_type") {
      kind = "class";
    } else if (typeNode.type === "interface_type") {
      kind = "interface";
    }
  }

  symbols.push(makeSymbol({
    name,
    qualifiedName: name,
    kind,
    node: spec,
    relativePath,
    contentHash,
    docComment: extractDocComment(spec) ?? extractDocComment(parentDecl),
  }));
}

interface MakeSymbolArgs {
  name: string;
  qualifiedName: string;
  kind: SymbolKind;
  node: TreeSitterNode;
  relativePath: string;
  contentHash: string;
  docComment: string | null;
  signature?: string | null;
  returnType?: string | null;
}

function makeSymbol(args: MakeSymbolArgs): ExtractedSymbol {
  const { name, qualifiedName, kind, node, relativePath, contentHash, docComment } = args;
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
    docComment,
    isExported: /^[A-Z]/.test(name),
    isAsync: false,
    contentHash,
  };
}

function getFieldName(node: TreeSitterNode): string | null {
  const nameNode = node.childForFieldName("name");
  if (nameNode) return nameNode.text;

  // Fallback: find first identifier child
  for (const child of node.namedChildren) {
    if (child.type === "identifier") return child.text;
  }
  return null;
}

/**
 * Get all declared names from a const_spec or var_spec.
 * Handles multi-name declarations like `var x, y, z int`.
 */
function getSpecNames(node: TreeSitterNode): string[] {
  const names: string[] = [];
  for (const child of node.namedChildren) {
    if (child.type === "identifier") {
      names.push(child.text);
    } else {
      // Stop at type or value nodes
      break;
    }
  }
  return names;
}

/**
 * Extract the receiver type from a method_declaration.
 * The receiver is in a `parameter_list` field named "receiver".
 * Strips pointer prefix (*) from the type name.
 */
function extractReceiverType(node: TreeSitterNode): string | null {
  const receiver = node.childForFieldName("receiver");
  if (!receiver) return null;

  // The receiver parameter_list contains parameter_declaration(s)
  for (const child of receiver.namedChildren) {
    if (child.type === "parameter_declaration") {
      const typeNode = child.childForFieldName("type");
      if (typeNode) {
        // Handle pointer receiver (*Type)
        if (typeNode.type === "pointer_type") {
          const inner = typeNode.namedChildren[0];
          return inner ? inner.text : typeNode.text.replace(/^\*/, "");
        }
        return typeNode.text;
      }
    }
  }
  return null;
}

function extractDocComment(node: TreeSitterNode): string | null {
  const comments: string[] = [];
  let sibling = node.previousSibling;

  while (sibling) {
    if (sibling.type === "comment" && sibling.text.startsWith("//")) {
      comments.unshift(sibling.text);
    } else {
      // Stop if we hit something that isn't a comment
      break;
    }
    sibling = sibling.previousSibling;
  }

  if (comments.length === 0) return null;

  return comments
    .map((c) => c.replace(/^\s*\/\/\s?/, "").trim())
    .filter(Boolean)
    .join(" ");
}

function extractFunctionSignature(node: TreeSitterNode, name: string): string | null {
  const params = node.childForFieldName("parameters");
  if (!params) return null;
  return `${name}${params.text}`;
}

function extractReturnType(node: TreeSitterNode): string | null {
  const result = node.childForFieldName("result");
  if (!result) return null;
  return result.text;
}
