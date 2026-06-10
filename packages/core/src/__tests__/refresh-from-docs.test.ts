import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { InitProjectInput } from "../templates/types.js";
import { generateConfig } from "../generators/config-generator.js";
import { generateArc42 } from "../generators/arc42-generator.js";
import { generatePlan } from "../generators/plan-generator.js";
import { generateDatabase, refreshFromDocs, RefreshValidationError } from "../generators/db-generator.js";

const TEST_INPUT: InitProjectInput = {
  name: "test-app",
  template: "nextjs-app-router",
  features: ["auth", "api"],
  quality_priorities: ["security", "performance", "accessibility"],
  platforms: ["claude"],
};

let tempDir: string;

function setupProject() {
  generateConfig(tempDir, TEST_INPUT);
  generateArc42(tempDir, TEST_INPUT);
  generatePlan(tempDir, TEST_INPUT);
  return generateDatabase(tempDir, TEST_INPUT);
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "arcbridge-refresh-test-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("refreshFromDocs", () => {
  it("repopulates database from YAML files", () => {
    const { db } = setupProject();

    const blocksBefore = (
      db.prepare("SELECT COUNT(*) as count FROM building_blocks").get() as { count: number }
    ).count;

    const warnings = refreshFromDocs(db, tempDir);

    const blocksAfter = (
      db.prepare("SELECT COUNT(*) as count FROM building_blocks").get() as { count: number }
    ).count;

    expect(warnings).toHaveLength(0);
    expect(blocksAfter).toBe(blocksBefore);
    db.close();
  });

  it("preserves task statuses across refresh", () => {
    const { db } = setupProject();

    // Get a task and change its status
    const task = db
      .prepare("SELECT id FROM tasks LIMIT 1")
      .get() as { id: string };
    db.prepare("UPDATE tasks SET status = 'done', completed_at = '2024-06-01' WHERE id = ?")
      .run(task.id);

    refreshFromDocs(db, tempDir);

    const restored = db
      .prepare("SELECT status, completed_at FROM tasks WHERE id = ?")
      .get(task.id) as { status: string; completed_at: string | null };

    expect(restored.status).toBe("done");
    expect(restored.completed_at).toBe("2024-06-01");
    db.close();
  });

  it("preserves phase statuses across refresh", () => {
    const { db } = setupProject();

    const phase = db
      .prepare("SELECT id FROM phases LIMIT 1")
      .get() as { id: string };
    const now = "2024-06-01T00:00:00.000Z";
    db.prepare("UPDATE phases SET status = 'in-progress', started_at = ? WHERE id = ?")
      .run(now, phase.id);

    refreshFromDocs(db, tempDir);

    const restored = db
      .prepare("SELECT status, started_at FROM phases WHERE id = ?")
      .get(phase.id) as { status: string; started_at: string | null };

    expect(restored.status).toBe("in-progress");
    expect(restored.started_at).toBe(now);
    db.close();
  });

  it("preserves quality scenario statuses across refresh", () => {
    const { db } = setupProject();

    const scenario = db
      .prepare("SELECT id FROM quality_scenarios LIMIT 1")
      .get() as { id: string };
    db.prepare("UPDATE quality_scenarios SET status = 'passing' WHERE id = ?")
      .run(scenario.id);

    refreshFromDocs(db, tempDir);

    const restored = db
      .prepare("SELECT status FROM quality_scenarios WHERE id = ?")
      .get(scenario.id) as { status: string };

    expect(restored.status).toBe("passing");
    db.close();
  });

  it("does not restore default statuses (todo, planned, untested)", () => {
    const { db } = setupProject();

    // All tasks start as "todo" — ensure they stay that way after refresh
    const task = db
      .prepare("SELECT id, status FROM tasks LIMIT 1")
      .get() as { id: string; status: string };
    expect(task.status).toBe("todo");

    refreshFromDocs(db, tempDir);

    const after = db
      .prepare("SELECT status FROM tasks WHERE id = ?")
      .get(task.id) as { status: string };
    expect(after.status).toBe("todo");
    db.close();
  });

  it("is atomic — data survives intact after multiple refreshes", () => {
    const { db } = setupProject();

    const blockCount = (
      db.prepare("SELECT COUNT(*) as count FROM building_blocks").get() as { count: number }
    ).count;
    const taskCount = (
      db.prepare("SELECT COUNT(*) as count FROM tasks").get() as { count: number }
    ).count;

    // Run refresh 3 times
    refreshFromDocs(db, tempDir);
    refreshFromDocs(db, tempDir);
    refreshFromDocs(db, tempDir);

    const blocksAfter = (
      db.prepare("SELECT COUNT(*) as count FROM building_blocks").get() as { count: number }
    ).count;
    const tasksAfter = (
      db.prepare("SELECT COUNT(*) as count FROM tasks").get() as { count: number }
    ).count;

    expect(blocksAfter).toBe(blockCount);
    expect(tasksAfter).toBe(taskCount);
    db.close();
  });

  it("aborts and leaves the database unchanged when phases.yaml is invalid", () => {
    const { db } = setupProject();

    // Set a non-default status so we can verify the rollback preserves it
    const task = db.prepare("SELECT id FROM tasks LIMIT 1").get() as { id: string };
    db.prepare("UPDATE tasks SET status = 'done' WHERE id = ?").run(task.id);
    const taskCount = (
      db.prepare("SELECT COUNT(*) as count FROM tasks").get() as { count: number }
    ).count;

    writeFileSync(
      join(tempDir, ".arcbridge", "plan", "phases.yaml"),
      "phases: [unclosed\n",
      "utf-8",
    );

    expect(() => refreshFromDocs(db, tempDir)).toThrow(RefreshValidationError);

    const tasksAfter = (
      db.prepare("SELECT COUNT(*) as count FROM tasks").get() as { count: number }
    ).count;
    const statusAfter = (
      db.prepare("SELECT status FROM tasks WHERE id = ?").get(task.id) as { status: string }
    ).status;
    expect(tasksAfter).toBe(taskCount);
    expect(statusAfter).toBe("done");

    // FK enforcement must be restored even after an aborted refresh
    const fk = db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number };
    expect(fk.foreign_keys).toBe(1);
    db.close();
  });

  it("aborts when building blocks frontmatter fails validation", () => {
    const { db } = setupProject();
    const blockCount = (
      db.prepare("SELECT COUNT(*) as count FROM building_blocks").get() as { count: number }
    ).count;

    writeFileSync(
      join(tempDir, ".arcbridge", "arc42", "05-building-blocks.md"),
      "---\nsection: building-blocks\nlast_synced: now\nblocks: not-an-array\n---\nBody\n",
      "utf-8",
    );

    expect(() => refreshFromDocs(db, tempDir)).toThrow(RefreshValidationError);
    expect(() => refreshFromDocs(db, tempDir)).toThrow(/05-building-blocks/);

    const blocksAfter = (
      db.prepare("SELECT COUNT(*) as count FROM building_blocks").get() as { count: number }
    ).count;
    expect(blocksAfter).toBe(blockCount);
    db.close();
  });

  it("aborts when quality scenarios YAML is malformed", () => {
    const { db } = setupProject();
    const scenarioCount = (
      db.prepare("SELECT COUNT(*) as count FROM quality_scenarios").get() as { count: number }
    ).count;

    writeFileSync(
      join(tempDir, ".arcbridge", "arc42", "10-quality-scenarios.yaml"),
      "scenarios: [\n",
      "utf-8",
    );

    expect(() => refreshFromDocs(db, tempDir)).toThrow(RefreshValidationError);

    const scenariosAfter = (
      db.prepare("SELECT COUNT(*) as count FROM quality_scenarios").get() as { count: number }
    ).count;
    expect(scenariosAfter).toBe(scenarioCount);
    db.close();
  });

  it("warns but continues when a single task file is invalid", () => {
    const { db } = setupProject();
    const phaseCount = (
      db.prepare("SELECT COUNT(*) as count FROM phases").get() as { count: number }
    ).count;

    const tasksDir = join(tempDir, ".arcbridge", "plan", "tasks");
    const taskFile = readdirSync(tasksDir).find((f) => f.endsWith(".yaml"))!;
    writeFileSync(join(tasksDir, taskFile), "tasks: [broken\n", "utf-8");

    const warnings = refreshFromDocs(db, tempDir);

    expect(warnings.some((w) => w.includes("Invalid task file"))).toBe(true);
    const phasesAfter = (
      db.prepare("SELECT COUNT(*) as count FROM phases").get() as { count: number }
    ).count;
    expect(phasesAfter).toBe(phaseCount);
    db.close();
  });

  it("returns warnings when files are missing", () => {
    const { db } = setupProject();

    // Refresh from a directory with no .arcbridge files
    const emptyDir = mkdtempSync(join(tmpdir(), "arcbridge-empty-"));
    const warnings = refreshFromDocs(db, emptyDir);

    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.includes("not found"))).toBe(true);

    rmSync(emptyDir, { recursive: true, force: true });
    db.close();
  });
});
