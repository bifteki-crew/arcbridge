import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  openMemoryDatabase,
  initializeSchema,
  indexProject,
  detectDrift,
  generateSyncFiles,
  type ArchLensConfig,
} from "@archlens/core";
import type Database from "better-sqlite3";

const TS_FIXTURE = join(
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
});

afterEach(() => {
  db.close();
});

describe("complete_phase gate checks", () => {
  it("all gates pass when tasks done, no drift, no failing scenarios", () => {
    indexProject(db, { projectRoot: TS_FIXTURE });

    // Setup: phase with all tasks done
    db.prepare(
      "INSERT INTO phases (id, name, phase_number, status, description) VALUES ('p1', 'Phase 1', 1, 'in-progress', 'Test')",
    ).run();
    db.prepare(
      `INSERT INTO building_blocks (id, name, responsibility, code_paths)
       VALUES ('all', 'All', 'Everything', '["src/"]')`,
    ).run();
    db.prepare(
      `INSERT INTO tasks (id, phase_id, title, status, created_at)
       VALUES ('task-1', 'p1', 'Done task', 'done', '2024-01-01')`,
    ).run();

    // Gate 1: All tasks done
    const tasks = db
      .prepare("SELECT status FROM tasks WHERE phase_id = 'p1'")
      .all() as { status: string }[];
    const incompleteTasks = tasks.filter((t) => t.status !== "done");
    expect(incompleteTasks.length).toBe(0);

    // Gate 2: No critical drift
    const drift = detectDrift(db);
    const critical = drift.filter((d) => d.severity === "error");
    expect(critical.length).toBe(0);

    // Gate 3: No failing must scenarios
    const failing = db
      .prepare(
        "SELECT id FROM quality_scenarios WHERE priority = 'must' AND status = 'failing'",
      )
      .all();
    expect(failing.length).toBe(0);
  });

  it("tasks gate fails when tasks incomplete", () => {
    db.prepare(
      "INSERT INTO phases (id, name, phase_number, status, description) VALUES ('p1', 'Phase 1', 1, 'in-progress', 'Test')",
    ).run();
    db.prepare(
      `INSERT INTO tasks (id, phase_id, title, status, created_at)
       VALUES ('task-1', 'p1', 'Incomplete', 'todo', '2024-01-01')`,
    ).run();

    const tasks = db
      .prepare("SELECT status FROM tasks WHERE phase_id = 'p1'")
      .all() as { status: string }[];
    const incomplete = tasks.filter((t) => t.status !== "done");
    expect(incomplete.length).toBe(1);
  });

  it("drift gate fails when dependency violations exist", () => {
    indexProject(db, { projectRoot: TS_FIXTURE });

    db.prepare(
      `INSERT INTO building_blocks (id, name, responsibility, code_paths, interfaces)
       VALUES ('models', 'Models', 'Data models', '["src/models/"]', '[]')`,
    ).run();
    db.prepare(
      `INSERT INTO building_blocks (id, name, responsibility, code_paths, interfaces)
       VALUES ('services', 'Services', 'Logic', '["src/services/"]', '[]')`,
    ).run();

    const drift = detectDrift(db);
    const critical = drift.filter((d) => d.severity === "error");
    expect(critical.length).toBeGreaterThan(0);
  });

  it("quality gate fails when must scenarios are failing", () => {
    db.prepare(
      `INSERT INTO quality_scenarios (id, name, category, scenario, expected, priority, status)
       VALUES ('SEC-01', 'Auth', 'security', 'scenario', 'expected', 'must', 'failing')`,
    ).run();

    const failing = db
      .prepare(
        "SELECT id FROM quality_scenarios WHERE priority = 'must' AND status = 'failing'",
      )
      .all();
    expect(failing.length).toBe(1);
  });

  it("phase transitions to complete and next phase starts", () => {
    db.prepare(
      "INSERT INTO phases (id, name, phase_number, status, description) VALUES ('p1', 'Phase 1', 1, 'in-progress', 'Test')",
    ).run();
    db.prepare(
      "INSERT INTO phases (id, name, phase_number, status, description) VALUES ('p2', 'Phase 2', 2, 'planned', 'Next')",
    ).run();

    // Simulate completion
    const now = new Date().toISOString();
    db.prepare("UPDATE phases SET status = 'complete', completed_at = ? WHERE id = 'p1'").run(now);
    db.prepare("UPDATE phases SET status = 'in-progress', started_at = ? WHERE id = 'p2'").run(now);

    const p1 = db.prepare("SELECT status FROM phases WHERE id = 'p1'").get() as { status: string };
    const p2 = db.prepare("SELECT status FROM phases WHERE id = 'p2'").get() as { status: string };
    expect(p1.status).toBe("complete");
    expect(p2.status).toBe("in-progress");
  });
});

