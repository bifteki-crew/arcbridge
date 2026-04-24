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
export function buildGoSymbolLookup(
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
 * Extract dependencies from a parsed Go file using name-based resolution.
 * Requires a symbol lookup built from all indexed symbols.
 */
export function extractGoDependencies(
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
    case "type_declaration":
      // Walk into type_spec children for struct/interface embedding
      for (const child of node.namedChildren) {
        if (child.type === "type_spec") {
          extractEmbeddingDeps(child, fileSymbols, lookup, deps, seen);
        }
      }
      break;

    case "call_expression":
      extractCallDeps(node, fileSymbols, lookup, deps, seen);
      break;
  }

  // Extract type usage from various contexts
  if (
    node.type === "parameter_declaration" ||
    node.type === "field_declaration" ||
    node.type === "var_spec"
  ) {
    extractTypeRefDeps(node, fileSymbols, lookup, deps, seen);
  }

  for (const child of node.namedChildren) {
    walkForDependencies(child, fileSymbols, lookup, deps, seen);
  }
}

/**
 * Extract extends dependencies from struct/interface embedding.
 * In Go, a struct field without a name (just a type) is an embedded field.
 * In an interface, a type name without a method signature is embedded.
 */
function extractEmbeddingDeps(
  typeSpec: TreeSitterNode,
  fileSymbols: SymbolForDeps[],
  lookup: Map<string, string[]>,
  deps: ExtractedDependency[],
  seen: Set<string>,
): void {
  const typeName = getNodeIdentifier(typeSpec);
  if (!typeName) return;

  const sourceSymbol = findEnclosingSymbol(typeName, fileSymbols, "class", "interface");
  if (!sourceSymbol) return;

  const typeNode = typeSpec.childForFieldName("type");
  if (!typeNode) return;

  if (typeNode.type === "struct_type" || typeNode.type === "interface_type") {
    // Look for field_declaration_list → field_declaration with no name (embedded)
    const fieldList = findChild(typeNode, "field_declaration_list") ?? typeNode;

    for (const field of fieldList.namedChildren) {
      if (field.type === "field_declaration") {
        // Embedded field: has a type but no explicit name field
        // In tree-sitter-go, embedded fields have the type as the only content
        const nameNode = field.childForFieldName("name");
        if (nameNode) continue; // Named field, not embedded

        const embeddedTypeName = extractSimpleTypeName(field);
        if (!embeddedTypeName || embeddedTypeName === typeName) continue;

        const targetIds = lookup.get(embeddedTypeName);
        if (!targetIds) continue;

        for (const targetId of targetIds) {
          if (targetId === sourceSymbol.id) continue;
          addDep(deps, seen, sourceSymbol.id, targetId, "extends");
        }
      }

      // Interface embedding: a type_name inside an interface_type without method signature
      if (field.type === "type_name" || field.type === "qualified_type" || field.type === "type_identifier") {
        const embeddedName = extractSimpleTypeNameFromNode(field);
        if (!embeddedName || embeddedName === typeName) continue;

        const targetIds = lookup.get(embeddedName);
        if (!targetIds) continue;

        for (const targetId of targetIds) {
          if (targetId === sourceSymbol.id) continue;
          addDep(deps, seen, sourceSymbol.id, targetId, "extends");
        }
      }
    }
  }
}

/**
 * Extract call dependencies from call expressions.
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
 * Extract uses_type from type references in parameters, struct fields, variables.
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
    if (child.type === "identifier" || child.type === "type_identifier") return child.text;
  }
  return null;
}

function extractSimpleTypeName(node: TreeSitterNode): string | null {
  for (const child of node.namedChildren) {
    if (child.type === "type_identifier" || child.type === "identifier") return child.text;
    if (child.type === "pointer_type") {
      // Strip pointer: *Type → Type
      const inner = child.namedChildren[0];
      return inner ? extractSimpleTypeNameFromNode(inner) : null;
    }
    if (child.type === "qualified_type") {
      // pkg.Type → take Type (last part)
      const parts = child.text.split(".");
      return parts[parts.length - 1];
    }
  }
  return null;
}

function extractSimpleTypeNameFromNode(node: TreeSitterNode): string | null {
  if (node.type === "type_identifier" || node.type === "identifier") return node.text;
  if (node.type === "qualified_type") {
    const parts = node.text.split(".");
    return parts[parts.length - 1];
  }
  return null;
}

/**
 * Extract the function/method name being called from a call_expression.
 * Handles: funcName(), pkg.FuncName(), receiver.Method()
 */
function extractCalledFunctionName(node: TreeSitterNode): string | null {
  const funcNode = node.childForFieldName("function");
  if (!funcNode) return node.namedChildren[0]?.text ?? null;

  if (funcNode.type === "selector_expression") {
    // pkg.Func() or receiver.Method() — take the field name
    const fieldNode = funcNode.childForFieldName("field");
    return fieldNode?.text ?? null;
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

function findEnclosingFunctionForNode(
  node: TreeSitterNode,
  fileSymbols: SymbolForDeps[],
): SymbolForDeps | undefined {
  let current: TreeSitterNode | null = node.parent;
  while (current) {
    if (
      current.type === "function_declaration" ||
      current.type === "method_declaration"
    ) {
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
  // First try function/method, then type
  let current: TreeSitterNode | null = node.parent;
  while (current) {
    if (
      current.type === "function_declaration" ||
      current.type === "method_declaration"
    ) {
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
    if (current.type === "type_spec") {
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
  if (node.type === "type_identifier") {
    names.push(node.text);
  } else if (node.type === "qualified_type") {
    // pkg.Type → take Type
    const parts = node.text.split(".");
    names.push(parts[parts.length - 1]);
  } else if (node.type === "pointer_type") {
    // *Type → recurse to get the inner type
    for (const child of node.namedChildren) {
      collectTypeIdentifiersRecursive(child, names);
    }
    return;
  }

  for (const child of node.namedChildren) {
    collectTypeIdentifiersRecursive(child, names);
  }
}
