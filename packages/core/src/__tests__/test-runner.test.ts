import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openMemoryDatabase } from "../db/connection.js";
import { initializeSchema } from "../db/schema.js";
import { verifyScenarios } from "../testing/runner.js";
import type Database from "better-sqlite3";

let db: Database.Database;

beforeEach(() => {
  db = openMemoryDatabase();
  initializeSchema(db);
});

afterEach(() => {
  db.close();
});

function insertScenario(
  id: string,
  name: string,
  verification: string,
  linkedTests: string[],
  status = "untested",
): void {
  db.prepare(
    `INSERT INTO quality_scenarios (id, name, category, scenario, expected, verification, linked_tests, status)
     VALUES (?, ?, 'security', 'scenario', 'expected', ?, ?, ?)`,
  ).run(id, name, verification, JSON.stringify(linkedTests), status);
}

describe("verifyScenarios", () => {
  it("returns empty results when no testable scenarios exist", () => {
    // Scenario with manual verification — should be skipped
    insertScenario("SEC-01", "Auth check", "manual", ["tests/auth.test.ts"]);

    const result = verifyScenarios(db, "/tmp/nonexistent", {
      testCommand: "echo",
      timeoutMs: 5000,
    });

    expect(result.results).toHaveLength(0);
    expect(result.updated).toBe(0);
  });

  it("skips scenarios with empty linked_tests", () => {
    insertScenario("SEC-01", "Auth check", "automatic", []);

    const result = verifyScenarios(db, "/tmp/nonexistent", {
      testCommand: "echo",
      timeoutMs: 5000,
    });

    expect(result.results).toHaveLength(0);
  });

  it("runs tests for automatic scenarios with linked_tests", () => {
    // Use 'echo' as test command — always succeeds
    insertScenario("SEC-01", "Auth check", "automatic", ["test-file.ts"]);

    const result = verifyScenarios(db, process.cwd(), {
      testCommand: "echo",
      timeoutMs: 5000,
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.scenarioId).toBe("SEC-01");
    expect(result.results[0]!.passed).toBe(true);
    expect(result.results[0]!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("detects failing tests via non-zero exit code", () => {
    insertScenario("SEC-01", "Auth check", "automatic", ["nonexistent.ts"]);

    const result = verifyScenarios(db, process.cwd(), {
      testCommand: "false", // Always exits 1
      timeoutMs: 5000,
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.passed).toBe(false);
  });

  it("updates scenario status in the database", () => {
    insertScenario("SEC-01", "Auth check", "automatic", ["test.ts"], "untested");

    verifyScenarios(db, process.cwd(), {
      testCommand: "echo",
      timeoutMs: 5000,
    });

    const row = db
      .prepare("SELECT status FROM quality_scenarios WHERE id = 'SEC-01'")
      .get() as { status: string };
    expect(row.status).toBe("passing");
  });

  it("updates scenario to failing status", () => {
    insertScenario("SEC-01", "Auth check", "automatic", ["test.ts"], "passing");

    verifyScenarios(db, process.cwd(), {
      testCommand: "false",
      timeoutMs: 5000,
    });

    const row = db
      .prepare("SELECT status FROM quality_scenarios WHERE id = 'SEC-01'")
      .get() as { status: string };
    expect(row.status).toBe("failing");
  });

  it("filters by specific scenario IDs", () => {
    insertScenario("SEC-01", "Auth check", "automatic", ["test1.ts"]);
    insertScenario("SEC-02", "Input val", "automatic", ["test2.ts"]);

    const result = verifyScenarios(db, process.cwd(), {
      testCommand: "echo",
      timeoutMs: 5000,
      scenarioIds: ["SEC-01"],
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.scenarioId).toBe("SEC-01");
  });

  it("includes semi-automatic scenarios", () => {
    insertScenario("PERF-01", "LCP check", "semi-automatic", ["test.ts"]);

    const result = verifyScenarios(db, process.cwd(), {
      testCommand: "echo",
      timeoutMs: 5000,
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.scenarioId).toBe("PERF-01");
  });

  it("does not update status if unchanged", () => {
    insertScenario("SEC-01", "Auth check", "automatic", ["test.ts"], "passing");

    const result = verifyScenarios(db, process.cwd(), {
      testCommand: "echo",
      timeoutMs: 5000,
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.passed).toBe(true);
    expect(result.updated).toBe(0); // Already "passing", no change
  });

  it("reports error for invalid linked_tests JSON", () => {
    db.prepare(
      `INSERT INTO quality_scenarios (id, name, category, scenario, expected, verification, linked_tests, status)
       VALUES ('SEC-01', 'Auth', 'security', 'scenario', 'expected', 'automatic', '{bad json}', 'untested')`,
    ).run();

    const result = verifyScenarios(db, process.cwd(), {
      testCommand: "echo",
      timeoutMs: 5000,
    });

    expect(result.results).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("SEC-01");
    expect(result.errors[0]).toContain("invalid");
  });

  it("treats empty scenarioIds array as no filter", () => {
    insertScenario("SEC-01", "Auth check", "automatic", ["test.ts"]);

    const result = verifyScenarios(db, process.cwd(), {
      testCommand: "echo",
      timeoutMs: 5000,
      scenarioIds: [],
    });

    // Empty array should behave like no filter — run all automatic scenarios
    expect(result.results).toHaveLength(1);
  });
});
