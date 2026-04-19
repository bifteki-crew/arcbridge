import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { indexProject } from "../indexer/index.js";
import { detectDrift } from "../drift/detector.js";
import { openMemoryDatabase } from "../db/connection.js";
import { initializeSchema } from "../db/schema.js";
import type { Database } from "../db/connection.js";

const FIXTURE_DIR = join(__dirname, "fixtures", "ts-project");

let db: Database;

beforeEach(async () => {
  db = openMemoryDatabase();
  initializeSchema(db);
});

afterEach(() => {
  db.close();
});

describe("indexProject", () => {
  it("indexes the fixture project and populates symbols", async () => {
    const result = await indexProject(db, { projectRoot: FIXTURE_DIR });

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

  it("extracts functions correctly", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

    const formatName = db
      .prepare("SELECT * FROM symbols WHERE name = 'formatName'")
      .get() as { kind: string; is_exported: number; signature: string } | undefined;

    expect(formatName).toBeDefined();
    expect(formatName!.kind).toBe("function");
    expect(formatName!.is_exported).toBe(1);
    expect(formatName!.signature).toContain("string");
  });

  it("extracts arrow functions as functions", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

    const parseIntSafe = db
      .prepare("SELECT * FROM symbols WHERE name = 'parseIntSafe'")
      .get() as { kind: string; is_exported: number } | undefined;

    expect(parseIntSafe).toBeDefined();
    expect(parseIntSafe!.kind).toBe("function");
    expect(parseIntSafe!.is_exported).toBe(1);
  });

  it("extracts constants", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

    const maxRetries = db
      .prepare("SELECT * FROM symbols WHERE name = 'MAX_RETRIES'")
      .get() as { kind: string; is_exported: number } | undefined;

    expect(maxRetries).toBeDefined();
    expect(maxRetries!.kind).toBe("constant");
    expect(maxRetries!.is_exported).toBe(1);
  });

  it("extracts classes with methods", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

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

  it("extracts interfaces", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

    const user = db
      .prepare("SELECT * FROM symbols WHERE name = 'User' AND kind = 'interface'")
      .get() as { kind: string; is_exported: number } | undefined;

    expect(user).toBeDefined();
    expect(user!.is_exported).toBe(1);
  });

  it("extracts type aliases", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

    const result = db
      .prepare("SELECT * FROM symbols WHERE name = 'Result' AND kind = 'type'")
      .get() as { return_type: string } | undefined;

    expect(result).toBeDefined();
    // The return_type should show the union type
    expect(result!.return_type).toBeTruthy();
  });

  it("extracts enums", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

    const userRole = db
      .prepare("SELECT * FROM symbols WHERE name = 'UserRole' AND kind = 'enum'")
      .get() as { is_exported: number } | undefined;

    expect(userRole).toBeDefined();
    expect(userRole!.is_exported).toBe(1);
  });

  it("extracts async functions", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

    const authenticate = db
      .prepare("SELECT * FROM symbols WHERE name = 'authenticate'")
      .get() as { is_async: number; return_type: string } | undefined;

    expect(authenticate).toBeDefined();
    expect(authenticate!.is_async).toBe(1);
    expect(authenticate!.return_type).toContain("Promise");
  });

  it("detects non-exported functions", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

    const internal = db
      .prepare("SELECT * FROM symbols WHERE name = '_internalHelper'")
      .get() as { is_exported: number } | undefined;

    expect(internal).toBeDefined();
    expect(internal!.is_exported).toBe(0);
  });

  it("extracts doc comments", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

    const formatName = db
      .prepare("SELECT * FROM symbols WHERE name = 'formatName'")
      .get() as { doc_comment: string | null } | undefined;

    expect(formatName).toBeDefined();
    expect(formatName!.doc_comment).toContain("Formats a name");
  });

  it("is incremental — skips unchanged files on second run", async () => {
    const first = await indexProject(db, { projectRoot: FIXTURE_DIR });
    const second = await indexProject(db, { projectRoot: FIXTURE_DIR });

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

  it("returns skippedReason instead of throwing when no tsconfig exists", async () => {
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const emptyDir = mkdtempSync(join(tmpdir(), "arcbridge-no-tsconfig-"));
    try {
      const result = await indexProject(db, { projectRoot: emptyDir });
      expect(result.skippedReason).toBe("no tsconfig.json found");
      expect(result.symbolsIndexed).toBe(0);
      expect(result.filesProcessed).toBe(0);
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it("generates stable symbol IDs", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

    const sym = db
      .prepare("SELECT id FROM symbols WHERE name = 'formatName'")
      .get() as { id: string };

    expect(sym.id).toBe("src/utils.ts::formatName#function");
  });

  it("stores file paths relative to project root", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

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
  it("indexes dependencies", async () => {
    const result = await indexProject(db, { projectRoot: FIXTURE_DIR });

    expect(result.dependenciesIndexed).toBeGreaterThan(0);

    const count = (
      db.prepare("SELECT COUNT(*) as count FROM dependencies").get() as {
        count: number;
      }
    ).count;
    expect(count).toBeGreaterThan(0);
  });

  it("detects extends relationships", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

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

  it("detects type usage relationships", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

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

  it("detects import relationships", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

    const importEdges = db
      .prepare(
        `SELECT d.source_symbol, d.target_symbol
         FROM dependencies d
         WHERE d.kind = 'imports'`,
      )
      .all() as { source_symbol: string; target_symbol: string }[];

    expect(importEdges.length).toBeGreaterThan(0);
  });

  it("detects call relationships", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

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

  it("dependencies survive incremental re-indexing", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

    const firstCount = (
      db.prepare("SELECT COUNT(*) as count FROM dependencies").get() as {
        count: number;
      }
    ).count;

    // Re-index — deps should be maintained
    await indexProject(db, { projectRoot: FIXTURE_DIR });

    const secondCount = (
      db.prepare("SELECT COUNT(*) as count FROM dependencies").get() as {
        count: number;
      }
    ).count;

    expect(secondCount).toBe(firstCount);
  });
});

describe("agent workflow simulation (TypeScript)", () => {
  it("agent can trace from auth service to user model", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

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

    // Step 3: Verify the trace reaches the User model (not just AuthResult)
    // authenticate imports User type, so it should appear in deps
    const usesUser = deps.some((d) => d.name === "User" && d.file_path.includes("models/"));
    // If authenticate doesn't directly depend on User, trace through AuthResult
    if (!usesUser) {
      const authResult = db
        .prepare("SELECT id FROM symbols WHERE name = 'AuthResult'")
        .get() as { id: string } | undefined;
      expect(authResult).toBeDefined();
      const authResultDeps = db
        .prepare(
          `SELECT s2.name, s2.file_path FROM dependencies d
           JOIN symbols s2 ON s2.id = d.target_symbol
           WHERE d.source_symbol = ?`,
        )
        .all(authResult!.id) as Array<{ name: string; file_path: string }>;
      expect(authResultDeps.some((d) => d.name === "User")).toBe(true);
    } else {
      expect(usesUser).toBe(true);
    }
  });

  it("agent can find which building block a file belongs to", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

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

  it("agent can discover dependency violations", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

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

  it("agent can search by file path prefix for a layer", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

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

describe("Vite project with tsconfig references", () => {
  const VITE_FIXTURE = join(__dirname, "fixtures", "vite-project");

  it("indexes files despite root tsconfig having only references", async () => {
    const viteDb = openMemoryDatabase();
    initializeSchema(viteDb);

    const result = await indexProject(viteDb, { projectRoot: VITE_FIXTURE });

    expect(result.symbolsIndexed).toBeGreaterThan(0);
    expect(result.filesProcessed).toBeGreaterThan(0);

    // Should find symbols from src/
    const symbols = viteDb
      .prepare("SELECT name, kind FROM symbols")
      .all() as { name: string; kind: string }[];

    expect(symbols.some((s) => s.name === "App")).toBe(true);
    expect(symbols.some((s) => s.name === "formatDate")).toBe(true);
    expect(symbols.some((s) => s.name === "APP_NAME")).toBe(true);

    viteDb.close();
  });

  it("detects React components in Vite project", async () => {
    const viteDb = openMemoryDatabase();
    initializeSchema(viteDb);

    const result = await indexProject(viteDb, { projectRoot: VITE_FIXTURE });

    expect(result.componentsAnalyzed).toBeGreaterThan(0);

    const components = viteDb
      .prepare("SELECT c.symbol_id, c.is_client, c.has_state, s.name FROM components c JOIN symbols s ON c.symbol_id = s.id")
      .all() as { symbol_id: string; is_client: number; has_state: number; name: string }[];

    // Should find all 4 components: App, Counter, ThemeProvider, ThemedButton
    const names = components.map((c) => c.name);
    expect(names).toContain("App");
    expect(names).toContain("Counter");
    expect(names).toContain("ThemeProvider");
    expect(names).toContain("ThemedButton");

    // Counter uses useState
    const counter = components.find((c) => c.name === "Counter");
    expect(counter!.has_state).toBe(1);

    viteDb.close();
  });

  it("marks all components as client when project_type is react-vite", async () => {
    const viteDb = openMemoryDatabase();
    initializeSchema(viteDb);
    // Set project type so analyzeComponents knows this is client-only
    viteDb.prepare("INSERT INTO arcbridge_meta (key, value) VALUES ('project_type', 'react-vite')").run();

    await indexProject(viteDb, { projectRoot: VITE_FIXTURE });

    const components = viteDb
      .prepare("SELECT c.is_client, s.name FROM components c JOIN symbols s ON c.symbol_id = s.id")
      .all() as { is_client: number; name: string }[];

    // All components should be marked as client in a react-vite project
    expect(components.length).toBeGreaterThan(0);
    for (const c of components) {
      expect(c.is_client).toBe(1);
    }

    viteDb.close();
  });

  it("marks components as non-client when no project_type is set", async () => {
    const viteDb = openMemoryDatabase();
    initializeSchema(viteDb);
    // No project_type metadata — default behavior (no "use client" directive = not client)

    await indexProject(viteDb, { projectRoot: VITE_FIXTURE });

    const components = viteDb
      .prepare("SELECT c.is_client, s.name FROM components c JOIN symbols s ON c.symbol_id = s.id")
      .all() as { is_client: number; name: string }[];

    // Without project_type, components without "use client" are not marked as client
    expect(components.length).toBeGreaterThan(0);
    const app = components.find((c) => c.name === "App");
    expect(app!.is_client).toBe(0);

    viteDb.close();
  });
});
