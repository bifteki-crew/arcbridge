import type { ExtractedDependency, DependencyKind } from "../dependency-extractor.js";

/** Minimum fields needed from symbols for dependency extraction */
export interface SymbolForDeps {
  id: string;
  name: string;
  filePath: string;
  kind: string;
  startLine: number;
  endLine: number;
}

interface TreeSitterNode {
  type: string;
  text: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  namedChildren: TreeSitterNode[];
  children: TreeSitterNode[];
  childForFieldName(name: string): TreeSitterNode | null;
  parent: TreeSitterNode | null;
}

/**
 * Build a lookup map from simple names to symbol IDs.
 * Used for name-based dependency resolution (no semantic model).
 */
export function buildCSharpSymbolLookup(
  symbols: SymbolForDeps[],
): Map<string, string[]> {
  const lookup = new Map<string, string[]>();
  for (const sym of symbols) {
    // Index by simple name
    const existing = lookup.get(sym.name);
    if (existing) {
      existing.push(sym.id);
    } else {
      lookup.set(sym.name, [sym.id]);
    }
  }
  return lookup;
}

/**
 * Extract dependencies from a parsed C# file using name-based resolution.
 * Requires a symbol lookup built from all indexed symbols.
 */
export function extractCSharpDependencies(
  tree: { rootNode: TreeSitterNode },
  relativePath: string,
  allSymbols: SymbolForDeps[],
  symbolLookup: Map<string, string[]>,
): ExtractedDependency[] {
  const deps: ExtractedDependency[] = [];
  const seen = new Set<string>();

  // Get symbols defined in this file (potential sources)
  const fileSymbols = allSymbols.filter((s) => s.filePath === relativePath);

  walkForDependencies(tree.rootNode, fileSymbols, symbolLookup, deps, seen);
  return deps;
}

function walkForDependencies(
  node: TreeSitterNode,
  fileSymbols: SymbolForDeps[],
  lookup: Map<string, string[]>,
  deps: ExtractedDependency[],
  seen: Set<string>,
): void {
  switch (node.type) {
    case "class_declaration":
    case "record_declaration":
    case "struct_declaration":
      extractInheritanceDeps(node, fileSymbols, lookup, deps, seen);
      break;

    case "interface_declaration":
      extractInheritanceDeps(node, fileSymbols, lookup, deps, seen);
      break;

    case "invocation_expression":
      extractCallDeps(node, fileSymbols, lookup, deps, seen);
      break;

    case "object_creation_expression":
      extractTypeUsageDep(node, fileSymbols, lookup, deps, seen);
      break;
  }

  // Extract type usage from parameter types, return types, variable types
  if (
    node.type === "parameter" ||
    node.type === "variable_declaration" ||
    node.type === "property_declaration"
  ) {
    extractTypeRefDeps(node, fileSymbols, lookup, deps, seen);
  }

  for (const child of node.namedChildren) {
    walkForDependencies(child, fileSymbols, lookup, deps, seen);
  }
}

/**
 * Extract extends/implements from base_list.
 */
function extractInheritanceDeps(
  node: TreeSitterNode,
  fileSymbols: SymbolForDeps[],
  lookup: Map<string, string[]>,
  deps: ExtractedDependency[],
  seen: Set<string>,
): void {
  const typeName = getNodeIdentifier(node);
  if (!typeName) return;

  const sourceSymbol = findEnclosingSymbol(typeName, fileSymbols, "class", "interface");
  if (!sourceSymbol) return;

  const baseList = findChild(node, "base_list");
  if (!baseList) return;

  for (const child of baseList.namedChildren) {
    const baseName = extractSimpleTypeName(child);
    if (!baseName) continue;

    // Skip self-references
    if (baseName === typeName) continue;

    // Heuristic: interface names start with I + uppercase
    const isInterface = /^I[A-Z]/.test(baseName);
    const kind: DependencyKind = isInterface ? "implements" : "extends";

    const targetIds = lookup.get(baseName);
    if (!targetIds) continue;

    for (const targetId of targetIds) {
      // Skip self-references
      if (targetId === sourceSymbol.id) continue;
      addDep(deps, seen, sourceSymbol.id, targetId, kind);
    }
  }
}

