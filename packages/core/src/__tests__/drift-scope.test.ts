import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import {
  scopeDriftToChangedFiles,
  getChangedScope,
  UnresolvableRefError,
} from "../drift/scope.js";
import { openMemoryDatabase } from "../db/connection.js";
import { initializeSchema } from "../db/schema.js";
import type { DriftEntry } from "../drift/detector.js";

function entry(partial: Partial<DriftEntry> & Pick<DriftEntry, "affectedFile">): DriftEntry {
  return {
    kind: "undocumented_module",
    severity: "error",
    description: "test",
    affectedBlock: null,
    ...partial,
  };
}

describe("scopeDriftToChangedFiles", () => {
  const entries: DriftEntry[] = [
    entry({ affectedFile: "src/a.ts" }),
    entry({ affectedFile: "src/b.ts", kind: "dependency_violation" }),
    entry({ affectedFile: null, kind: "new_dependency", severity: "info" }),
  ];

  it("keeps entries whose affected file changed", () => {
    const r = scopeDriftToChangedFiles(entries, new Set(["src/a.ts"]));
    expect(r.kept.map((e) => e.affectedFile)).toEqual(["src/a.ts"]);
  });

  it("counts entries on unchanged files separately from model-level entries", () => {
    const r = scopeDriftToChangedFiles(entries, new Set(["src/a.ts"]));
    expect(r.excludedOtherFiles).toBe(1); // src/b.ts
    expect(r.excludedNonFileAnchored).toBe(1); // new_dependency (affectedFile null)
  });

  it("keeps everything when all files changed", () => {
    const r = scopeDriftToChangedFiles(entries, new Set(["src/a.ts", "src/b.ts"]));
    expect(r.kept).toHaveLength(2);
    expect(r.excludedOtherFiles).toBe(0);
    expect(r.excludedNonFileAnchored).toBe(1);
  });

  it("keeps nothing when no file-anchored entry changed", () => {
    const r = scopeDriftToChangedFiles(entries, new Set(["src/unrelated.ts"]));
    expect(r.kept).toHaveLength(0);
    expect(r.excludedOtherFiles).toBe(2);
  });
});

describe("getChangedScope with a real git repo", () => {
  let repoDir: string;
  function git(...args: string[]): string {
    return execFileSync("git", args, { cwd: repoDir, encoding: "utf-8", timeout: 5000 }).trim();
  }

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), "arcbridge-scope-test-"));
    git("init");
    git("config", "user.email", "test@test.com");
    git("config", "user.name", "Test");
    writeFileSync(join(repoDir, "kept.ts"), "export const a = 1;");
    writeFileSync(join(repoDir, "same.ts"), "export const b = 1;");
    git("add", ".");
    git("commit", "-m", "initial");
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("returns the project-relative paths changed since the ref", () => {
    writeFileSync(join(repoDir, "kept.ts"), "export const a = 2;");
    git("add", "kept.ts");
    git("commit", "-m", "change kept");

    const scope = getChangedScope(repoDir, "HEAD~1");
    expect(scope.paths.has("kept.ts")).toBe(true);
    expect(scope.paths.has("same.ts")).toBe(false);
  });

  it("scopes drift to the changed files end to end", () => {
    writeFileSync(join(repoDir, "kept.ts"), "export const a = 2;");
    git("add", "kept.ts");
    git("commit", "-m", "change kept");

    const scope = getChangedScope(repoDir, "HEAD~1");
    const entries = [entry({ affectedFile: "kept.ts" }), entry({ affectedFile: "same.ts" })];
    const r = scopeDriftToChangedFiles(entries, scope.paths);
    expect(r.kept.map((e) => e.affectedFile)).toEqual(["kept.ts"]);
    expect(r.excludedOtherFiles).toBe(1);
  });

  it("throws UnresolvableRefError for an unknown ref", () => {
    expect(() => getChangedScope(repoDir, "no-such-ref-xyz")).toThrow(UnresolvableRefError);
  });

  it("resolves last-sync via the DB's stored sync point", () => {
    const firstSha = git("rev-parse", "HEAD");

    writeFileSync(join(repoDir, "kept.ts"), "export const a = 2;");
    git("add", "kept.ts");
    git("commit", "-m", "change kept");

    const db = openMemoryDatabase();
    initializeSchema(db);
    db.prepare(
      "INSERT INTO arcbridge_meta (key, value) VALUES ('last_sync_commit', ?)",
    ).run(firstSha);

    try {
      const scope = getChangedScope(repoDir, "last-sync", db);
      // The stored sync point resolved (label carries the sha, not the
      // "no sync point" fallback), and the diff since it sees the change.
      expect(scope.label).toContain(firstSha.slice(0, 7));
      expect(scope.paths.has("kept.ts")).toBe(true);
    } finally {
      db.close();
    }
  });
});
