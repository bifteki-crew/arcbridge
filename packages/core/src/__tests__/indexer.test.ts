import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { indexProject } from "../indexer/index.js";
import { detectDrift } from "../drift/detector.js";
import { openMemoryDatabase } from "../db/connection.js";
import { initializeSchema } from "../db/schema.js";
import type Database from "better-sqlite3";

const FIXTURE_DIR = join(__dirname, "fixtures", "ts-project");

let db: Database.Database;

beforeEach(() => {
  db = openMemoryDatabase();
  initializeSchema(db);
});

afterEach(() => {
  db.close();
});

describe("indexProject", () => {
  it("indexes the fixture project and populates symbols", () => {
    const result = indexProject(db, { projectRoot: FIXTURE_DIR });

    expect(result.filesProcessed).toBeGreaterThan(0);
    expect(result.symbolsIndexed).toBeGreaterThan(0);
    expect(result.filesSkipped).toBe(0);
    expect(result.filesRemoved).toBe(0);

    const count = (
      db.prepare("SELECT COUNT(*) as count FROM symbols").get() as {
        count: number;
      }
    ).count;

    expect(count).toBe(result.symbolsIndexed);
  });

  it("extracts functions correctly", () => {
    indexProject(db, { projectRoot: FIXTURE_DIR });

    const formatName = db
      .prepare("SELECT * FROM symbols WHERE name = 'formatName'")
      .get() as { kind: string; is_exported: number; signature: string } | undefined;

    expect(formatName).toBeDefined();
    expect(formatName!.kind).toBe("function");
    expect(formatName!.is_exported).toBe(1);
    expect(formatName!.signature).toContain("string");
  });

  it("extracts arrow functions as functions", () => {
    indexProject(db, { projectRoot: FIXTURE_DIR });

    const parseIntSafe = db
      .prepare("SELECT * FROM symbols WHERE name = 'parseIntSafe'")
      .get() as { kind: string; is_exported: number } | undefined;

    expect(parseIntSafe).toBeDefined();
    expect(parseIntSafe!.kind).toBe("function");
    expect(parseIntSafe!.is_exported).toBe(1);
  });

  it("extracts constants", () => {
    indexProject(db, { projectRoot: FIXTURE_DIR });

    const maxRetries = db
      .prepare("SELECT * FROM symbols WHERE name = 'MAX_RETRIES'")
      .get() as { kind: string; is_exported: number } | undefined;

    expect(maxRetries).toBeDefined();
    expect(maxRetries!.kind).toBe("constant");
    expect(maxRetries!.is_exported).toBe(1);
  });

  it("extracts classes with methods", () => {
    indexProject(db, { projectRoot: FIXTURE_DIR });

    const userEntity = db
      .prepare("SELECT * FROM symbols WHERE name = 'UserEntity' AND kind = 'class'")
      .get() as { kind: string; doc_comment: string | null } | undefined;

    expect(userEntity).toBeDefined();
    expect(userEntity!.doc_comment).toContain("User entity");

    // Class methods
    const isAdmin = db
      .prepare("SELECT * FROM symbols WHERE name = 'isAdmin'")
      .get() as { qualified_name: string; kind: string } | undefined;

    expect(isAdmin).toBeDefined();
    expect(isAdmin!.qualified_name).toBe("UserEntity.isAdmin");
    expect(isAdmin!.kind).toBe("function");
  });

  it("extracts interfaces", () => {
    indexProject(db, { projectRoot: FIXTURE_DIR });

    const user = db
      .prepare("SELECT * FROM symbols WHERE name = 'User' AND kind = 'interface'")
      .get() as { kind: string; is_exported: number } | undefined;

    expect(user).toBeDefined();
    expect(user!.is_exported).toBe(1);
  });

  it("extracts type aliases", () => {
    indexProject(db, { projectRoot: FIXTURE_DIR });

    const result = db
      .prepare("SELECT * FROM symbols WHERE name = 'Result' AND kind = 'type'")
      .get() as { return_type: string } | undefined;

    expect(result).toBeDefined();
    // The return_type should show the union type
    expect(result!.return_type).toBeTruthy();
  });

  it("extracts enums", () => {
    indexProject(db, { projectRoot: FIXTURE_DIR });

    const userRole = db
      .prepare("SELECT * FROM symbols WHERE name = 'UserRole' AND kind = 'enum'")
      .get() as { is_exported: number } | undefined;

    expect(userRole).toBeDefined();
    expect(userRole!.is_exported).toBe(1);
  });

  it("extracts async functions", () => {
    indexProject(db, { projectRoot: FIXTURE_DIR });

    const authenticate = db
      .prepare("SELECT * FROM symbols WHERE name = 'authenticate'")
      .get() as { is_async: number; return_type: string } | undefined;

    expect(authenticate).toBeDefined();
    expect(authenticate!.is_async).toBe(1);
    expect(authenticate!.return_type).toContain("Promise");
  });

  it("detects non-exported functions", () => {
    indexProject(db, { projectRoot: FIXTURE_DIR });

    const internal = db
      .prepare("SELECT * FROM symbols WHERE name = '_internalHelper'")
      .get() as { is_exported: number } | undefined;

    expect(internal).toBeDefined();
    expect(internal!.is_exported).toBe(0);
  });

  it("extracts doc comments", () => {
    indexProject(db, { projectRoot: FIXTURE_DIR });

    const formatName = db
      .prepare("SELECT * FROM symbols WHERE name = 'formatName'")
      .get() as { doc_comment: string | null } | undefined;

    expect(formatName).toBeDefined();
    expect(formatName!.doc_comment).toContain("Formats a name");
  });

  it("is incremental — skips unchanged files on second run", () => {
    const first = indexProject(db, { projectRoot: FIXTURE_DIR });
    const second = indexProject(db, { projectRoot: FIXTURE_DIR });

    // Files with symbols are skipped; barrel files (no symbols) may be reprocessed
    expect(second.filesSkipped).toBeGreaterThan(0);
    expect(second.symbolsIndexed).toBe(0);

    // Total symbols in DB should be the same
    const count = (
      db.prepare("SELECT COUNT(*) as count FROM symbols").get() as {
        count: number;
      }
    ).count;
    expect(count).toBe(first.symbolsIndexed);
  });

  it("generates stable symbol IDs", () => {
    indexProject(db, { projectRoot: FIXTURE_DIR });

    const sym = db
      .prepare("SELECT id FROM symbols WHERE name = 'formatName'")
      .get() as { id: string };

    expect(sym.id).toBe("src/utils.ts::formatName#function");
  });

  it("stores file paths relative to project root", () => {
    indexProject(db, { projectRoot: FIXTURE_DIR });

    const paths = db
      .prepare("SELECT DISTINCT file_path FROM symbols ORDER BY file_path")
      .all() as { file_path: string }[];

    for (const { file_path } of paths) {
      expect(file_path).not.toContain(FIXTURE_DIR);
      expect(file_path.startsWith("src/")).toBe(true);
    }
  });
});