/**
 * Extract calls dependencies from invocation expressions.
 */
function extractCallDeps(
  node: TreeSitterNode,
  fileSymbols: SymbolForDeps[],
  lookup: Map<string, string[]>,
  deps: ExtractedDependency[],
  seen: Set<string>,
): void {
  const methodName = extractInvokedMethodName(node);
  if (!methodName) return;

  // Find the enclosing function/method that contains this call
  const enclosingMethod = findEnclosingMethodForNode(node, fileSymbols);
  if (!enclosingMethod) return;

  const targetIds = lookup.get(methodName);
  if (!targetIds) return;

  for (const targetId of targetIds) {
    if (targetId === enclosingMethod.id) continue;
    addDep(deps, seen, enclosingMethod.id, targetId, "calls");
  }
}

/**
 * Extract uses_type from object creation (new X()).
 */
function extractTypeUsageDep(
  node: TreeSitterNode,
  fileSymbols: SymbolForDeps[],
  lookup: Map<string, string[]>,
  deps: ExtractedDependency[],
  seen: Set<string>,
): void {
  const typeName = extractSimpleTypeName(node);
  if (!typeName) return;

  const enclosing = findEnclosingMethodForNode(node, fileSymbols);
  if (!enclosing) return;

  const targetIds = lookup.get(typeName);
  if (!targetIds) return;

  for (const targetId of targetIds) {
    if (targetId === enclosing.id) continue;
    addDep(deps, seen, enclosing.id, targetId, "uses_type");
  }
}

/**
 * Extract uses_type from type references in parameters, properties, variables.
 */
function extractTypeRefDeps(
  node: TreeSitterNode,
  fileSymbols: SymbolForDeps[],
  lookup: Map<string, string[]>,
  deps: ExtractedDependency[],
  seen: Set<string>,
): void {
  const typeNames = collectTypeIdentifiers(node);
  if (typeNames.length === 0) return;

  // Find enclosing symbol (method for params, type for properties)
  const enclosing = findEnclosingSymbolForNode(node, fileSymbols);
  if (!enclosing) return;

  for (const typeName of typeNames) {
    const targetIds = lookup.get(typeName);
    if (!targetIds) continue;

    for (const targetId of targetIds) {
      if (targetId === enclosing.id) continue;
      addDep(deps, seen, enclosing.id, targetId, "uses_type");
    }
  }
}

// --- Helpers ---

function addDep(
  deps: ExtractedDependency[],
  seen: Set<string>,
  source: string,
  target: string,
  kind: DependencyKind,
): void {
  const key = `${source}|${target}|${kind}`;
  if (seen.has(key)) return;
  seen.add(key);
  deps.push({ sourceSymbolId: source, targetSymbolId: target, kind });
}

function findChild(node: TreeSitterNode, type: string): TreeSitterNode | null {
  for (const child of node.namedChildren) {
    if (child.type === type) return child;
  }
  return null;
}

function getNodeIdentifier(node: TreeSitterNode): string | null {
  const nameNode = node.childForFieldName("name");
  if (nameNode) return nameNode.text;
  for (const child of node.namedChildren) {
    if (child.type === "identifier") return child.text;
  }
  return null;
}

function extractSimpleTypeName(node: TreeSitterNode): string | null {
  // Walk through to find the actual type name, handling generics and qualified names
  for (const child of node.namedChildren) {
    if (child.type === "identifier") return child.text;
    if (child.type === "generic_name") {
      const nameNode = child.childForFieldName("name") ?? findChild(child, "identifier");
      return nameNode?.text ?? null;
    }
    if (child.type === "qualified_name") {
      // Take the last part
      const parts = child.text.split(".");
      return parts[parts.length - 1];
    }
  }

  if (node.type === "identifier") return node.text;
  if (node.type === "generic_name") {
    const nameNode = node.childForFieldName("name") ?? findChild(node, "identifier");
    return nameNode?.text ?? null;
  }

  return null;
}

