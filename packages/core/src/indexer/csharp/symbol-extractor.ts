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
 * Extract symbols from a tree-sitter CST of a C# file.
 */
export function extractCSharpSymbols(
  tree: { rootNode: TreeSitterNode },
  relativePath: string,
  fileContent: string,
): ExtractedSymbol[] {
  const symbols: ExtractedSymbol[] = [];
  const contentHash = hashContent(fileContent);

  // Handle file-scoped namespaces: they apply to all subsequent siblings
  const root = tree.rootNode;
  let fileScopedNamespace: string | null = null;

  for (const child of root.namedChildren) {
    if (child.type === "file_scoped_namespace_declaration") {
      fileScopedNamespace = getNamespaceName(child);
      // Also walk children in case grammar nests declarations inside the namespace node
      for (const nested of child.namedChildren) {
        walkNode(nested, fileScopedNamespace, null, relativePath, contentHash, symbols);
      }
      continue;
    }
    walkNode(child, fileScopedNamespace, null, relativePath, contentHash, symbols);
  }

  return symbols;
}

function walkNode(
  node: TreeSitterNode,
  currentNamespace: string | null,
  currentTypeName: string | null,
  relativePath: string,
  contentHash: string,
  symbols: ExtractedSymbol[],
): void {
  switch (node.type) {
    case "namespace_declaration":
    case "file_scoped_namespace_declaration": {
      const nsName = getNamespaceName(node);
      for (const child of node.namedChildren) {
        walkNode(child, nsName, currentTypeName, relativePath, contentHash, symbols);
      }
      return;
    }

    case "class_declaration":
    case "record_declaration":
    case "struct_declaration": {
      const name = getIdentifierName(node);
      if (!name) break;
      const qualifiedName = qualify(currentNamespace, name);
      symbols.push(makeSymbol({
        name,
        qualifiedName,
        kind: "class",
        node,
        relativePath,
        contentHash,
        modifiers: getModifiers(node),
        docComment: extractDocComment(node),
      }));
      // Walk members with this type as context
      for (const child of node.namedChildren) {
        walkNode(child, currentNamespace, qualifiedName, relativePath, contentHash, symbols);
      }
      return;
    }

    case "interface_declaration": {
      const name = getIdentifierName(node);
      if (!name) break;
      const qualifiedName = qualify(currentNamespace, name);
      symbols.push(makeSymbol({
        name,
        qualifiedName,
        kind: "interface",
        node,
        relativePath,
        contentHash,
        modifiers: getModifiers(node),
        docComment: extractDocComment(node),
      }));
      // Walk interface members
      for (const child of node.namedChildren) {
        walkNode(child, currentNamespace, qualifiedName, relativePath, contentHash, symbols);
      }
      return;
    }

    case "enum_declaration": {
      const name = getIdentifierName(node);
      if (!name) break;
      const qualifiedName = qualify(currentNamespace, name);
      symbols.push(makeSymbol({
        name,
        qualifiedName,
        kind: "enum",
        node,
        relativePath,
        contentHash,
        modifiers: getModifiers(node),
        docComment: extractDocComment(node),
      }));
      return;
    }

    case "delegate_declaration": {
      const name = getIdentifierName(node);
      if (!name) break;
      const qualifiedName = qualify(currentNamespace, name);
      symbols.push(makeSymbol({
        name,
        qualifiedName,
        kind: "type",
        node,
        relativePath,
        contentHash,
        modifiers: getModifiers(node),
        docComment: extractDocComment(node),
      }));
      return;
    }

    case "method_declaration": {
      const name = getIdentifierName(node);
      if (!name) break;
      const qualifiedName = currentTypeName ? `${currentTypeName}.${name}` : qualify(currentNamespace, name);
      const modifiers = getModifiers(node);
      symbols.push(makeSymbol({
        name,
        qualifiedName,
        kind: "function",
        node,
        relativePath,
        contentHash,
        modifiers,
        docComment: extractDocComment(node),
        signature: extractMethodSignature(node),
        returnType: extractReturnType(node),
        isAsync: modifiers.has("async"),
      }));
      return;
    }

    case "constructor_declaration": {
      const parentName = currentTypeName?.split(".").pop() ?? "";
      const name = ".ctor";
      const qualifiedName = currentTypeName ? `${currentTypeName}.${name}` : name;
      symbols.push(makeSymbol({
        name,
        qualifiedName,
        kind: "function",
        node,
        relativePath,
        contentHash,
        modifiers: getModifiers(node),
        docComment: extractDocComment(node),
        signature: extractConstructorSignature(node, parentName),
      }));
      return;
    }

    case "property_declaration": {
      const name = getIdentifierName(node);
      if (!name) break;
      const qualifiedName = currentTypeName ? `${currentTypeName}.${name}` : qualify(currentNamespace, name);
      symbols.push(makeSymbol({
        name,
        qualifiedName,
        kind: "variable",
        node,
        relativePath,
        contentHash,
        modifiers: getModifiers(node),
        docComment: extractDocComment(node),
      }));
      return;
    }

    case "field_declaration": {
      const varDeclarator = findChild(node, "variable_declaration");
      if (!varDeclarator) break;
      const declarators = varDeclarator.namedChildren.filter(
        (c) => c.type === "variable_declarator",
      );
      const modifiers = getModifiers(node);
      const isConst = modifiers.has("const");

      for (const decl of declarators) {
        const name = getIdentifierName(decl);
        if (!name) continue;
        const qualifiedName = currentTypeName ? `${currentTypeName}.${name}` : qualify(currentNamespace, name);
        symbols.push(makeSymbol({
          name,
          qualifiedName,
          kind: isConst ? "constant" : "variable",
          node,
          relativePath,
          contentHash,
          modifiers,
          docComment: extractDocComment(node),
        }));
      }
      return;
    }
  }

  // Continue walking for nodes not handled above
  for (const child of node.namedChildren) {
    walkNode(child, currentNamespace, currentTypeName, relativePath, contentHash, symbols);
  }
}