describe("activate_role context loading", () => {
  it("loads building blocks for all roles", () => {
    db.prepare(
      `INSERT INTO building_blocks (id, name, responsibility)
       VALUES ('auth', 'Auth Module', 'Authentication')`,
    ).run();

    const blocks = db
      .prepare("SELECT id, name, responsibility FROM building_blocks")
      .all() as { id: string; name: string; responsibility: string }[];

    expect(blocks.length).toBe(1);
    expect(blocks[0]!.id).toBe("auth");
  });

  it("loads quality scenarios filtered by role focus", () => {
    db.prepare(
      `INSERT INTO quality_scenarios (id, name, category, scenario, expected, priority, status)
       VALUES ('SEC-01', 'Auth', 'security', 's', 'e', 'must', 'untested')`,
    ).run();
    db.prepare(
      `INSERT INTO quality_scenarios (id, name, category, scenario, expected, priority, status)
       VALUES ('PERF-01', 'Speed', 'performance', 's', 'e', 'should', 'untested')`,
    ).run();

    // Security reviewer focuses on "security"
    const securityFocus = ["security"];
    const allScenarios = db
      .prepare("SELECT id, name, category, priority FROM quality_scenarios")
      .all() as { id: string; name: string; category: string; priority: string }[];

    const focused = allScenarios.filter(
      (s) => securityFocus.includes(s.category) || s.priority === "must",
    );

    // SEC-01 matches both (security category + must priority)
    // PERF-01 doesn't match (performance != security, should != must)
    expect(focused.length).toBe(1);
    expect(focused[0]!.id).toBe("SEC-01");
  });

  it("loads phase plan for phase-manager role", () => {
    db.prepare(
      "INSERT INTO phases (id, name, phase_number, status, description) VALUES ('p1', 'Phase 1', 1, 'complete', 'Done')",
    ).run();
    db.prepare(
      "INSERT INTO phases (id, name, phase_number, status, description) VALUES ('p2', 'Phase 2', 2, 'in-progress', 'Current')",
    ).run();

    const phases = db
      .prepare("SELECT id, name, status FROM phases ORDER BY id")
      .all() as { id: string; name: string; status: string }[];

    expect(phases.length).toBe(2);
    expect(phases[0]!.status).toBe("complete");
    expect(phases[1]!.status).toBe("in-progress");
  });

  it("loads focused block tasks for implementer role", () => {
    db.prepare(
      "INSERT INTO phases (id, name, phase_number, status, description) VALUES ('p1', 'Phase 1', 1, 'in-progress', 'Test')",
    ).run();
    db.prepare(
      `INSERT INTO building_blocks (id, name, responsibility)
       VALUES ('auth', 'Auth', 'Authentication')`,
    ).run();
    db.prepare(
      `INSERT INTO tasks (id, phase_id, title, status, building_block, created_at)
       VALUES ('t1', 'p1', 'Auth task', 'todo', 'auth', '2024-01-01')`,
    ).run();
    db.prepare(
      `INSERT INTO tasks (id, phase_id, title, status, building_block, created_at)
       VALUES ('t2', 'p1', 'Other task', 'todo', null, '2024-01-01')`,
    ).run();

    const blockTasks = db
      .prepare(
        "SELECT id, title FROM tasks WHERE building_block = ? AND status IN ('todo', 'in-progress')",
      )
      .all("auth") as { id: string; title: string }[];

    expect(blockTasks.length).toBe(1);
    expect(blockTasks[0]!.id).toBe("t1");
  });
});

describe("sync file generation", () => {
  it("generates sync files for claude + copilot platforms", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "archlens-sync-"));

    const config: ArchLensConfig = {
      schema_version: 1,
      project_name: "Test",
      project_type: "nextjs-app-router",
      services: [],
      platforms: ["claude", "copilot"],
      quality_priorities: ["security"],
      indexing: {
        include: ["src/**/*"],
        exclude: ["node_modules"],
        default_mode: "fast",
      },
      testing: {
        test_command: "npx vitest run",
        timeout_ms: 60000,
      },
      sync: {
        auto_detect_drift: true,
        drift_severity_threshold: "warning",
        propose_updates_on: "phase-complete",
      },
    };

    const files = generateSyncFiles(tmpDir, config);

    // Should generate: GitHub Action + Claude skill + Copilot hook
    expect(files.length).toBe(3);
    expect(files).toContain(".github/workflows/archlens-sync.yml");
    expect(files).toContain(".claude/skills/archlens-sync.md");
    expect(files).toContain(".github/archlens-sync-hook.md");

    // Verify files exist on disk
    for (const f of files) {
      expect(existsSync(join(tmpDir, f))).toBe(true);
    }

    rmSync(tmpDir, { recursive: true });
  });

  it("skips Claude skill when claude not in platforms", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "archlens-sync-"));

    const config: ArchLensConfig = {
      schema_version: 1,
      project_name: "Test",
      project_type: "nextjs-app-router",
      services: [],
      platforms: ["copilot"],
      quality_priorities: ["security"],
      indexing: {
        include: ["src/**/*"],
        exclude: ["node_modules"],
        default_mode: "fast",
      },
      testing: {
        test_command: "npx vitest run",
        timeout_ms: 60000,
      },
      sync: {
        auto_detect_drift: true,
        drift_severity_threshold: "warning",
        propose_updates_on: "phase-complete",
      },
    };

    const files = generateSyncFiles(tmpDir, config);

    expect(files).toContain(".github/workflows/archlens-sync.yml");
    expect(files).toContain(".github/archlens-sync-hook.md");
    expect(files).not.toContain(".claude/skills/archlens-sync.md");

    rmSync(tmpDir, { recursive: true });
  });
});