function extractInvokedMethodName(node: TreeSitterNode): string | null {
  // invocation_expression has function child
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

function findEnclosingSymbol(
  name: string,
  fileSymbols: SymbolForDeps[],
  ...kinds: string[]
): SymbolForDeps | undefined {
  return fileSymbols.find(
    (s) => s.name === name && kinds.includes(s.kind),
  );
}

function findEnclosingMethodForNode(
  node: TreeSitterNode,
  fileSymbols: SymbolForDeps[],
): SymbolForDeps | undefined {
  // Walk up tree to find enclosing method/constructor
  let current: TreeSitterNode | null = node.parent;
  while (current) {
    if (
      current.type === "method_declaration" ||
      current.type === "constructor_declaration"
    ) {
      const methodName = getNodeIdentifier(current);
      const name = current.type === "constructor_declaration" ? ".ctor" : methodName;
      if (name) {
        return fileSymbols.find(
          (s) => s.kind === "function" && s.name === name &&
            s.startLine <= (current!.startPosition.row + 1) &&
            s.endLine >= (current!.endPosition.row + 1),
        );
      }
    }
    current = current.parent;
  }
  return undefined;
}

function findEnclosingSymbolForNode(
  node: TreeSitterNode,
  fileSymbols: SymbolForDeps[],
): SymbolForDeps | undefined {
  // First try method, then type
  let current: TreeSitterNode | null = node.parent;
  while (current) {
    if (
      current.type === "method_declaration" ||
      current.type === "constructor_declaration"
    ) {
      const name = current.type === "constructor_declaration"
        ? ".ctor"
        : getNodeIdentifier(current);
      if (name) {
        const found = fileSymbols.find(
          (s) => s.kind === "function" && s.name === name &&
            s.startLine <= (current!.startPosition.row + 1) &&
            s.endLine >= (current!.endPosition.row + 1),
        );
        if (found) return found;
      }
    }
    if (
      current.type === "class_declaration" ||
      current.type === "struct_declaration" ||
      current.type === "record_declaration" ||
      current.type === "interface_declaration"
    ) {
      const name = getNodeIdentifier(current);
      if (name) {
        return fileSymbols.find(
          (s) => s.name === name && (s.kind === "class" || s.kind === "interface"),
        );
      }
    }
    current = current.parent;
  }
  return undefined;
}

function collectTypeIdentifiers(node: TreeSitterNode): string[] {
  const names: string[] = [];
  collectTypeIdentifiersRecursive(node, names);
  return [...new Set(names)];
}

function collectTypeIdentifiersRecursive(node: TreeSitterNode, names: string[]): void {
  if (node.type === "identifier" && isTypeContext(node)) {
    names.push(node.text);
  } else if (node.type === "generic_name") {
    const nameNode = node.childForFieldName("name") ?? findChild(node, "identifier");
    if (nameNode) names.push(nameNode.text);
  }

  for (const child of node.namedChildren) {
    collectTypeIdentifiersRecursive(child, names);
  }
}

function isTypeContext(node: TreeSitterNode): boolean {
  const parent = node.parent;
  if (!parent) return false;
  // Type identifiers appear in specific contexts
  return (
    parent.type === "type_argument_list" ||
    parent.type === "generic_name" ||
    parent.type === "qualified_name" ||
    parent.type === "base_list" ||
    parent.type === "type_constraint" ||
    // Direct type annotation (after :)
    (parent.type === "parameter" && node !== parent.childForFieldName("name")) ||
    (parent.type === "variable_declaration" && node === parent.namedChildren[0]) ||
    parent.type === "nullable_type" ||
    parent.type === "array_type"
  );
}
