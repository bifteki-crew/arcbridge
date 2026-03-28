import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, unlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { openMemoryDatabase } from "../db/connection.js";
import { initializeSchema } from "../db/schema.js";
import {
  resolveRef,
  getChangedFiles,
  getUncommittedChanges,
  scopeToProject,
  getHeadSha,
  setSyncCommit,
  type ChangedFile,
} from "../git/helpers.js";
import type { Database } from "../db/connection.js";

let db: Database;

beforeEach(() => {
  db = openMemoryDatabase();
  initializeSchema(db);
});

afterEach(() => {
  db.close();
});

describe("resolveRef", () => {
  it("resolves 'last-commit' to HEAD~1", () => {
    const ref = resolveRef("/tmp", "last-commit");
    expect(ref.sha).toBe("HEAD~1");
    expect(ref.label).toBe("last commit");
  });

  it("resolves 'last-sync' to stored commit when available", () => {
    db.prepare(
      "INSERT INTO arcbridge_meta (key, value) VALUES ('last_sync_commit', 'abc1234567890')",
    ).run();

    const ref = resolveRef("/tmp", "last-sync", db);
    expect(ref.sha).toBe("abc1234567890");
    expect(ref.label).toContain("abc1234");
  });

  it("resolves 'last-sync' to HEAD~1 when no stored commit", () => {
    const ref = resolveRef("/tmp", "last-sync", db);
    expect(ref.sha).toBe("HEAD~1");
    expect(ref.label).toContain("no sync point");
  });

  it("resolves 'last-phase' to stored commit when available", () => {
    db.prepare(
      "INSERT INTO arcbridge_meta (key, value) VALUES ('phase_sync_commit', 'def7890123456')",
    ).run();

    const ref = resolveRef("/tmp", "last-phase", db);
    expect(ref.sha).toBe("def7890123456");
  });

  it("resolves 'last-phase' to HEAD~5 when no stored commit", () => {
    const ref = resolveRef("/tmp", "last-phase", db);
    expect(ref.sha).toBe("HEAD~5");
  });

  it("passes through arbitrary git refs", () => {
    const ref = resolveRef("/tmp", "main");
    expect(ref.sha).toBe("main");
    expect(ref.label).toBe("main");
  });
});

describe("setSyncCommit", () => {
  it("stores sync commit in arcbridge_meta", () => {
    setSyncCommit(db, "last_sync_commit", "abc123");

    const row = db
      .prepare("SELECT value FROM arcbridge_meta WHERE key = 'last_sync_commit'")
      .get() as { value: string };

    expect(row.value).toBe("abc123");
  });

  it("overwrites previous sync commit", () => {
    setSyncCommit(db, "last_sync_commit", "abc123");
    setSyncCommit(db, "last_sync_commit", "def456");

    const row = db
      .prepare("SELECT value FROM arcbridge_meta WHERE key = 'last_sync_commit'")
      .get() as { value: string };

    expect(row.value).toBe("def456");
  });
});

describe("getHeadSha", () => {
  it("returns null for non-git directories", () => {
    const sha = getHeadSha("/tmp");
    expect(sha).toBeNull();
  });
});

describe("getChangedFiles", () => {
  it("returns empty array for non-git directories", () => {
    const files = getChangedFiles("/tmp", "HEAD~1");
    expect(files).toEqual([]);
  });
});

describe("getUncommittedChanges", () => {
  it("returns empty array for non-git directories", () => {
    const files = getUncommittedChanges("/tmp");
    expect(files).toEqual([]);
  });
});