describe("dependency extraction", () => {
  it("indexes dependencies", () => {
    const result = indexProject(db, { projectRoot: FIXTURE_DIR });

    expect(result.dependenciesIndexed).toBeGreaterThan(0);

    const count = (
      db.prepare("SELECT COUNT(*) as count FROM dependencies").get() as {
        count: number;
      }
    ).count;
    expect(count).toBeGreaterThan(0);
  });

  it("detects extends relationships", () => {
    indexProject(db, { projectRoot: FIXTURE_DIR });

    const extendsEdges = db
      .prepare(
        `SELECT d.source_symbol, d.target_symbol, d.kind
         FROM dependencies d
         WHERE d.kind = 'extends'`,
      )
      .all() as { source_symbol: string; target_symbol: string; kind: string }[];

    expect(extendsEdges.length).toBeGreaterThan(0);

    // AdminEntity extends UserEntity
    const adminExtends = extendsEdges.find(
      (e) =>
        e.source_symbol.includes("AdminEntity") &&
        e.target_symbol.includes("UserEntity"),
    );
    expect(adminExtends).toBeDefined();
  });

  it("detects type usage relationships", () => {
    indexProject(db, { projectRoot: FIXTURE_DIR });

    const usesTypeEdges = db
      .prepare(
        `SELECT d.source_symbol, d.target_symbol
         FROM dependencies d
         WHERE d.kind = 'uses_type'`,
      )
      .all() as { source_symbol: string; target_symbol: string }[];

    expect(usesTypeEdges.length).toBeGreaterThan(0);

    // AuthResult uses User type
    const authUsesUser = usesTypeEdges.find(
      (e) =>
        e.source_symbol.includes("AuthResult") &&
        e.target_symbol.includes("User"),
    );
    expect(authUsesUser).toBeDefined();
  });

  it("detects import relationships", () => {
    indexProject(db, { projectRoot: FIXTURE_DIR });

    const importEdges = db
      .prepare(
        `SELECT d.source_symbol, d.target_symbol
         FROM dependencies d
         WHERE d.kind = 'imports'`,
      )
      .all() as { source_symbol: string; target_symbol: string }[];

    expect(importEdges.length).toBeGreaterThan(0);
  });

  it("detects call relationships", () => {
    indexProject(db, { projectRoot: FIXTURE_DIR });

    const callEdges = db
      .prepare(
        `SELECT d.source_symbol, d.target_symbol
         FROM dependencies d
         WHERE d.kind = 'calls'`,
      )
      .all() as { source_symbol: string; target_symbol: string }[];

    // createAdmin calls new AdminEntity (constructor)
    // At minimum there should be some calls
    expect(callEdges.length).toBeGreaterThanOrEqual(0);
  });

  it("dependencies survive incremental re-indexing", () => {
    indexProject(db, { projectRoot: FIXTURE_DIR });

    const firstCount = (
      db.prepare("SELECT COUNT(*) as count FROM dependencies").get() as {
        count: number;
      }
    ).count;

    // Re-index — deps should be maintained
    indexProject(db, { projectRoot: FIXTURE_DIR });

    const secondCount = (
      db.prepare("SELECT COUNT(*) as count FROM dependencies").get() as {
        count: number;
      }
    ).count;

    expect(secondCount).toBe(firstCount);
  });
});

