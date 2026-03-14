import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  generateConfig,
  generateArc42,
  generatePlan,
  generateAgentRoles,
  generateDatabase,
  refreshFromDocs,
  type InitProjectInput,
} from "@arcbridge/core";
import type Database from "better-sqlite3";
import type { ServerContext } from "../context.js";

const TEST_INPUT: InitProjectInput = {
  name: "test-app",
  template: "nextjs-app-router",
  features: ["auth", "api"],
  quality_priorities: ["security", "performance", "accessibility"],
  platforms: ["claude"],
};

let tempDir: string;
let db: Database.Database;
let _ctx: ServerContext;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "arcbridge-tool-test-"));

  // Generate full project
  generateConfig(tempDir, TEST_INPUT);
  generateArc42(tempDir, TEST_INPUT);
  generatePlan(tempDir, TEST_INPUT);
  generateAgentRoles(tempDir);
  ({ db } = generateDatabase(tempDir, TEST_INPUT));

  _ctx = { db, projectRoot: tempDir };
});

afterEach(() => {
  db.close();
  rmSync(tempDir, { recursive: true, force: true });
});

// Helper: directly query the DB to test tool logic without MCP protocol overhead
describe("building blocks queries", () => {
  it("lists all building blocks", () => {
    const blocks = db
      .prepare("SELECT id, name, responsibility FROM building_blocks ORDER BY name")
      .all() as { id: string; name: string; responsibility: string }[];

    expect(blocks.length).toBeGreaterThan(0);
    const ids = blocks.map((b) => b.id);
    expect(ids).toContain("app-shell");
    expect(ids).toContain("auth-module");
    expect(ids).toContain("api-layer");
  });

  it("gets a single building block with details", () => {
    const block = db
      .prepare("SELECT * FROM building_blocks WHERE id = ?")
      .get("auth-module") as { id: string; responsibility: string; code_paths: string } | undefined;

    expect(block).toBeDefined();
    expect(block!.responsibility).toContain("authentication");

    const codePaths = JSON.parse(block!.code_paths) as string[];
    expect(codePaths).toContain("src/lib/auth/");
  });

  it("returns undefined for non-existent block", () => {
    const block = db
      .prepare("SELECT * FROM building_blocks WHERE id = ?")
      .get("nonexistent");

    expect(block).toBeUndefined();
  });
});

describe("quality scenarios queries", () => {
  it("lists all quality scenarios", () => {
    const scenarios = db
      .prepare("SELECT id, name, category, status FROM quality_scenarios ORDER BY id")
      .all() as { id: string; category: string }[];

    expect(scenarios.length).toBeGreaterThan(0);
  });

  it("filters by category", () => {
    const securityScenarios = db
      .prepare("SELECT id FROM quality_scenarios WHERE category = ?")
      .all("security") as { id: string }[];

    expect(securityScenarios.length).toBeGreaterThan(0);
    expect(securityScenarios.every((s) => s.id.startsWith("SEC-"))).toBe(true);
  });

  it("filters by status", () => {
    const untested = db
      .prepare("SELECT id FROM quality_scenarios WHERE status = ?")
      .all("untested") as { id: string }[];

    // All should be untested initially
    const total = (
      db.prepare("SELECT COUNT(*) as count FROM quality_scenarios").get() as { count: number }
    ).count;

    expect(untested.length).toBe(total);
  });
});

describe("phase plan queries", () => {
  it("lists all phases in order", () => {
    const phases = db
      .prepare("SELECT id, name, phase_number, status FROM phases ORDER BY phase_number")
      .all() as { id: string; phase_number: number; status: string }[];

    expect(phases.length).toBe(4);
    expect(phases[0]!.status).toBe("in-progress");
    expect(phases[0]!.phase_number).toBe(0);
  });

  it("gets current phase tasks", () => {
    const currentPhase = db
      .prepare("SELECT id FROM phases WHERE status = 'in-progress' LIMIT 1")
      .get() as { id: string };

    const tasks = db
      .prepare("SELECT id, title, status FROM tasks WHERE phase_id = ? ORDER BY id")
      .all(currentPhase.id) as { id: string; title: string; status: string }[];

    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((t) => t.status === "todo")).toBe(true);
  });
});

