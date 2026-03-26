import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openMemoryDatabase } from "../db/connection.js";
import { initializeSchema } from "../db/schema.js";
import { verifyScenarios } from "../testing/runner.js";
import type { Database } from "../db/connection.js";

let db: Database;
let tempDir: string;

beforeEach(() => {
  db = openMemoryDatabase();
  initializeSchema(db);
  tempDir = mkdtempSync(join(tmpdir(), "arcbridge-test-runner-"));
});

afterEach(() => {
  db.close();
  rmSync(tempDir, { recursive: true, force: true });
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
    // Create a real test file so it passes the existence check
    writeFileSync(join(tempDir, "test-file.ts"), "// test");
    insertScenario("SEC-01", "Auth check", "automatic", ["test-file.ts"]);

    const result = verifyScenarios(db, tempDir, {
      testCommand: "echo",
      timeoutMs: 5000,
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.scenarioId).toBe("SEC-01");
    expect(result.results[0]!.passed).toBe(true);
    expect(result.results[0]!.outcome).toBe("passed");
    expect(result.results[0]!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("detects failing tests via non-zero exit code", () => {
    writeFileSync(join(tempDir, "failing.ts"), "// test");
    insertScenario("SEC-01", "Auth check", "automatic", ["failing.ts"]);

    const result = verifyScenarios(db, tempDir, {
      testCommand: "false", // Always exits 1
      timeoutMs: 5000,
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.passed).toBe(false);
    expect(result.results[0]!.outcome).toBe("failed");
  });

  it("reports missing test files without running", () => {
    insertScenario("SEC-01", "Auth check", "automatic", ["nonexistent.ts"]);

    const result = verifyScenarios(db, tempDir, {
      testCommand: "echo",
      timeoutMs: 5000,
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.passed).toBe(false);
    expect(result.results[0]!.outcome).toBe("missing");
    expect(result.results[0]!.output).toContain("nonexistent.ts");
    expect(result.results[0]!.durationMs).toBe(0);
  });

  it("updates scenario status in the database", () => {
    writeFileSync(join(tempDir, "test.ts"), "// test");
    insertScenario("SEC-01", "Auth check", "automatic", ["test.ts"], "untested");

    verifyScenarios(db, tempDir, {
      testCommand: "echo",
      timeoutMs: 5000,
    });

    const row = db
      .prepare("SELECT status FROM quality_scenarios WHERE id = 'SEC-01'")
      .get() as { status: string };
    expect(row.status).toBe("passing");
  });

  it("updates scenario to failing status", () => {
    writeFileSync(join(tempDir, "test.ts"), "// test");
    insertScenario("SEC-01", "Auth check", "automatic", ["test.ts"], "passing");

    verifyScenarios(db, tempDir, {
      testCommand: "false",
      timeoutMs: 5000,
    });

    const row = db
      .prepare("SELECT status FROM quality_scenarios WHERE id = 'SEC-01'")
      .get() as { status: string };
    expect(row.status).toBe("failing");
  });

  it("filters by specific scenario IDs", () => {
    writeFileSync(join(tempDir, "test1.ts"), "// test");
    writeFileSync(join(tempDir, "test2.ts"), "// test");
    insertScenario("SEC-01", "Auth check", "automatic", ["test1.ts"]);
    insertScenario("SEC-02", "Input val", "automatic", ["test2.ts"]);

    const result = verifyScenarios(db, tempDir, {
      testCommand: "echo",
      timeoutMs: 5000,
      scenarioIds: ["SEC-01"],
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.scenarioId).toBe("SEC-01");
  });

  it("includes semi-automatic scenarios", () => {
    writeFileSync(join(tempDir, "test.ts"), "// test");
    insertScenario("PERF-01", "LCP check", "semi-automatic", ["test.ts"]);

    const result = verifyScenarios(db, tempDir, {
      testCommand: "echo",
      timeoutMs: 5000,
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.scenarioId).toBe("PERF-01");
  });

  it("does not update status if unchanged", () => {
    writeFileSync(join(tempDir, "test.ts"), "// test");
    insertScenario("SEC-01", "Auth check", "automatic", ["test.ts"], "passing");

    const result = verifyScenarios(db, tempDir, {
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

    const result = verifyScenarios(db, tempDir, {
      testCommand: "echo",
      timeoutMs: 5000,
    });

    expect(result.results).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("SEC-01");
    expect(result.errors[0]).toContain("invalid");
  });

  it("treats empty scenarioIds array as no filter", () => {
    writeFileSync(join(tempDir, "test.ts"), "// test");
    insertScenario("SEC-01", "Auth check", "automatic", ["test.ts"]);

    const result = verifyScenarios(db, tempDir, {
      testCommand: "echo",
      timeoutMs: 5000,
      scenarioIds: [],
    });

    // Empty array should behave like no filter — run all automatic scenarios
    expect(result.results).toHaveLength(1);
  });
});