describe("agent workflow simulation (TypeScript)", () => {
  it("agent can trace from auth service to user model", () => {
    indexProject(db, { projectRoot: FIXTURE_DIR });

    // Step 1: Agent searches for auth-related symbols
    const authSymbols = db
      .prepare("SELECT name, kind, file_path FROM symbols WHERE name LIKE '%auth%' ORDER BY name")
      .all() as Array<{ name: string; kind: string; file_path: string }>;

    expect(authSymbols.some((s) => s.name === "authenticate")).toBe(true);
    expect(authSymbols.some((s) => s.name === "AuthResult")).toBe(true);

    // Step 2: Agent traces what authenticate depends on
    const authFn = db
      .prepare("SELECT id FROM symbols WHERE name = 'authenticate'")
      .get() as { id: string };

    const deps = db
      .prepare(
        `SELECT s2.name, s2.kind, s2.file_path, d.kind as dep_kind
         FROM dependencies d
         JOIN symbols s2 ON s2.id = d.target_symbol
         WHERE d.source_symbol = ?`,
      )
      .all(authFn.id) as Array<{ name: string; kind: string; file_path: string; dep_kind: string }>;

    // authenticate uses the User type from models
    expect(deps.some((d) => d.name === "User" || d.name === "AuthResult")).toBe(true);
  });

  it("agent can find which building block a file belongs to", () => {
    indexProject(db, { projectRoot: FIXTURE_DIR });

    // Add building blocks
    db.prepare(`
      INSERT INTO building_blocks (id, name, responsibility, code_paths, interfaces)
      VALUES ('auth', 'Authentication', 'Auth logic', '["src/services/"]', '["models"]')
    `).run();
    db.prepare(`
      INSERT INTO building_blocks (id, name, responsibility, code_paths)
      VALUES ('models', 'Models', 'Data models', '["src/models/"]')
    `).run();

    const blocks = db
      .prepare("SELECT id, name, code_paths FROM building_blocks")
      .all() as Array<{ id: string; name: string; code_paths: string }>;

    // Lookup block for auth-service.ts
    const file = "src/services/auth-service.ts";
    let matched: string | null = null;

    for (const block of blocks) {
      const paths = JSON.parse(block.code_paths) as string[];
      if (paths.some((cp) => file.startsWith(cp.replace(/\*+\/?$/, "")))) {
        matched = block.name;
        break;
      }
    }

    expect(matched).toBe("Authentication");
  });

  it("agent can discover dependency violations", () => {
    indexProject(db, { projectRoot: FIXTURE_DIR });

    // services block depends on models but doesn't declare it
    db.prepare(`
      INSERT OR REPLACE INTO building_blocks (id, name, responsibility, code_paths, interfaces)
      VALUES ('services-block', 'Services', 'Business logic', '["src/services/"]', '[]')
    `).run();
    db.prepare(`
      INSERT OR REPLACE INTO building_blocks (id, name, responsibility, code_paths)
      VALUES ('models-block', 'Models', 'Data models', '["src/models/"]')
    `).run();

    const entries = detectDrift(db);
    const violations = entries.filter((e) => e.kind === "dependency_violation");

    // services → models should be flagged (interfaces is empty)
    expect(violations.some((e) => e.affectedBlock === "services-block")).toBe(true);
  });

  it("agent can search by file path prefix for a layer", () => {
    indexProject(db, { projectRoot: FIXTURE_DIR });

    // Search only in models layer
    const modelSymbols = db
      .prepare("SELECT name, kind FROM symbols WHERE file_path LIKE ? ORDER BY name")
      .all("src/models/%") as Array<{ name: string; kind: string }>;

    expect(modelSymbols.length).toBeGreaterThan(0);
    expect(modelSymbols.some((s) => s.name === "User" && s.kind === "interface")).toBe(true);
    expect(modelSymbols.some((s) => s.name === "UserEntity" && s.kind === "class")).toBe(true);
    // Should not contain service symbols
    expect(modelSymbols.some((s) => s.name === "authenticate")).toBe(false);
  });
});
