import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { openMemoryDatabase } from "../db/connection.js";
import { initializeSchema } from "../db/schema.js";
import { indexProject } from "../indexer/index.js";
import { detectDrift, writeDriftLog } from "../drift/detector.js";
import type { Database } from "../db/connection.js";

const TS_FIXTURE = join(__dirname, "fixtures", "ts-project");

let db: Database;

beforeEach(async () => {
  db = openMemoryDatabase();
  initializeSchema(db);
});

afterEach(() => {
  db.close();
});

describe("detectDrift", () => {
  it("returns empty when no building blocks exist", async () => {
    await indexProject(db, { projectRoot: TS_FIXTURE });
    const entries = detectDrift(db);
    expect(entries).toEqual([]);
  });

  it("detects undocumented modules", async () => {
    await indexProject(db, { projectRoot: TS_FIXTURE });

    // Add a building block that only covers src/models/
    db.prepare(
      `INSERT INTO building_blocks (id, name, responsibility, code_paths)
       VALUES ('models', 'Models', 'Data models', '["src/models/"]')`,
    ).run();

    const entries = detectDrift(db);

    // src/utils.ts and src/services/ should be undocumented
    const undocumented = entries.filter((e) => e.kind === "undocumented_module");
    expect(undocumented.length).toBeGreaterThan(0);
    expect(undocumented.some((e) => e.affectedFile?.includes("utils"))).toBe(true);
  });

  it("detects missing modules", async () => {
    await indexProject(db, { projectRoot: TS_FIXTURE });

    // Add a building block that references a non-existent path
    db.prepare(
      `INSERT INTO building_blocks (id, name, responsibility, code_paths)
       VALUES ('phantom', 'Phantom Block', 'Does not exist', '["src/nonexistent/"]')`,
    ).run();

    const entries = detectDrift(db);
    const missing = entries.filter((e) => e.kind === "missing_module");
    expect(missing.length).toBeGreaterThan(0);
    expect(missing[0]!.affectedBlock).toBe("phantom");
  });

  it("detects dependency violations across blocks", async () => {
    await indexProject(db, { projectRoot: TS_FIXTURE });

    // Create two blocks that cover different directories
    db.prepare(
      `INSERT INTO building_blocks (id, name, responsibility, code_paths, interfaces)
       VALUES ('models', 'Models', 'Data models', '["src/models/"]', '[]')`,
    ).run();
    db.prepare(
      `INSERT INTO building_blocks (id, name, responsibility, code_paths, interfaces)
       VALUES ('services', 'Services', 'Business logic', '["src/services/"]', '[]')`,
    ).run();

    const entries = detectDrift(db);

    // auth-service.ts imports from models/ — should be a violation since interfaces is empty
    const violations = entries.filter((e) => e.kind === "dependency_violation");
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]!.severity).toBe("error");
  });

  it("does not flag dependency violations when interfaces are declared", async () => {
    await indexProject(db, { projectRoot: TS_FIXTURE });

    // Create two blocks with declared interface
    db.prepare(
      `INSERT INTO building_blocks (id, name, responsibility, code_paths, interfaces)
       VALUES ('models', 'Models', 'Data models', '["src/models/"]', '[]')`,
    ).run();
    db.prepare(
      `INSERT INTO building_blocks (id, name, responsibility, code_paths, interfaces)
       VALUES ('services', 'Services', 'Business logic', '["src/services/"]', '["models"]')`,
    ).run();

    const entries = detectDrift(db);
    const violations = entries.filter(
      (e) => e.kind === "dependency_violation" && e.affectedBlock === "services",
    );
    expect(violations.length).toBe(0);
  });

  it("detects unlinked test paths", async () => {
    await indexProject(db, { projectRoot: TS_FIXTURE });

    db.prepare(
      `INSERT INTO quality_scenarios (id, name, category, scenario, expected, linked_tests)
       VALUES ('QS-01', 'Test Scenario', 'security', 'scenario', 'expected', '["tests/missing.test.ts"]')`,
    ).run();

    const entries = detectDrift(db);
    const unlinked = entries.filter((e) => e.kind === "unlinked_test");
    expect(unlinked.length).toBeGreaterThan(0);
    expect(unlinked[0]!.affectedFile).toBe("tests/missing.test.ts");
  });

  it("does not flag unlinked tests when files exist", async () => {
    await indexProject(db, { projectRoot: TS_FIXTURE });

    const existingFile = (
      db.prepare("SELECT file_path FROM symbols LIMIT 1").get() as { file_path: string }
    ).file_path;

    db.prepare(
      `INSERT INTO quality_scenarios (id, name, category, scenario, expected, linked_tests)
       VALUES ('QS-02', 'Linked Scenario', 'security', 'scenario', 'expected', ?)`,
    ).run(JSON.stringify([existingFile]));

    const entries = detectDrift(db);
    const unlinked = entries.filter(
      (e) => e.kind === "unlinked_test" && e.description.includes("QS-02"),
    );
    expect(unlinked.length).toBe(0);
  });

  it("detects stale ADR references", async () => {
    await indexProject(db, { projectRoot: TS_FIXTURE });

    // Add an ADR that references a file that doesn't exist
    db.prepare(
      `INSERT INTO adrs (id, title, status, date, affected_files)
       VALUES ('adr-001', 'Test ADR', 'accepted', '2024-01-01', '["src/deleted-file.ts"]')`,
    ).run();

    const entries = detectDrift(db);
    const stale = entries.filter((e) => e.kind === "stale_adr");
    expect(stale.length).toBeGreaterThan(0);
    expect(stale[0]!.description).toContain("adr-001");
  });

  it("detects new package dependencies without ADRs", async () => {
    await indexProject(db, { projectRoot: TS_FIXTURE });

    // Add a package dependency
    db.prepare(
      "INSERT INTO package_dependencies (name, version, source, service) VALUES (?, ?, ?, ?)",
    ).run("some-important-library", "1.0.0", "npm", "main");

    const entries = detectDrift(db);
    const newDeps = entries.filter((e) => e.kind === "new_dependency");
    expect(newDeps.length).toBeGreaterThan(0);
    expect(newDeps[0]!.description).toContain("some-important-library");
  });

  it("does not flag package dependencies mentioned in ADRs", async () => {
    await indexProject(db, { projectRoot: TS_FIXTURE });

    db.prepare(
      "INSERT INTO package_dependencies (name, version, source, service) VALUES (?, ?, ?, ?)",
    ).run("serilog", "3.0.0", "nuget", "main");

    db.prepare(
      `INSERT INTO adrs (id, title, status, date, decision)
       VALUES ('adr-010', 'Logging Strategy', 'accepted', '2024-01-01', 'We chose Serilog for structured logging')`,
    ).run();

    const entries = detectDrift(db);
    const newDeps = entries.filter(
      (e) => e.kind === "new_dependency" && e.description.includes("serilog"),
    );
    expect(newDeps.length).toBe(0);
  });

  it("does not flag trivial dev dependencies", async () => {
    await indexProject(db, { projectRoot: TS_FIXTURE });

    db.prepare(
      "INSERT INTO package_dependencies (name, version, source, service) VALUES (?, ?, ?, ?)",
    ).run("typescript", "5.0.0", "npm", "main");

    const entries = detectDrift(db);
    const newDeps = entries.filter(
      (e) => e.kind === "new_dependency" && e.description.includes("typescript"),
    );
    expect(newDeps.length).toBe(0);
  });

  it("does not flag stale ADRs for existing files", async () => {
    await indexProject(db, { projectRoot: TS_FIXTURE });

    db.prepare(
      `INSERT INTO adrs (id, title, status, date, affected_files)
       VALUES ('adr-002', 'Utils ADR', 'accepted', '2024-01-01', '["src/utils.ts"]')`,
    ).run();

    const entries = detectDrift(db);
    const stale = entries.filter(
      (e) => e.kind === "stale_adr" && e.description.includes("adr-002"),
    );
    expect(stale.length).toBe(0);
  });
});

