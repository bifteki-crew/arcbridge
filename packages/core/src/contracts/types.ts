// Type-string helpers for field-level contract comparison. Best-effort string
// parsing (not a type system) — the goal is to reduce a frontend response type
// and a backend DTO return type to a comparable simple name + per-field
// category, flagging only CLEAR mismatches and staying lenient on anything
// unrecognized (so the check adds signal, not noise).

// Generic wrappers whose single type argument is the "real" payload type.
const UNWRAP_GENERICS = new Set([
  "Promise", "Task", "ValueTask", // async
  "ActionResult", "Ok", "Results", // ASP.NET result wrappers
  "Array", "List", "IList", "IEnumerable", "ICollection",
  "IReadOnlyList", "IReadOnlyCollection", "Collection",
]);

// Type names that carry no comparable shape (bail out → null).
const OPAQUE_TYPES = new Set([
  "IActionResult", "ActionResult", "object", "any", "unknown", "void",
  "Response", "HttpResponseMessage", "dynamic", "JsonResult",
]);

const PRIMITIVE_CATEGORY: Record<string, string> = {
  string: "string", String: "string", guid: "string", Guid: "string", uuid: "string",
  number: "number", int: "number", integer: "number", short: "number",
  byte: "number", double: "number", float: "number", decimal: "number",
  // 64-bit integers are their own category: TS `bigint` is not assignable to
  // `number`, and C# `long` exceeds JS number precision — so `long` vs `number`
  // is a real mismatch worth surfacing, not an equivalence.
  bigint: "bigint", long: "bigint", int64: "bigint", ulong: "bigint",
  boolean: "boolean", bool: "boolean",
  // Note: C# TimeSpan is deliberately absent — it's a duration, not a date, so
  // mapping it here would mask a genuine Date↔TimeSpan mismatch.
  date: "date", datetime: "date", DateTime: "date", DateTimeOffset: "date",
  Date: "date", DateOnly: "date",
};

function simpleName(t: string): string {
  // Drop namespace/module qualifiers: Api.Models.UserDto → UserDto
  const noNs = t.trim().replace(/<.*$/s, "").split(".").pop() ?? t.trim();
  return noNs.trim();
}

/**
 * Reduce a return/response type string to the innermost user-defined type NAME
 * (e.g. `Task<ActionResult<List<UserDto>>>` → `UserDto`, `Promise<Bookmark[]>`
 * → `Bookmark`). Returns null for primitives, opaque results, or anything with
 * no single comparable payload type.
 */
export function unwrapToTypeName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let t = raw.trim();

  // Peel array/nullable/generic/union wrappers repeatedly. Unions are stripped
  // inside the loop too, since unwrapping a generic can expose one
  // (`Promise<UserDto | null>` → `UserDto | null` → `UserDto`).
  for (let guard = 0; guard < 12; guard++) {
    // Drop null/undefined union members (top-level only, so a union nested in a
    // generic stays intact until that generic is unwrapped).
    const members = unionMembers(t.trim());
    if (members.length !== 1) return null; // empty, or a genuine multi-type union
    t = members[0].trim().replace(/\?+$/, ""); // trailing nullable
    if (t.endsWith("[]")) { t = t.slice(0, -2); continue; } // array suffix

    const generic = /^([A-Za-z_][\w.]*)\s*<(.+)>$/s.exec(t);
    if (generic && UNWRAP_GENERICS.has(simpleName(generic[1]))) {
      // Take the last type argument (Dictionary<K,V> → V is the payload)
      t = splitTopLevelArgs(generic[2]).pop() ?? "";
      continue;
    }
    // A generic we don't unwrap (e.g. a custom Paged<T>) — keep its outer name.
    break;
  }

  const name = simpleName(t);
  if (!name) return null;
  if (OPAQUE_TYPES.has(name)) return null;
  if (name.toLowerCase() in PRIMITIVE_CATEGORY) return null; // primitive, no shape
  return name;
}

/** Split `K, List<V>` on top-level commas only (respecting nested <>). */
function splitTopLevelArgs(s: string): string[] {
  return splitTopLevel(s, ",");
}

/**
 * Split on a separator at nesting depth 0 only, so a union inside a generic
 * (`Promise<UserDto | null>`) isn't torn apart.
 */
function splitTopLevel(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "<" || c === "(" || c === "[") depth++;
    else if (c === ">" || c === ")" || c === "]") depth--;
    else if (c === sep && depth === 0) { out.push(s.slice(start, i)); start = i + 1; }
  }
  out.push(s.slice(start));
  return out.map((x) => x.trim()).filter(Boolean);
}

/** Top-level union members with null/undefined removed. */
function unionMembers(s: string): string[] {
  return splitTopLevel(s, "|").filter((p) => p !== "null" && p !== "undefined");
}

/**
 * A comparable category for one field's type, so a TS field and a C# field can
 * be checked for agreement across languages. Known primitives collapse to
 * `string`/`number`/`boolean`/`date`; arrays to `array<inner>`; anything
 * unrecognized returns null (→ caller treats it as "can't tell", no mismatch).
 */
export function fieldTypeCategory(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Drop null/undefined union members wherever they appear (`string | null`,
  // `null | string`, `string | null | undefined`) plus a trailing `?`, so the
  // remaining type categorizes consistently. Top-level split only, so a union
  // nested in a generic (`List<string | null>`) isn't torn apart.
  const members = unionMembers(raw.trim());
  if (members.length === 0) return null;
  if (members.length > 1) return null; // genuine multi-type union → uncomparable
  const t = members[0].replace(/\?+$/, "");
  if (!t) return null;

  // Array forms: X[], List<X>, IEnumerable<X>, Array<X>
  if (t.endsWith("[]")) {
    const inner = fieldTypeCategory(t.slice(0, -2));
    return inner ? `array<${inner}>` : "array<?>";
  }
  const arr = /^(Array|List|IList|IEnumerable|ICollection|IReadOnlyList|Collection)\s*<(.+)>$/s.exec(t);
  if (arr) {
    const inner = fieldTypeCategory(splitTopLevelArgs(arr[2]).pop() ?? "");
    return inner ? `array<${inner}>` : "array<?>";
  }

  const name = simpleName(t);
  const cat = PRIMITIVE_CATEGORY[name] ?? PRIMITIVE_CATEGORY[name.toLowerCase()];
  return cat ?? null; // unknown/custom type → null = "can't compare"
}

/**
 * Whether two field types are known-incompatible. Only true when BOTH sides
 * resolve to different KNOWN categories (e.g. string vs number). If either side
 * is unrecognized, returns false (lenient — no false-positive mismatch).
 */
export function typesConflict(a: string | null | undefined, b: string | null | undefined): boolean {
  const ca = fieldTypeCategory(a);
  const cb = fieldTypeCategory(b);
  if (ca === null || cb === null) return false;
  return ca !== cb;
}
