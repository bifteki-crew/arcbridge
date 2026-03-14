import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import {
  openMemoryDatabase,
  initializeSchema,
  indexProject,
} from "@arcbridge/core";
import type Database from "better-sqlite3";

const FIXTURE_DIR = join(
  __dirname,
  "..",
  "..",
  "..",
  "core",
  "src",
  "__tests__",
  "fixtures",
  "ts-project",
);

let db: Database.Database;

beforeEach(() => {
  db = openMemoryDatabase();
  initializeSchema(db);
  indexProject(db, { projectRoot: FIXTURE_DIR });
});

afterEach(() => {
  db.close();
});

describe("symbol search queries", () => {
  it("searches by name", () => {
    const results = db
      .prepare("SELECT id, name, kind FROM symbols WHERE name LIKE ?")
      .all("%format%") as { id: string; name: string; kind: string }[];

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.name === "formatName")).toBe(true);
  });

  it("filters by kind", () => {
    const classes = db
      .prepare("SELECT id, name FROM symbols WHERE kind = ?")
      .all("class") as { id: string; name: string }[];

    expect(classes.length).toBeGreaterThan(0);
    expect(classes.some((c) => c.name === "UserEntity")).toBe(true);
  });

  it("filters by file path prefix", () => {
    const results = db
      .prepare("SELECT name FROM symbols WHERE file_path LIKE ?")
      .all("src/models/%") as { name: string }[];

    expect(results.length).toBeGreaterThan(0);
    const names = results.map((r) => r.name);
    expect(names).toContain("UserRole");
    expect(names).toContain("User");
    expect(names).toContain("UserEntity");
  });

  it("filters by exported status", () => {
    const internal = db
      .prepare("SELECT name FROM symbols WHERE is_exported = 0")
      .all() as { name: string }[];

    expect(internal.length).toBeGreaterThan(0);
    expect(internal.some((s) => s.name === "_internalHelper")).toBe(true);
  });
});

describe("symbol detail queries", () => {
  it("retrieves a symbol by ID", () => {
    const sym = db
      .prepare("SELECT * FROM symbols WHERE id = ?")
      .get("src/utils.ts::formatName#function") as {
      name: string;
      kind: string;
      signature: string;
      doc_comment: string;
      is_exported: number;
    } | undefined;

    expect(sym).toBeDefined();
    expect(sym!.name).toBe("formatName");
    expect(sym!.kind).toBe("function");
    expect(sym!.signature).toBeTruthy();
    expect(sym!.doc_comment).toContain("Formats a name");
    expect(sym!.is_exported).toBe(1);
  });

  it("returns undefined for non-existent symbol", () => {
    const sym = db
      .prepare("SELECT * FROM symbols WHERE id = ?")
      .get("nonexistent");

    expect(sym).toBeUndefined();
  });

  it("class methods have qualified names", () => {
    const methods = db
      .prepare(
        "SELECT name, qualified_name FROM symbols WHERE qualified_name LIKE 'UserEntity.%'",
      )
      .all() as { name: string; qualified_name: string }[];

    expect(methods.length).toBeGreaterThan(0);
    expect(methods.some((m) => m.qualified_name === "UserEntity.isAdmin")).toBe(
      true,
    );
  });
});

describe("file-level graph queries", () => {
  it("lists symbols per file", () => {
    const files = db
      .prepare(
        "SELECT file_path, COUNT(*) as count FROM symbols GROUP BY file_path ORDER BY file_path",
      )
      .all() as { file_path: string; count: number }[];

    expect(files.length).toBeGreaterThan(0);

    // Each file with code should have symbols
    const utilsFile = files.find((f) => f.file_path === "src/utils.ts");
    expect(utilsFile).toBeDefined();
    expect(utilsFile!.count).toBeGreaterThanOrEqual(4); // formatName, parseIntSafe, MAX_RETRIES, Result, counter
  });

  it("finds exported symbols across the project", () => {
    const exported = db
      .prepare(
        "SELECT COUNT(*) as count FROM symbols WHERE is_exported = 1",
      )
      .get() as { count: number };

    const total = db
      .prepare("SELECT COUNT(*) as count FROM symbols")
      .get() as { count: number };

    // Most symbols in fixtures are exported
    expect(exported.count).toBeGreaterThan(0);
    expect(exported.count).toBeLessThanOrEqual(total.count);
  });
});

describe("dependency graph queries", () => {
  it("has dependency edges", () => {
    const count = (
      db.prepare("SELECT COUNT(*) as count FROM dependencies").get() as {
        count: number;
      }
    ).count;

    expect(count).toBeGreaterThan(0);
  });

  it("can query dependencies for a module", () => {
    const deps = db
      .prepare(
        `SELECT d.source_symbol, d.target_symbol, d.kind
         FROM dependencies d
         JOIN symbols s ON s.id = d.source_symbol
         WHERE s.file_path LIKE 'src/models/admin%'`,
      )
      .all() as { source_symbol: string; target_symbol: string; kind: string }[];

    expect(deps.length).toBeGreaterThan(0);

    const kinds = new Set(deps.map((d) => d.kind));
    expect(kinds.has("extends")).toBe(true);
  });

  it("can find dependents (what depends on a symbol)", () => {
    // Find what depends on UserEntity
    const dependents = db
      .prepare(
        `SELECT d.source_symbol, d.kind
         FROM dependencies d
         WHERE d.target_symbol LIKE '%UserEntity%class'`,
      )
      .all() as { source_symbol: string; kind: string }[];

    expect(dependents.length).toBeGreaterThan(0);
    // AdminEntity extends UserEntity
    expect(dependents.some((d) => d.source_symbol.includes("AdminEntity") && d.kind === "extends")).toBe(true);
  });
});
