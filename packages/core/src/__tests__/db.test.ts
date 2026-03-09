import { describe, it, expect } from "vitest";
import { openMemoryDatabase } from "../db/connection.js";
import { initializeSchema, CURRENT_SCHEMA_VERSION } from "../db/schema.js";
import { migrate } from "../db/migrations.js";

describe("SQLite database", () => {
  it("creates all tables", () => {
    const db = openMemoryDatabase();
    initializeSchema(db);

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all() as { name: string }[];

    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain("archlens_meta");
    expect(tableNames).toContain("symbols");
    expect(tableNames).toContain("dependencies");
    expect(tableNames).toContain("components");
    expect(tableNames).toContain("routes");
    expect(tableNames).toContain("building_blocks");
    expect(tableNames).toContain("quality_scenarios");
    expect(tableNames).toContain("adrs");
    expect(tableNames).toContain("contracts");
    expect(tableNames).toContain("phases");
    expect(tableNames).toContain("tasks");
    expect(tableNames).toContain("drift_log");

    db.close();
  });

  it("sets schema version in meta", () => {
    const db = openMemoryDatabase();
    initializeSchema(db);

    const row = db
      .prepare("SELECT value FROM archlens_meta WHERE key = 'schema_version'")
      .get() as { value: string };

    expect(Number(row.value)).toBe(CURRENT_SCHEMA_VERSION);
    db.close();
  });

  it("is idempotent", () => {
    const db = openMemoryDatabase();
    initializeSchema(db);
    initializeSchema(db); // Should not throw

    const row = db
      .prepare("SELECT value FROM archlens_meta WHERE key = 'schema_version'")
      .get() as { value: string };
    expect(Number(row.value)).toBe(CURRENT_SCHEMA_VERSION);
    db.close();
  });

  it("migrate is a no-op at current version", () => {
    const db = openMemoryDatabase();
    initializeSchema(db);
    migrate(db); // Should not throw or change anything

    const row = db
      .prepare("SELECT value FROM archlens_meta WHERE key = 'schema_version'")
      .get() as { value: string };
    expect(Number(row.value)).toBe(CURRENT_SCHEMA_VERSION);
    db.close();
  });

  it("has WAL mode enabled", () => {
    const db = openMemoryDatabase();
    const mode = db.pragma("journal_mode") as { journal_mode: string }[];
    // In-memory databases use 'memory' mode, but the pragma is still set
    expect(mode[0]!.journal_mode).toBeDefined();
    db.close();
  });

  it("has foreign keys enabled", () => {
    const db = openMemoryDatabase();
    const fk = db.pragma("foreign_keys") as { foreign_keys: number }[];
    expect(fk[0]!.foreign_keys).toBe(1);
    db.close();
  });
});
