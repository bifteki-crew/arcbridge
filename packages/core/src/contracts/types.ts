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
  number: "number", int: "number", integer: "number", long: "number", short: "number",
  byte: "number", double: "number", float: "number", decimal: "number", bigint: "number",
  boolean: "boolean", bool: "boolean",
  date: "date", datetime: "date", DateTime: "date", DateTimeOffset: "date",
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

  // Peel array/nullable/generic wrappers repeatedly.
  for (let guard = 0; guard < 12; guard++) {
    t = t.trim().replace(/\?+$/, ""); // trailing nullable
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
  const out: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "<") depth++;
    else if (c === ">") depth--;
    else if (c === "," && depth === 0) { out.push(s.slice(start, i)); start = i + 1; }
  }
  out.push(s.slice(start));
  return out.map((x) => x.trim()).filter(Boolean);
}

/**
 * A comparable category for one field's type, so a TS field and a C# field can
 * be checked for agreement across languages. Known primitives collapse to
 * `string`/`number`/`boolean`/`date`; arrays to `array<inner>`; anything
 * unrecognized returns null (→ caller treats it as "can't tell", no mismatch).
 */
export function fieldTypeCategory(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim().replace(/\s*\|\s*(null|undefined)\s*$/g, "").replace(/\?+$/, "");

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
