import { join } from "node:path";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { parse } from "yaml";
import matter from "gray-matter";
import type Database from "better-sqlite3";
import { openDatabase } from "../db/connection.js";
import { initializeSchema } from "../db/schema.js";
import type { InitProjectInput } from "../templates/types.js";
import { BuildingBlocksFrontmatterSchema } from "../schemas/building-blocks.js";
import { QualityScenariosFileSchema } from "../schemas/quality-scenarios.js";
import { PhasesFileSchema, TaskFileSchema } from "../schemas/phases.js";
import { AdrFrontmatterSchema } from "../schemas/adrs.js";

export interface GenerateDatabaseResult {
  db: Database.Database;
  warnings: string[];
}

function populateBuildingBlocks(
  db: Database.Database,
  targetDir: string,
): string[] {
  const warnings: string[] = [];
  const filePath = join(
    targetDir,
    ".arcbridge",
    "arc42",
    "05-building-blocks.md",
  );

  if (!existsSync(filePath)) {
    warnings.push("Building blocks file not found, skipping");
    return warnings;
  }

  const raw = readFileSync(filePath, "utf-8");
  const { data } = matter(raw);
  const result = BuildingBlocksFrontmatterSchema.safeParse(data);

  if (!result.success) {
    warnings.push(
      `Invalid building blocks frontmatter: ${result.error.issues.map((i) => i.message).join(", ")}`,
    );
    return warnings;
  }

  const fm = result.data;
  const insert = db.prepare(`
    INSERT OR IGNORE INTO building_blocks (id, name, level, parent_id, description, responsibility, code_paths, interfaces, service, last_synced)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const block of fm.blocks) {
    insert.run(
      block.id,
      block.name,
      block.level,
      block.parent_id ?? null,
      null,
      block.responsibility,
      JSON.stringify(block.code_paths),
      JSON.stringify(block.interfaces),
      block.service,
      fm.last_synced,
    );
  }

  return warnings;
}

function populateQualityScenarios(
  db: Database.Database,
  targetDir: string,
): string[] {
  const warnings: string[] = [];
  const filePath = join(
    targetDir,
    ".arcbridge",
    "arc42",
    "10-quality-scenarios.yaml",
  );

  if (!existsSync(filePath)) {
    warnings.push("Quality scenarios file not found, skipping");
    return warnings;
  }

  const raw = readFileSync(filePath, "utf-8");
  const parsed = parse(raw);
  const result = QualityScenariosFileSchema.safeParse(parsed);

  if (!result.success) {
    warnings.push(
      `Invalid quality scenarios: ${result.error.issues.map((i) => i.message).join(", ")}`,
    );
    return warnings;
  }

  const insert = db.prepare(`
    INSERT OR IGNORE INTO quality_scenarios (id, name, category, scenario, expected, priority, linked_code, linked_tests, linked_blocks, verification, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const s of result.data.scenarios) {
    insert.run(
      s.id,
      s.name,
      s.category,
      s.scenario,
      s.expected,
      s.priority,
      JSON.stringify(s.linked_code),
      JSON.stringify(s.linked_tests),
      JSON.stringify(s.linked_blocks),
      s.verification,
      s.status,
    );
  }

  return warnings;
}

function populatePhases(
  db: Database.Database,
  targetDir: string,
): string[] {
  const warnings: string[] = [];
  const phasesPath = join(targetDir, ".arcbridge", "plan", "phases.yaml");

  if (!existsSync(phasesPath)) {
    warnings.push("Phases file not found, skipping");
    return warnings;
  }

  const raw = readFileSync(phasesPath, "utf-8");
  const parsed = parse(raw);
  const result = PhasesFileSchema.safeParse(parsed);

  if (!result.success) {
    warnings.push(
      `Invalid phases file: ${result.error.issues.map((i) => i.message).join(", ")}`,
    );
    return warnings;
  }

  const insertPhase = db.prepare(`
    INSERT OR IGNORE INTO phases (id, name, phase_number, status, description, gate_status, started_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertTask = db.prepare(`
    INSERT OR IGNORE INTO tasks (id, phase_id, title, description, status, building_block, quality_scenarios, acceptance_criteria, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();

  for (const phase of result.data.phases) {
    insertPhase.run(
      phase.id,
      phase.name,
      phase.phase_number,
      phase.status,
      phase.description,
      JSON.stringify({}),
      phase.started_at ?? null,
      phase.completed_at ?? null,
    );

    // Try to load task file for this phase
    const taskPath = join(
      targetDir,
      ".arcbridge",
      "plan",
      "tasks",
      `${phase.id}.yaml`,
    );

    if (!existsSync(taskPath)) continue;

    const taskRaw = readFileSync(taskPath, "utf-8");
    const taskParsed = parse(taskRaw);
    const taskResult = TaskFileSchema.safeParse(taskParsed);

    if (!taskResult.success) {
      warnings.push(
        `Invalid task file for ${phase.id}: ${taskResult.error.issues.map((i) => i.message).join(", ")}`,
      );
      continue;
    }

    for (const task of taskResult.data.tasks) {
      insertTask.run(
        task.id,
        phase.id,
        task.title,
        null,
        task.status,
        task.building_block ?? null,
        JSON.stringify(task.quality_scenarios),
        JSON.stringify(task.acceptance_criteria),
        now,
      );
    }
  }

  return warnings;
}

function populateAdrs(
  db: Database.Database,
  targetDir: string,
): string[] {
  const warnings: string[] = [];
  const decisionsDir = join(
    targetDir,
    ".arcbridge",
    "arc42",
    "09-decisions",
  );

  if (!existsSync(decisionsDir)) {
    return warnings;
  }

  const files = readdirSync(decisionsDir).filter((f) => f.endsWith(".md"));

  const insert = db.prepare(`
    INSERT OR IGNORE INTO adrs (id, title, status, date, context, decision, consequences, affected_blocks, affected_files, quality_scenarios)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const file of files) {
    const raw = readFileSync(join(decisionsDir, file), "utf-8");
    const { data, content } = matter(raw);
    const result = AdrFrontmatterSchema.safeParse(data);

    if (!result.success) {
      warnings.push(
        `Invalid ADR ${file}: ${result.error.issues.map((i) => i.message).join(", ")}`,
      );
      continue;
    }

    const fm = result.data;
    insert.run(
      fm.id,
      fm.title,
      fm.status,
      fm.date,
      null,
      content.trim(),
      null,
      JSON.stringify(fm.affected_blocks),
      JSON.stringify(fm.affected_files),
      JSON.stringify(fm.quality_scenarios),
    );
  }

  return warnings;
}

/**
 * Re-read arc42 files from disk and update the database.
 * Uses INSERT OR REPLACE to pick up changes made since initial generation.
 */
export function refreshFromDocs(
  db: Database.Database,
  targetDir: string,
): string[] {
  const warnings: string[] = [];

  // Save existing statuses before clearing
  const existingTasks = db
    .prepare("SELECT id, status, completed_at FROM tasks")
    .all() as { id: string; status: string; completed_at: string | null }[];
  const taskStatusMap = new Map(
    existingTasks.map((t) => [t.id, { status: t.status, completed_at: t.completed_at }]),
  );

  const existingPhases = db
    .prepare("SELECT id, status, started_at, completed_at, gate_status FROM phases")
    .all() as { id: string; status: string; started_at: string | null; completed_at: string | null; gate_status: string }[];
  const phaseStatusMap = new Map(
    existingPhases.map((p) => [p.id, { status: p.status, started_at: p.started_at, completed_at: p.completed_at, gate_status: p.gate_status }]),
  );

  const existingScenarios = db
    .prepare("SELECT id, status FROM quality_scenarios")
    .all() as { id: string; status: string }[];
  const scenarioStatusMap = new Map(
    existingScenarios.map((s) => [s.id, s.status]),
  );

  // Wrap entire delete + repopulate + restore in a transaction for atomicity
  const refresh = db.transaction(() => {
    // Delete in FK-safe order: tasks → phases → building_blocks, then scenarios and ADRs
    db.prepare("DELETE FROM tasks").run();
    db.prepare("DELETE FROM phases").run();
    db.prepare("DELETE FROM building_blocks").run();
    db.prepare("DELETE FROM quality_scenarios").run();
    db.prepare("DELETE FROM adrs").run();

    // Re-populate from files
    warnings.push(...populateBuildingBlocks(db, targetDir));
    warnings.push(...populateQualityScenarios(db, targetDir));
    warnings.push(...populatePhases(db, targetDir));
    warnings.push(...populateAdrs(db, targetDir));

    // Restore task statuses that were previously set
    const restoreTask = db.prepare(
      "UPDATE tasks SET status = ?, completed_at = ? WHERE id = ?",
    );
    for (const [id, prev] of taskStatusMap) {
      if (prev.status !== "todo") {
        restoreTask.run(prev.status, prev.completed_at, id);
      }
    }

    // Restore phase statuses
    const restorePhase = db.prepare(
      "UPDATE phases SET status = ?, started_at = ?, completed_at = ?, gate_status = ? WHERE id = ?",
    );
    for (const [id, prev] of phaseStatusMap) {
      if (prev.status !== "planned") {
        restorePhase.run(prev.status, prev.started_at, prev.completed_at, prev.gate_status, id);
      }
    }

    // Restore quality scenario statuses
    const restoreScenario = db.prepare(
      "UPDATE quality_scenarios SET status = ? WHERE id = ?",
    );
    for (const [id, prev] of scenarioStatusMap) {
      if (prev !== "untested") {
        restoreScenario.run(prev, id);
      }
    }
  });

  refresh();

  return warnings;
}

export function generateDatabase(
  targetDir: string,
  input: InitProjectInput,
): GenerateDatabaseResult {
  const dbPath = join(targetDir, ".arcbridge", "index.db");
  const db = openDatabase(dbPath);
  initializeSchema(db);

  const allWarnings: string[] = [];

  // Set project metadata
  const upsert = db.prepare(
    "INSERT OR REPLACE INTO arcbridge_meta (key, value) VALUES (?, ?)",
  );
  upsert.run("project_name", input.name);
  upsert.run("project_type", input.template);
  upsert.run("last_full_index", new Date().toISOString());

  // Populate from generated files
  db.transaction(() => {
    allWarnings.push(...populateBuildingBlocks(db, targetDir));
    allWarnings.push(...populateQualityScenarios(db, targetDir));
    allWarnings.push(...populatePhases(db, targetDir));
    allWarnings.push(...populateAdrs(db, targetDir));
  })();

  return { db, warnings: allWarnings };
}
