import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDatabase, openMemoryDatabase, transaction } from "../db/connection.js";
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

    expect(tableNames).toContain("arcbridge_meta");
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
      .prepare("SELECT value FROM arcbridge_meta WHERE key = 'schema_version'")
      .get() as { value: string };

    expect(Number(row.value)).toBe(CURRENT_SCHEMA_VERSION);
    db.close();
  });

  it("is idempotent", () => {
    const db = openMemoryDatabase();
    initializeSchema(db);
    initializeSchema(db); // Should not throw

    const row = db
      .prepare("SELECT value FROM arcbridge_meta WHERE key = 'schema_version'")
      .get() as { value: string };
    expect(Number(row.value)).toBe(CURRENT_SCHEMA_VERSION);
    db.close();
  });

  it("migrate is a no-op at current version", () => {
    const db = openMemoryDatabase();
    initializeSchema(db);
    migrate(db); // Should not throw or change anything

    const row = db
      .prepare("SELECT value FROM arcbridge_meta WHERE key = 'schema_version'")
      .get() as { value: string };
    expect(Number(row.value)).toBe(CURRENT_SCHEMA_VERSION);
    db.close();
  });

  it("has WAL mode enabled for file-backed databases", () => {
    const dir = mkdtempSync(join(tmpdir(), "arcbridge-db-test-"));
    const dbPath = join(dir, "test.db");
    const db = openDatabase(dbPath);
    const mode = db.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
    expect(mode.journal_mode).toBe("wal");
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("has foreign keys enabled", () => {
    const db = openMemoryDatabase();
    const fk = db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number };
    expect(fk.foreign_keys).toBe(1);
    db.close();
  });

  describe("transaction()", () => {
    it("commits on success", () => {
      const db = openMemoryDatabase();
      db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)");

      transaction(db, () => {
        db.prepare("INSERT INTO t (val) VALUES (?)").run("a");
        db.prepare("INSERT INTO t (val) VALUES (?)").run("b");
      });

      const rows = db.prepare("SELECT * FROM t").all() as { val: string }[];
      expect(rows.length).toBe(2);
      db.close();
    });

    it("rolls back on error", () => {
      const db = openMemoryDatabase();
      db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)");

      try {
        transaction(db, () => {
          db.prepare("INSERT INTO t (val) VALUES (?)").run("a");
          throw new Error("intentional");
        });
      } catch {
        // expected
      }

      const rows = db.prepare("SELECT * FROM t").all() as { val: string }[];
      expect(rows.length).toBe(0);
      db.close();
    });

    it("supports nested transactions via SAVEPOINTs", () => {
      const db = openMemoryDatabase();
      db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)");

      transaction(db, () => {
        db.prepare("INSERT INTO t (val) VALUES (?)").run("outer");

        transaction(db, () => {
          db.prepare("INSERT INTO t (val) VALUES (?)").run("inner");
        });
      });

      const rows = db.prepare("SELECT * FROM t").all() as { val: string }[];
      expect(rows.length).toBe(2);
      expect(rows.map((r) => r.val)).toContain("outer");
      expect(rows.map((r) => r.val)).toContain("inner");
      db.close();
    });

    it("rolls back inner transaction without affecting outer", () => {
      const db = openMemoryDatabase();
      db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)");

      transaction(db, () => {
        db.prepare("INSERT INTO t (val) VALUES (?)").run("outer");

        try {
          transaction(db, () => {
            db.prepare("INSERT INTO t (val) VALUES (?)").run("inner");
            throw new Error("inner fails");
          });
        } catch {
          // inner rolled back
        }
      });

      const rows = db.prepare("SELECT * FROM t").all() as { val: string }[];
      expect(rows.length).toBe(1);
      expect(rows[0].val).toBe("outer");
      db.close();
    });

    it("rolls back everything when outer fails after inner succeeds", () => {
      const db = openMemoryDatabase();
      db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)");

      try {
        transaction(db, () => {
          db.prepare("INSERT INTO t (val) VALUES (?)").run("outer");

          transaction(db, () => {
            db.prepare("INSERT INTO t (val) VALUES (?)").run("inner");
          });

          throw new Error("outer fails after inner");
        });
      } catch {
        // expected
      }

      const rows = db.prepare("SELECT * FROM t").all() as { val: string }[];
      expect(rows.length).toBe(0);
      db.close();
    });
  });

  describe("cancelled task status", () => {
    it("allows inserting tasks with cancelled status", () => {
      const db = openMemoryDatabase();
      initializeSchema(db);

      db.prepare("INSERT INTO phases (id, name, phase_number, status, description) VALUES (?, ?, ?, ?, ?)").run(
        "phase-0", "Setup", 0, "in-progress", "Test phase",
      );
      db.prepare("INSERT INTO tasks (id, phase_id, title, status, quality_scenarios, acceptance_criteria, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
        "task-1", "phase-0", "Example task", "cancelled", "[]", "[]", new Date().toISOString(),
      );

      const task = db.prepare("SELECT status FROM tasks WHERE id = ?").get("task-1") as { status: string };
      expect(task.status).toBe("cancelled");
      db.close();
    });

    it("cancelled tasks are excluded from incomplete count", () => {
      const db = openMemoryDatabase();
      initializeSchema(db);

      db.prepare("INSERT INTO phases (id, name, phase_number, status, description) VALUES (?, ?, ?, ?, ?)").run(
        "phase-0", "Setup", 0, "in-progress", "Test phase",
      );

      const now = new Date().toISOString();
      db.prepare("INSERT INTO tasks (id, phase_id, title, status, quality_scenarios, acceptance_criteria, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
        "task-1", "phase-0", "Done task", "done", "[]", "[]", now,
      );
      db.prepare("INSERT INTO tasks (id, phase_id, title, status, quality_scenarios, acceptance_criteria, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
        "task-2", "phase-0", "Cancelled task", "cancelled", "[]", "[]", now,
      );
      db.prepare("INSERT INTO tasks (id, phase_id, title, status, quality_scenarios, acceptance_criteria, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
        "task-3", "phase-0", "Todo task", "todo", "[]", "[]", now,
      );

      // Cancelled tasks should not count as incomplete
      const incomplete = db.prepare(
        "SELECT COUNT(*) as count FROM tasks WHERE phase_id = ? AND status NOT IN ('done', 'cancelled')",
      ).get("phase-0") as { count: number };
      expect(incomplete.count).toBe(1); // only task-3

      // Cancelled tasks should not count in total
      const stats = db.prepare(
        "SELECT SUM(CASE WHEN status != 'cancelled' THEN 1 ELSE 0 END) as total, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done FROM tasks WHERE phase_id = ?",
      ).get("phase-0") as { total: number; done: number };
      expect(stats.total).toBe(2); // task-1 + task-3 (not task-2)
      expect(stats.done).toBe(1);  // task-1

      db.close();
    });
  });

  describe("task deletion", () => {
    it("deletes task from database", () => {
      const db = openMemoryDatabase();
      initializeSchema(db);

      db.prepare("INSERT INTO phases (id, name, phase_number, status, description) VALUES (?, ?, ?, ?, ?)").run(
        "phase-0", "Setup", 0, "in-progress", "Test phase",
      );
      db.prepare("INSERT INTO tasks (id, phase_id, title, status, quality_scenarios, acceptance_criteria, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
        "task-1", "phase-0", "Example task", "todo", "[]", "[]", new Date().toISOString(),
      );

      expect(db.prepare("SELECT COUNT(*) as n FROM tasks").get()).toEqual({ n: 1 });

      db.prepare("DELETE FROM tasks WHERE id = ?").run("task-1");

      expect(db.prepare("SELECT COUNT(*) as n FROM tasks").get()).toEqual({ n: 0 });
      db.close();
    });
  });

  describe("schema migration v3", () => {
    it("migrates v2 schema to v3 (adds cancelled status)", () => {
      const db = openMemoryDatabase();
      initializeSchema(db);

      // Simulate v2 by downgrading version
      db.prepare("UPDATE arcbridge_meta SET value = '2' WHERE key = 'schema_version'").run();

      // Migration should succeed
      migrate(db);

      const version = db.prepare("SELECT value FROM arcbridge_meta WHERE key = 'schema_version'").get() as { value: string };
      expect(Number(version.value)).toBe(CURRENT_SCHEMA_VERSION);

      // Should accept cancelled status after migration
      db.prepare("INSERT INTO phases (id, name, phase_number, status, description) VALUES (?, ?, ?, ?, ?)").run(
        "phase-0", "Setup", 0, "in-progress", "Test",
      );
      db.prepare("INSERT INTO tasks (id, phase_id, title, status, quality_scenarios, acceptance_criteria, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
        "task-1", "phase-0", "Test", "cancelled", "[]", "[]", new Date().toISOString(),
      );

      const task = db.prepare("SELECT status FROM tasks WHERE id = 'task-1'").get() as { status: string };
      expect(task.status).toBe("cancelled");

      db.close();
    });
  });
});