describe("task mutations", () => {
  it("updates task status", () => {
    const task = db
      .prepare("SELECT id FROM tasks LIMIT 1")
      .get() as { id: string };

    db.prepare("UPDATE tasks SET status = ? WHERE id = ?").run(
      "in-progress",
      task.id,
    );

    const updated = db
      .prepare("SELECT status FROM tasks WHERE id = ?")
      .get(task.id) as { status: string };

    expect(updated.status).toBe("in-progress");
  });

  it("marks task as done with completion time", () => {
    const task = db
      .prepare("SELECT id FROM tasks LIMIT 1")
      .get() as { id: string };

    const now = new Date().toISOString();
    db.prepare("UPDATE tasks SET status = 'done', completed_at = ? WHERE id = ?").run(
      now,
      task.id,
    );

    const updated = db
      .prepare("SELECT status, completed_at FROM tasks WHERE id = ?")
      .get(task.id) as { status: string; completed_at: string };

    expect(updated.status).toBe("done");
    expect(updated.completed_at).toBe(now);
  });

  it("creates a new task", () => {
    const phaseId = "phase-0-setup";

    db.prepare(
      "INSERT INTO tasks (id, phase_id, title, description, status, building_block, quality_scenarios, acceptance_criteria, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "task-0.99-custom",
      phaseId,
      "Custom task",
      null,
      "todo",
      "app-shell",
      JSON.stringify(["SEC-01"]),
      JSON.stringify(["Must do X", "Must do Y"]),
      new Date().toISOString(),
    );

    const created = db
      .prepare("SELECT * FROM tasks WHERE id = 'task-0.99-custom'")
      .get() as { title: string; building_block: string; quality_scenarios: string };

    expect(created).toBeDefined();
    expect(created.title).toBe("Custom task");
    expect(created.building_block).toBe("app-shell");
    expect(JSON.parse(created.quality_scenarios)).toEqual(["SEC-01"]);
  });
});

describe("refreshFromDocs picks up YAML-only changes", () => {
  it("loads new tasks added to YAML after initial generation", () => {
    // DB has the initial tasks from generateDatabase
    const initialTasks = db
      .prepare("SELECT COUNT(*) as count FROM tasks")
      .get() as { count: number };

    // Append a new phase to phases.yaml
    const phasesPath = join(tempDir, ".arcbridge", "plan", "phases.yaml");
    const phasesRaw = readFileSync(phasesPath, "utf-8");
    const phasesWithExtra = phasesRaw + `  - id: phase-extra
    name: Extra Phase
    phase_number: 99
    status: planned
    description: Added after initial generation
`;
    writeFileSync(phasesPath, phasesWithExtra, "utf-8");

    // Create task file for the new phase
    const tasksDir = join(tempDir, ".arcbridge", "plan", "tasks");
    writeFileSync(
      join(tasksDir, "phase-extra.yaml"),
      `schema_version: 1
phase_id: phase-extra
tasks:
  - id: task-extra.1-new
    title: New task from YAML
    status: todo
    quality_scenarios: []
    acceptance_criteria: []
`,
      "utf-8",
    );

    // Before refresh: new task is NOT in DB
    const before = db
      .prepare("SELECT id FROM tasks WHERE id = 'task-extra.1-new'")
      .get();
    expect(before).toBeUndefined();

    // Refresh picks it up
    refreshFromDocs(db, tempDir);

    const after = db
      .prepare("SELECT id, title, status FROM tasks WHERE id = 'task-extra.1-new'")
      .get() as { id: string; title: string; status: string } | undefined;
    expect(after).toBeDefined();
    expect(after!.title).toBe("New task from YAML");
    expect(after!.status).toBe("todo");

    // Original tasks still exist
    const totalAfter = db
      .prepare("SELECT COUNT(*) as count FROM tasks")
      .get() as { count: number };
    expect(totalAfter.count).toBe(initialTasks.count + 1);
  });

  it("preserves DB task statuses when YAML is refreshed", () => {
    // Mark a task as done in DB
    const task = db
      .prepare("SELECT id FROM tasks LIMIT 1")
      .get() as { id: string };
    db.prepare("UPDATE tasks SET status = 'done', completed_at = '2024-06-01' WHERE id = ?")
      .run(task.id);

    // Refresh from docs (YAML still has status: todo)
    refreshFromDocs(db, tempDir);

    // DB status should be preserved (not overwritten by YAML's "todo")
    const after = db
      .prepare("SELECT status, completed_at FROM tasks WHERE id = ?")
      .get(task.id) as { status: string; completed_at: string | null };
    expect(after.status).toBe("done");
    expect(after.completed_at).toBe("2024-06-01");
  });

  it("preserves scenario statuses across refresh", () => {
    const scenario = db
      .prepare("SELECT id FROM quality_scenarios LIMIT 1")
      .get() as { id: string };
    db.prepare("UPDATE quality_scenarios SET status = 'passing' WHERE id = ?")
      .run(scenario.id);

    refreshFromDocs(db, tempDir);

    const after = db
      .prepare("SELECT status FROM quality_scenarios WHERE id = ?")
      .get(scenario.id) as { status: string };
    expect(after.status).toBe("passing");
  });
});

describe("ADR queries", () => {
  it("lists all ADRs", () => {
    const adrs = db
      .prepare("SELECT id, title, status FROM adrs ORDER BY id")
      .all() as { id: string; title: string }[];

    expect(adrs.length).toBeGreaterThan(0);
    expect(adrs[0]!.id).toBe("001-nextjs-app-router");
  });

  it("finds ADRs by affected block", () => {
    const adrs = db
      .prepare("SELECT id FROM adrs WHERE affected_blocks LIKE ?")
      .all('%"app-shell"%') as { id: string }[];

    expect(adrs.length).toBeGreaterThan(0);
  });

  it("finds ADRs by affected file path", () => {
    const adrs = db
      .prepare("SELECT id FROM adrs WHERE affected_files LIKE ?")
      .all("%app/%") as { id: string }[];

    expect(adrs.length).toBeGreaterThan(0);
  });
});
