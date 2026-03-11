import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openMemoryDatabase } from "../db/connection.js";
import { initializeSchema } from "../db/schema.js";
import {
  resolveRef,
  getChangedFiles,
  getUncommittedChanges,
  getHeadSha,
  setSyncCommit,
} from "../git/helpers.js";
import type Database from "better-sqlite3";

let db: Database.Database;

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
      "INSERT INTO archlens_meta (key, value) VALUES ('last_sync_commit', 'abc1234567890')",
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
      "INSERT INTO archlens_meta (key, value) VALUES ('phase_sync_commit', 'def7890123456')",
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
  it("stores sync commit in archlens_meta", () => {
    setSyncCommit(db, "last_sync_commit", "abc123");

    const row = db
      .prepare("SELECT value FROM archlens_meta WHERE key = 'last_sync_commit'")
      .get() as { value: string };

    expect(row.value).toBe("abc123");
  });

  it("overwrites previous sync commit", () => {
    setSyncCommit(db, "last_sync_commit", "abc123");
    setSyncCommit(db, "last_sync_commit", "def456");

    const row = db
      .prepare("SELECT value FROM archlens_meta WHERE key = 'last_sync_commit'")
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
