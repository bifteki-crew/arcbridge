import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openMemoryDatabase } from "../db/connection.js";
import { initializeSchema } from "../db/schema.js";
import { indexProject } from "../indexer/index.js";
import { inferTaskStatuses, applyInferences } from "../sync/task-inference.js";
import type { Database } from "../db/connection.js";

const TS_FIXTURE = join(__dirname, "fixtures", "ts-project");
const DUMMY_ROOT = tmpdir();

let db: Database;

beforeEach(async () => {
  db = openMemoryDatabase();
  initializeSchema(db);
});

afterEach(() => {
  db.close();
});

describe("inferTaskStatuses", () => {
  it("returns empty for phase with no tasks", async () => {
    db.prepare(
      "INSERT INTO phases (id, name, phase_number, status, description) VALUES ('p1', 'Phase 1', 1, 'in-progress', 'Test')",
    ).run();

    const results = inferTaskStatuses(db, "p1");
    expect(results).toEqual([]);
  });

  it("infers in-progress when building block has code", async () => {
    await indexProject(db, { projectRoot: TS_FIXTURE });

    db.prepare(
      "INSERT INTO phases (id, name, phase_number, status, description) VALUES ('p1', 'Phase 1', 1, 'in-progress', 'Test')",
    ).run();
    db.prepare(
      `INSERT INTO building_blocks (id, name, responsibility, code_paths)
       VALUES ('models', 'Models', 'Data models', '["src/models/"]')`,
    ).run();
    db.prepare(
      `INSERT INTO tasks (id, phase_id, title, status, building_block, created_at)
       VALUES ('task-1', 'p1', 'Build models', 'todo', 'models', '2024-01-01')`,
    ).run();

    const results = inferTaskStatuses(db, "p1");
    expect(results.length).toBe(1);
    expect(results[0]!.taskId).toBe("task-1");
    expect(results[0]!.inferredStatus).toBe("in-progress");
  });

  it("does not change tasks already done", async () => {
    await indexProject(db, { projectRoot: TS_FIXTURE });

    db.prepare(
      "INSERT INTO phases (id, name, phase_number, status, description) VALUES ('p1', 'Phase 1', 1, 'in-progress', 'Test')",
    ).run();
    db.prepare(
      `INSERT INTO building_blocks (id, name, responsibility, code_paths)
       VALUES ('models', 'Models', 'Data models', '["src/models/"]')`,
    ).run();
    db.prepare(
      `INSERT INTO tasks (id, phase_id, title, status, building_block, created_at)
       VALUES ('task-1', 'p1', 'Build models', 'done', 'models', '2024-01-01')`,
    ).run();

    const results = inferTaskStatuses(db, "p1");
    expect(results.length).toBe(0);
  });

  it("infers done when all quality scenarios pass", async () => {
    db.prepare(
      "INSERT INTO phases (id, name, phase_number, status, description) VALUES ('p1', 'Phase 1', 1, 'in-progress', 'Test')",
    ).run();
    db.prepare(
      `INSERT INTO quality_scenarios (id, name, category, scenario, expected, priority, status)
       VALUES ('SEC-01', 'Auth', 'security', 'scenario', 'expected', 'must', 'passing')`,
    ).run();
    db.prepare(
      `INSERT INTO tasks (id, phase_id, title, status, quality_scenarios, created_at)
       VALUES ('task-1', 'p1', 'Implement auth', 'in-progress', '["SEC-01"]', '2024-01-01')`,
    ).run();

    const results = inferTaskStatuses(db, "p1");
    expect(results.length).toBe(1);
    expect(results[0]!.inferredStatus).toBe("done");
  });
});

describe("applyInferences", () => {
  it("updates task statuses in the database", async () => {
    db.prepare(
      "INSERT INTO phases (id, name, phase_number, status, description) VALUES ('p1', 'Phase 1', 1, 'in-progress', 'Test')",
    ).run();
    db.prepare(
      `INSERT INTO tasks (id, phase_id, title, status, created_at)
       VALUES ('task-1', 'p1', 'Build stuff', 'todo', '2024-01-01')`,
    ).run();

    applyInferences(db, [
      {
        taskId: "task-1",
        previousStatus: "todo",
        inferredStatus: "in-progress",
        reason: "Code exists",
      },
    ], DUMMY_ROOT);

    const task = db
      .prepare("SELECT status FROM tasks WHERE id = 'task-1'")
      .get() as { status: string };
    expect(task.status).toBe("in-progress");
  });

  it("sets completed_at when inferring done", async () => {
    db.prepare(
      "INSERT INTO phases (id, name, phase_number, status, description) VALUES ('p1', 'Phase 1', 1, 'in-progress', 'Test')",
    ).run();
    db.prepare(
      `INSERT INTO tasks (id, phase_id, title, status, created_at)
       VALUES ('task-1', 'p1', 'Build stuff', 'in-progress', '2024-01-01')`,
    ).run();

    applyInferences(db, [
      {
        taskId: "task-1",
        previousStatus: "in-progress",
        inferredStatus: "done",
        reason: "All criteria met",
      },
    ], DUMMY_ROOT);

    const task = db
      .prepare("SELECT status, completed_at FROM tasks WHERE id = 'task-1'")
      .get() as { status: string; completed_at: string | null };
    expect(task.status).toBe("done");
    expect(task.completed_at).not.toBeNull();
  });
});