interface MakeSymbolArgs {
  name: string;
  qualifiedName: string;
  kind: SymbolKind;
  node: TreeSitterNode;
  relativePath: string;
  contentHash: string;
  modifiers: Set<string>;
  docComment: string | null;
  signature?: string | null;
  returnType?: string | null;
  isAsync?: boolean;
}

function makeSymbol(args: MakeSymbolArgs): ExtractedSymbol {
  const { name, qualifiedName, kind, node, relativePath, contentHash, modifiers, docComment } = args;
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
    isExported: modifiers.has("public") || modifiers.has("internal"),
    isAsync: args.isAsync ?? modifiers.has("async"),
    contentHash,
  };
}

function qualify(ns: string | null, name: string): string {
  return ns ? `${ns}.${name}` : name;
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

function getNamespaceName(node: TreeSitterNode): string {
  const nameNode = node.childForFieldName("name");
  if (nameNode) return nameNode.text;

  // For qualified names (e.g., Foo.Bar.Baz), look for the name child
  for (const child of node.namedChildren) {
    if (child.type === "qualified_name" || child.type === "identifier") {
      return child.text;
    }
  }
  return "";
}

function getModifiers(node: TreeSitterNode): Set<string> {
  const mods = new Set<string>();
  for (const child of node.children) {
    if (child.type === "modifier") {
      mods.add(child.text);
    }
  }
  return mods;
}

function findChild(node: TreeSitterNode, type: string): TreeSitterNode | null {
  for (const child of node.namedChildren) {
    if (child.type === type) return child;
  }
  return null;
}

function extractDocComment(node: TreeSitterNode): string | null {
  // Look at preceding siblings or comments before the node
  const comments: string[] = [];
  let sibling = node.previousSibling;

  while (sibling) {
    if (sibling.type === "comment" && sibling.text.startsWith("///")) {
      comments.unshift(sibling.text);
    } else if (sibling.type !== "attribute_list") {
      // Stop if we hit something that isn't a doc comment or attribute
      break;
    }
    sibling = sibling.previousSibling;
  }

  if (comments.length === 0) return null;

  // Extract text from XML doc comments
  const fullComment = comments.join("\n");
  const summaryMatch = fullComment.match(/<summary>\s*([\s\S]*?)\s*<\/summary>/);
  if (summaryMatch) {
    return summaryMatch[1]
      .split("\n")
      .map((line) => line.replace(/^\s*\/\/\/\s?/, "").trim())
      .filter(Boolean)
      .join(" ");
  }

  // No <summary> tags — just strip /// prefixes
  return comments
    .map((c) => c.replace(/^\s*\/\/\/\s?/, "").trim())
    .filter(Boolean)
    .join(" ");
}

function extractMethodSignature(node: TreeSitterNode): string | null {
  const paramList = findChild(node, "parameter_list");
  if (!paramList) return null;

  const name = getIdentifierName(node) ?? "method";
  return `${name}${paramList.text}`;
}

function extractConstructorSignature(node: TreeSitterNode, typeName: string): string | null {
  const paramList = findChild(node, "parameter_list");
  if (!paramList) return null;
  return `${typeName}${paramList.text}`;
}

function extractReturnType(node: TreeSitterNode): string | null {
  const typeNode = node.childForFieldName("type");
  if (typeNode) return typeNode.text;

  // Fallback: first named child that looks like a type
  for (const child of node.namedChildren) {
    if (
      child.type === "predefined_type" ||
      child.type === "generic_name" ||
      child.type === "identifier" ||
      child.type === "nullable_type" ||
      child.type === "array_type" ||
      child.type === "qualified_name"
    ) {
      return child.text;
    }
    // Stop at parameter list — types come before it
    if (child.type === "parameter_list") break;
  }
  return null;
}