describe("writeDriftLog", () => {
  it("writes entries to drift_log table", async () => {
    const entries = [
      {
        kind: "undocumented_module" as const,
        severity: "warning" as const,
        description: "Test drift",
        affectedBlock: null,
        affectedFile: "test.ts",
      },
    ];

    writeDriftLog(db, entries);

    const count = (
      db.prepare("SELECT COUNT(*) as count FROM drift_log").get() as { count: number }
    ).count;
    expect(count).toBe(1);
  });

  it("clears unresolved entries on re-run", async () => {
    const entries = [
      {
        kind: "undocumented_module" as const,
        severity: "warning" as const,
        description: "First run",
        affectedBlock: null,
        affectedFile: "test.ts",
      },
    ];

    writeDriftLog(db, entries);
    writeDriftLog(db, []); // second run with no drift

    const count = (
      db.prepare("SELECT COUNT(*) as count FROM drift_log WHERE resolution IS NULL").get() as {
        count: number;
      }
    ).count;
    expect(count).toBe(0);
  });

  it("preserves resolved entries", async () => {
    writeDriftLog(db, [
      {
        kind: "undocumented_module" as const,
        severity: "warning" as const,
        description: "Resolved drift",
        affectedBlock: null,
        affectedFile: "test.ts",
      },
    ]);

    // Manually resolve it
    db.prepare("UPDATE drift_log SET resolution = 'accepted', resolved_at = '2024-01-01'").run();

    // Re-run with new drift
    writeDriftLog(db, [
      {
        kind: "missing_module" as const,
        severity: "warning" as const,
        description: "New drift",
        affectedBlock: "block-1",
        affectedFile: null,
      },
    ]);

    const count = (
      db.prepare("SELECT COUNT(*) as count FROM drift_log").get() as { count: number }
    ).count;
    // 1 resolved + 1 new
    expect(count).toBe(2);
  });
});
