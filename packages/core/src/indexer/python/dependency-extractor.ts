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
export function buildPythonSymbolLookup(
  symbols: SymbolForDeps[],
): Map<string, string[]> {
  const lookup = new Map<string, string[]>();
  for (const sym of symbols) {
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
 * Extract dependencies from a parsed Python file using name-based resolution.
 * Requires a symbol lookup built from all indexed symbols.
 */
export function extractPythonDependencies(
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
    case "class_definition":
      extractInheritanceDeps(node, fileSymbols, lookup, deps, seen);
      break;

    case "call":
      extractCallDeps(node, fileSymbols, lookup, deps, seen);
      break;
  }

  // Extract type usage from type annotations
  if (
    node.type === "typed_parameter" ||
    node.type === "typed_default_parameter"
  ) {
    extractTypeAnnotationDeps(node, fileSymbols, lookup, deps, seen);
  }

  for (const child of node.namedChildren) {
    walkForDependencies(child, fileSymbols, lookup, deps, seen);
  }
}

/**
 * Extract extends dependencies from class inheritance.
 * `class Foo(Bar, Baz):` → Foo extends Bar, Foo extends Baz
 */
function extractInheritanceDeps(
  node: TreeSitterNode,
  fileSymbols: SymbolForDeps[],
  lookup: Map<string, string[]>,
  deps: ExtractedDependency[],
  seen: Set<string>,
): void {
  const className = getNodeIdentifier(node);
  if (!className) return;

  const sourceSymbol = findEnclosingSymbol(className, fileSymbols, "class");
  if (!sourceSymbol) return;

  // The superclasses are in the argument_list (or superclasses) child
  const argList = node.childForFieldName("superclasses") ?? findChild(node, "argument_list");
  if (!argList) return;

  for (const child of argList.namedChildren) {
    const baseName = extractSimpleTypeName(child);
    if (!baseName || baseName === className) continue;

    const targetIds = lookup.get(baseName);
    if (!targetIds) continue;

    for (const targetId of targetIds) {
      if (targetId === sourceSymbol.id) continue;
      addDep(deps, seen, sourceSymbol.id, targetId, "extends");
    }
  }
}

/**
 * Extract call dependencies from function/method calls.
 */
function extractCallDeps(
  node: TreeSitterNode,
  fileSymbols: SymbolForDeps[],
  lookup: Map<string, string[]>,
  deps: ExtractedDependency[],
  seen: Set<string>,
): void {
  const calledName = extractCalledFunctionName(node);
  if (!calledName) return;

  const enclosing = findEnclosingFunctionForNode(node, fileSymbols);
  if (!enclosing) return;

  const targetIds = lookup.get(calledName);
  if (!targetIds) return;

  for (const targetId of targetIds) {
    if (targetId === enclosing.id) continue;
    addDep(deps, seen, enclosing.id, targetId, "calls");
  }
}

/**
 * Extract uses_type from type annotations in parameters.
 */
function extractTypeAnnotationDeps(
  node: TreeSitterNode,
  fileSymbols: SymbolForDeps[],
  lookup: Map<string, string[]>,
  deps: ExtractedDependency[],
  seen: Set<string>,
): void {
  const typeNames = collectTypeIdentifiers(node);
  if (typeNames.length === 0) return;

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
  if (node.type === "identifier") return node.text;

  // Handle attribute access like module.ClassName
  if (node.type === "attribute") {
    const attrNode = node.childForFieldName("attribute");
    return attrNode?.text ?? null;
  }

  // Handle subscript like List[int] — extract the base type
  if (node.type === "subscript") {
    const value = node.childForFieldName("value") ?? node.namedChildren[0];
    if (value) return extractSimpleTypeName(value);
  }

  // Handle keyword argument like metaclass=ABCMeta
  if (node.type === "keyword_argument") {
    const value = node.childForFieldName("value") ?? node.namedChildren[1];
    if (value) return extractSimpleTypeName(value);
  }

  for (const child of node.namedChildren) {
    if (child.type === "identifier") return child.text;
  }
  return null;
}

function extractCalledFunctionName(node: TreeSitterNode): string | null {
  const funcNode = node.childForFieldName("function") ?? node.namedChildren[0];
  if (!funcNode) return null;

  if (funcNode.type === "identifier") return funcNode.text;

  // method call: obj.method() — extract method name
  if (funcNode.type === "attribute") {
    const attrNode = funcNode.childForFieldName("attribute");
    return attrNode?.text ?? null;
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

function findEnclosingFunctionForNode(
  node: TreeSitterNode,
  fileSymbols: SymbolForDeps[],
): SymbolForDeps | undefined {
  let current: TreeSitterNode | null = node.parent;
  while (current) {
    if (current.type === "function_definition") {
      const name = getNodeIdentifier(current);
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
  // First try function, then class
  let current: TreeSitterNode | null = node.parent;
  while (current) {
    if (current.type === "function_definition") {
      const name = getNodeIdentifier(current);
      if (name) {
        const found = fileSymbols.find(
          (s) => s.kind === "function" && s.name === name &&
            s.startLine <= (current!.startPosition.row + 1) &&
            s.endLine >= (current!.endPosition.row + 1),
        );
        if (found) return found;
      }
    }
    if (current.type === "class_definition") {
      const name = getNodeIdentifier(current);
      if (name) {
        return fileSymbols.find(
          (s) => s.name === name && s.kind === "class",
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
  }

  for (const child of node.namedChildren) {
    collectTypeIdentifiersRecursive(child, names);
  }
}

function isTypeContext(node: TreeSitterNode): boolean {
  const parent = node.parent;
  if (!parent) return false;
  return (
    parent.type === "type" ||
    parent.type === "subscript" ||
    parent.type === "attribute" ||
    // In typed_parameter, the type annotation is the second named child
    (parent.type === "typed_parameter" && node !== parent.childForFieldName("name")) ||
    (parent.type === "typed_default_parameter" && node !== parent.childForFieldName("name"))
  );
}

