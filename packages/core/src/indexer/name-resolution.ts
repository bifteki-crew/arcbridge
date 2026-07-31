/**
 * Shared name-based dependency resolution for the tree-sitter indexers
 * (C#, Python, Go). None of them has a semantic model, so a call or type
 * reference is matched by bare name — and a bare name is frequently not unique.
 *
 * Every extractor used to add an edge to EVERY symbol sharing the name. A method
 * calling its own `GetById` therefore linked to `GetById` on all five unrelated
 * controllers in the project, which surfaced as an error-severity
 * `dependency_violation` between building blocks that have nothing to do with
 * each other. With names as ordinary as GetById, Handle, or Create, that hits
 * essentially every real codebase.
 *
 * The rule here is to narrow when there is local evidence and only fan out when
 * there is none:
 *
 *   1. Candidates in the caller's own declaring scope win outright — a
 *      self-call resolves to itself, never to a namesake elsewhere.
 *   2. Otherwise candidates in the SAME FILE win.
 *   3. Otherwise all candidates are kept. This is deliberate: a call to
 *      `_service.GetAllAsync()` legitimately matches both `IOrderService` and
 *      `OrderService`, and linking to both is informative rather than wrong. The
 *      fan-out is only harmful when a better-scoped answer was available.
 */

interface SymbolIdParts {
  filePath: string;
  qualifiedName: string;
}

/** Symbol IDs are `${repoRelativePath}::${qualifiedName}#${kind}`. */
function parseSymbolId(id: string): SymbolIdParts {
  const separator = id.indexOf("::");
  if (separator < 0) return { filePath: "", qualifiedName: "" };

  const hash = id.lastIndexOf("#");
  const end = hash > separator ? hash : id.length;
  return {
    filePath: id.slice(0, separator),
    qualifiedName: id.slice(separator + 2, end),
  };
}

/**
 * Whatever a qualified name is declared *inside* — one segment up.
 *
 * What that means depends on the symbol, and both readings are wanted here:
 *   - a member  `Acme.Orders.OrderService.GetById` -> `Acme.Orders.OrderService`
 *     (its declaring type, so a self-call outranks a namesake elsewhere)
 *   - a type    `Acme.Orders.OrderService`         -> `Acme.Orders`
 *     (its namespace, which is the useful grouping when resolving a base type
 *     during inheritance extraction)
 *
 * Returns "" for a bare name, which then matches nothing rather than matching
 * every other bare name.
 */
function declaringScope(qualifiedName: string): string {
  const lastDot = qualifiedName.lastIndexOf(".");
  return lastDot > 0 ? qualifiedName.slice(0, lastDot) : "";
}

/** The caller's identity — its own symbol ID and the file it is declared in. */
export interface ResolutionSource {
  id: string;
  filePath: string;
}

/**
 * Resolve a bare name to the symbol IDs it should link to. See the module
 * comment for the ranking; the result is never empty unless the name is unknown.
 */
export function resolveTargets(
  name: string,
  lookup: Map<string, string[]>,
  from: ResolutionSource,
): string[] {
  const candidates = lookup.get(name);
  if (!candidates || candidates.length <= 1) return candidates ?? [];

  // Parse each candidate once. This runs on the hot path for exactly the common
  // names it exists to disambiguate, so re-parsing per filter pass would add
  // cost precisely where the list is longest.
  const parsed = candidates.map((id) => ({ id, ...parseSymbolId(id) }));

  const scope = declaringScope(parseSymbolId(from.id).qualifiedName);
  if (scope) {
    const sameScope = parsed.filter((c) => declaringScope(c.qualifiedName) === scope);
    if (sameScope.length > 0) return sameScope.map((c) => c.id);
  }

  const sameFile = parsed.filter((c) => c.filePath === from.filePath);
  if (sameFile.length > 0) return sameFile.map((c) => c.id);

  // No local evidence — an unqualified cross-file name genuinely is ambiguous.
  return candidates;
}
