import { describe, it, expect } from "vitest";
import { unwrapToTypeName, fieldTypeCategory, typesConflict } from "../contracts/types.js";

describe("unwrapToTypeName", () => {
  it("peels async + result + collection wrappers to the DTO name", () => {
    expect(unwrapToTypeName("Task<ActionResult<List<UserDto>>>")).toBe("UserDto");
    expect(unwrapToTypeName("Promise<Bookmark[]>")).toBe("Bookmark");
    expect(unwrapToTypeName("IEnumerable<Api.Models.Order>")).toBe("Order");
    expect(unwrapToTypeName("ActionResult<UserDto>")).toBe("UserDto");
    expect(unwrapToTypeName("UserDto[]")).toBe("UserDto");
    expect(unwrapToTypeName("UserDto?")).toBe("UserDto");
  });

  it("returns null for inline object/tuple/function types (no name to look up)", () => {
    expect(unwrapToTypeName("{ id: string }")).toBeNull();
    expect(unwrapToTypeName("Promise<{ id: string }>")).toBeNull();
    expect(unwrapToTypeName("() => void")).toBeNull();
  });

  it("returns null for primitives and opaque results", () => {
    for (const t of ["string", "Task<int>", "Promise<boolean>", "IActionResult", "void", "Promise<Response>"]) {
      expect(unwrapToTypeName(t)).toBeNull();
    }
    expect(unwrapToTypeName(null)).toBeNull();
    expect(unwrapToTypeName("")).toBeNull();
  });

  it("keeps an unknown custom generic's outer name", () => {
    expect(unwrapToTypeName("Paged<UserDto>")).toBe("Paged");
  });

  it("resolves nullable response types to the DTO", () => {
    expect(unwrapToTypeName("UserDto | null")).toBe("UserDto");
    expect(unwrapToTypeName("null | UserDto")).toBe("UserDto");
    expect(unwrapToTypeName("UserDto | undefined")).toBe("UserDto");
    // A union nested inside a generic must not be split at the top level
    expect(unwrapToTypeName("Promise<UserDto | null>")).toBe("UserDto");
    // A genuine multi-type union has no single payload type
    expect(unwrapToTypeName("UserDto | ErrorDto")).toBeNull();
  });
});

describe("fieldTypeCategory", () => {
  it("collapses known primitives across languages", () => {
    expect(fieldTypeCategory("string")).toBe("string");
    expect(fieldTypeCategory("String")).toBe("string");
    expect(fieldTypeCategory("Guid")).toBe("string");
    expect(fieldTypeCategory("number")).toBe("number");
    expect(fieldTypeCategory("int")).toBe("number");
    expect(fieldTypeCategory("decimal")).toBe("number");
    expect(fieldTypeCategory("boolean")).toBe("boolean");
    expect(fieldTypeCategory("bool")).toBe("boolean");
    expect(fieldTypeCategory("DateTime")).toBe("date");
  });

  it("handles arrays and nullable", () => {
    expect(fieldTypeCategory("string[]")).toBe("array<string>");
    expect(fieldTypeCategory("List<int>")).toBe("array<number>");
    expect(fieldTypeCategory("string | null")).toBe("string");
    expect(fieldTypeCategory("int?")).toBe("number");
  });

  it("returns null for unknown/custom types", () => {
    expect(fieldTypeCategory("UserDto")).toBeNull();
    expect(fieldTypeCategory(null)).toBeNull();
  });

  it("strips null/undefined union members in any position", () => {
    expect(fieldTypeCategory("null | string")).toBe("string");
    expect(fieldTypeCategory("string | null | undefined")).toBe("string");
    expect(fieldTypeCategory("undefined | int")).toBe("number");
    expect(fieldTypeCategory("null")).toBeNull();
  });

  it("returns null for a genuine multi-type union", () => {
    expect(fieldTypeCategory("string | number")).toBeNull();
    expect(typesConflict("string | number", "string")).toBe(false); // lenient
  });

  it("does not split a union nested inside a generic", () => {
    expect(fieldTypeCategory("List<string | null>")).toBe("array<string>");
  });

  it("treats 64-bit integers as distinct from number", () => {
    expect(fieldTypeCategory("bigint")).toBe("bigint");
    expect(fieldTypeCategory("long")).toBe("bigint");
    // C# long vs TS number exceeds JS precision → a real mismatch, not equivalent
    expect(typesConflict("long", "number")).toBe(true);
    expect(typesConflict("bigint", "long")).toBe(false);
    expect(typesConflict("int", "number")).toBe(false);
  });

  it("categorizes TS Date alongside C# date types", () => {
    expect(fieldTypeCategory("Date")).toBe("date");
    expect(fieldTypeCategory("DateOnly")).toBe("date");
    expect(typesConflict("Date", "DateTime")).toBe(false); // equivalent across languages
    expect(typesConflict("Date", "string")).toBe(true); // real mismatch now detected
    // TimeSpan is a duration, not a date — deliberately uncategorized so it
    // can't be silently equated with Date
    expect(fieldTypeCategory("TimeSpan")).toBeNull();
  });
});

describe("typesConflict", () => {
  it("is true only for different known categories", () => {
    expect(typesConflict("string", "int")).toBe(true);
    expect(typesConflict("boolean", "number")).toBe(true);
    expect(typesConflict("string[]", "int[]")).toBe(true);
  });
  it("is false for matching or unknown categories", () => {
    expect(typesConflict("string", "String")).toBe(false);
    expect(typesConflict("number", "decimal")).toBe(false);
    expect(typesConflict("UserDto", "UserDto")).toBe(false); // both unknown → lenient
    expect(typesConflict("string", "CustomType")).toBe(false);
  });
});
