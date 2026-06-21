import { describe, it, expect } from "vitest";
import { join, resolve, sep } from "node:path";
import { resolveWithin } from "../utils/fs.js";

const ROOT = resolve(sep, "projects", "app");

describe("resolveWithin", () => {
  it("resolves normal segments inside the root", () => {
    expect(resolveWithin(ROOT, ".arcbridge", "plan", "phases.yaml")).toBe(
      join(ROOT, ".arcbridge", "plan", "phases.yaml"),
    );
  });

  it("allows the root itself", () => {
    expect(resolveWithin(ROOT)).toBe(ROOT);
  });

  it("allows internal .. that stays inside the root", () => {
    expect(resolveWithin(ROOT, "a", "..", "b.yaml")).toBe(join(ROOT, "b.yaml"));
  });

  it("throws on traversal escaping the root", () => {
    expect(() => resolveWithin(ROOT, "..", "other")).toThrow(/escapes containment root/);
    expect(() => resolveWithin(ROOT, "../../etc/passwd")).toThrow(/escapes containment root/);
    expect(() =>
      resolveWithin(ROOT, ".arcbridge", "plan", "tasks", "../../../../escape.yaml"),
    ).toThrow(/escapes containment root/);
  });

  it("throws on absolute path segments", () => {
    expect(() => resolveWithin(ROOT, resolve(sep, "etc", "passwd"))).toThrow(
      /escapes containment root/,
    );
  });

  it("does not reject sibling directories whose names start with dots", () => {
    // "..foo" is a legal name, not a traversal
    expect(resolveWithin(ROOT, "..foo", "file.yaml")).toBe(join(ROOT, "..foo", "file.yaml"));
  });
});