describe("getChangedFiles with real git repo", () => {
  let repoDir: string;

  function git(...args: string[]): string {
    return execFileSync("git", args, {
      cwd: repoDir,
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
  }

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), "arcbridge-git-test-"));
    git("init");
    git("config", "user.email", "test@test.com");
    git("config", "user.name", "Test");
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("includes both committed and uncommitted changes", () => {
    // Create and commit two files
    writeFileSync(join(repoDir, "file-a.ts"), "export const a = 1;");
    writeFileSync(join(repoDir, "file-b.ts"), "export const b = 1;");
    git("add", ".");
    git("commit", "-m", "initial");

    // Commit a change to file-a
    writeFileSync(join(repoDir, "file-a.ts"), "export const a = 2;");
    git("add", "file-a.ts");
    git("commit", "-m", "modify a");

    // Modify file-b (uncommitted)
    writeFileSync(join(repoDir, "file-b.ts"), "export const b = 2;");

    const files = getChangedFiles(repoDir, "HEAD~1");

    // Should see committed file-a AND uncommitted file-b
    const paths = files.map((f) => f.path);
    expect(paths).toContain("file-a.ts");
    expect(paths).toContain("file-b.ts");
  });

  it("uncommitted delete overrides committed status", () => {
    // Create two files and commit
    writeFileSync(join(repoDir, "keep.ts"), "export const a = 1;");
    writeFileSync(join(repoDir, "remove.ts"), "export const b = 1;");
    git("add", ".");
    git("commit", "-m", "initial");

    // Modify keep.ts and commit
    writeFileSync(join(repoDir, "keep.ts"), "export const a = 2;");
    git("add", "keep.ts");
    git("commit", "-m", "modify keep");

    // Delete remove.ts (uncommitted)
    unlinkSync(join(repoDir, "remove.ts"));
    git("add", "remove.ts"); // stage the deletion

    const files = getChangedFiles(repoDir, "HEAD~1");

    const removeFile = files.find((f) => f.path === "remove.ts");
    expect(removeFile).toBeDefined();
    expect(removeFile!.status).toBe("deleted");
  });

  it("preserves committed 'added' status over uncommitted 'modified'", () => {
    // Initial commit
    writeFileSync(join(repoDir, "old.ts"), "export const x = 1;");
    git("add", ".");
    git("commit", "-m", "initial");

    // Add a new file and commit
    writeFileSync(join(repoDir, "new.ts"), "export const y = 1;");
    git("add", "new.ts");
    git("commit", "-m", "add new");

    // Modify the new file (uncommitted)
    writeFileSync(join(repoDir, "new.ts"), "export const y = 2;");

    const files = getChangedFiles(repoDir, "HEAD~1");

    const newFile = files.find((f) => f.path === "new.ts");
    expect(newFile).toBeDefined();
    // Should keep "added" from committed diff, not "modified" from uncommitted
    expect(newFile!.status).toBe("added");
  });
});

describe("scopeToProject", () => {
  let repoDir: string;

  function git(...args: string[]): string {
    return execFileSync("git", args, {
      cwd: repoDir,
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
  }

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), "arcbridge-scope-test-"));
    git("init");
    git("config", "user.email", "test@test.com");
    git("config", "user.name", "Test");
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("returns all files when project is repo root", () => {
    const files: ChangedFile[] = [
      { status: "modified", path: "src/app.ts" },
      { status: "added", path: "README.md" },
    ];

    const result = scopeToProject(files, repoDir);
    expect(result.length).toBe(2);
  });

  it("filters to project subdirectory in monorepo", () => {
    const subDir = join(repoDir, "packages", "my-app");
    mkdirSync(subDir, { recursive: true });

    const files: ChangedFile[] = [
      { status: "modified", path: "packages/my-app/src/index.ts" },
      { status: "modified", path: "packages/other/src/index.ts" },
      { status: "modified", path: ".gitignore" },
    ];

    const result = scopeToProject(files, subDir);
    expect(result.length).toBe(1);
    // Path should be stripped to project-relative
    expect(result[0].path).toBe("src/index.ts");
  });

  it("returns all files when not in a git repo", () => {
    const nonGitDir = mkdtempSync(join(tmpdir(), "arcbridge-no-git-"));
    const files: ChangedFile[] = [
      { status: "modified", path: "src/app.ts" },
    ];

    const result = scopeToProject(files, nonGitDir);
    expect(result.length).toBe(1);
    rmSync(nonGitDir, { recursive: true, force: true });
  });
});
