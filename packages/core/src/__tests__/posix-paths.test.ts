// Every path stored in the index is compared against forward-slashed values
// authored elsewhere: building-block code_paths from YAML, api_call URLs, and
// IDs written by a previous run on another machine. path.relative() returns
// backslashes on Windows, so an unnormalized path indexes as "src\a.ts" there
// and "src/a.ts" everywhere else — drift then reports every file as
// undocumented. These pin the invariant at the boundary.
import { describe, it, expect } from "vitest";
import { sep } from "node:path";
import { toPosixPath } from "../utils/fs.js";

describe("toPosixPath", () => {
  it("converts native separators to forward slashes", () => {
    expect(toPosixPath(["frontend", "app", "page.tsx"].join(sep))).toBe("frontend/app/page.tsx");
  });

  it("leaves already-posix paths untouched", () => {
    expect(toPosixPath("frontend/app/page.tsx")).toBe("frontend/app/page.tsx");
  });

  it("handles a bare filename and an empty path", () => {
    expect(toPosixPath("page.tsx")).toBe("page.tsx");
    expect(toPosixPath("")).toBe("");
  });
});
