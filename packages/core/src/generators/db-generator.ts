import { join } from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import { parse } from "yaml";
import matter from "gray-matter";
import type Database from "better-sqlite3";
import { openDatabase } from "../db/connection.js";
import { initializeSchema } from "../db/schema.js";
import type { InitProjectInput } from "../templates/types.js";
import type { BuildingBlocksFrontmatter } from "../schemas/building-blocks.js";
import type { QualityScenariosFile } from "../schemas/quality-scenarios.js";
import type { PhasesFile, TaskFile } from "../schemas/phases.js";
import type { AdrFrontmatter } from "../schemas/adrs.js";

function populateBuildingBlocks(
  db: Database.Database,
  targetDir: string,
): void {
  const filePath = join(
    targetDir,
    ".archlens",
    "arc42",
    "05-building-blocks.md",
  );
  const raw = readFileSync(filePath, "utf-8");
  const { data } = matter(raw);
  const fm = data as BuildingBlocksFrontmatter;

  const insert = db.prepare(`
    INSERT INTO building_blocks (id, name, level, parent_id, description, responsibility, code_paths, interfaces, service, last_synced)
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
}

function populateQualityScenarios(
  db: Database.Database,
  targetDir: string,
): void {
  const filePath = join(
    targetDir,
    ".archlens",
    "arc42",
    "10-quality-scenarios.yaml",
  );
  const raw = readFileSync(filePath, "utf-8");
  const data = parse(raw) as QualityScenariosFile;

  const insert = db.prepare(`
    INSERT INTO quality_scenarios (id, name, category, scenario, expected, priority, linked_code, linked_tests, linked_blocks, verification, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const s of data.scenarios) {
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
}

function populatePhases(db: Database.Database, targetDir: string): void {
  const phasesPath = join(targetDir, ".archlens", "plan", "phases.yaml");
  const raw = readFileSync(phasesPath, "utf-8");
  const data = parse(raw) as PhasesFile;

  const insertPhase = db.prepare(`
    INSERT INTO phases (id, name, phase_number, status, description, gate_status, started_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertTask = db.prepare(`
    INSERT INTO tasks (id, phase_id, title, description, status, building_block, quality_scenarios, acceptance_criteria, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();

  for (const phase of data.phases) {
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
    try {
      const taskPath = join(
        targetDir,
        ".archlens",
        "plan",
        "tasks",
        `${phase.id}.yaml`,
      );
      const taskRaw = readFileSync(taskPath, "utf-8");
      const taskData = parse(taskRaw) as TaskFile;

      for (const task of taskData.tasks) {
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
    } catch {
      // No task file for this phase — that's fine
    }
  }
}

function populateAdrs(db: Database.Database, targetDir: string): void {
  const decisionsDir = join(
    targetDir,
    ".archlens",
    "arc42",
    "09-decisions",
  );

  try {
    const files = readdirSync(decisionsDir).filter((f) =>
      f.endsWith(".md"),
    );

    const insert = db.prepare(`
      INSERT INTO adrs (id, title, status, date, context, decision, consequences, affected_blocks, affected_files, quality_scenarios)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const file of files) {
      const raw = readFileSync(join(decisionsDir, file), "utf-8");
      const { data, content } = matter(raw);
      const fm = data as AdrFrontmatter;

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
  } catch {
    // No decisions directory yet
  }
}

export function generateDatabase(
  targetDir: string,
  input: InitProjectInput,
): Database.Database {
  const dbPath = join(targetDir, ".archlens", "index.db");
  const db = openDatabase(dbPath);
  initializeSchema(db);

  // Set project metadata
  const upsert = db.prepare(
    "INSERT OR REPLACE INTO archlens_meta (key, value) VALUES (?, ?)",
  );
  upsert.run("project_name", input.name);
  upsert.run("project_type", input.template);
  upsert.run("last_full_index", new Date().toISOString());

  // Populate from generated files
  db.transaction(() => {
    populateBuildingBlocks(db, targetDir);
    populateQualityScenarios(db, targetDir);
    populatePhases(db, targetDir);
    populateAdrs(db, targetDir);
  })();

  return db;
}
