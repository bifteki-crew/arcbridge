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
