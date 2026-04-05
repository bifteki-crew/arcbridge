import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { parse, stringify } from "yaml";
import { TaskFileSchema, PhasesFileSchema } from "../schemas/phases.js";
import type { TaskFile, PhasesFile } from "../schemas/phases.js";
import { QualityScenariosFileSchema } from "../schemas/quality-scenarios.js";

// ─── Internal helpers to DRY up read-parse-validate patterns ─────────────────

function readTaskFile(projectRoot: string, phaseId: string): { taskFile: TaskFile; taskPath: string } | null {
  const taskPath = join(projectRoot, ".arcbridge", "plan", "tasks", `${phaseId}.yaml`);
  if (!existsSync(taskPath)) return null;
  const raw = readFileSync(taskPath, "utf-8");
  const result = TaskFileSchema.safeParse(parse(raw));
  if (!result.success) return null;
  return { taskFile: result.data, taskPath };
}

function readPhasesFile(projectRoot: string): { phasesFile: PhasesFile; phasesPath: string } | null {
  const phasesPath = join(projectRoot, ".arcbridge", "plan", "phases.yaml");
  if (!existsSync(phasesPath)) return null;
  const raw = readFileSync(phasesPath, "utf-8");
  const result = PhasesFileSchema.safeParse(parse(raw));
  if (!result.success) return null;
  return { phasesFile: result.data, phasesPath };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Update a task's status in the YAML task file.
 * Reads the file, updates the matching task, and writes it back.
 */
export function syncTaskToYaml(
  projectRoot: string,
  phaseId: string,
  taskId: string,
  status: string,
  completedAt?: string | null,
): void {
  const result = readTaskFile(projectRoot, phaseId);
  if (!result) return;

  const { taskFile, taskPath } = result;
  const task = taskFile.tasks.find((t) => t.id === taskId);
  if (!task) return;

  task.status = status as typeof task.status;
  if (completedAt) {
    task.completed_at = completedAt;
  } else if (status !== "done") {
    delete task.completed_at;
  }

  writeFileSync(taskPath, stringify(taskFile), "utf-8");
}

/**
 * Add a new task to a phase's YAML task file.
 * Creates the file if it doesn't exist.
 */
export function addTaskToYaml(
  projectRoot: string,
  phaseId: string,
  task: {
    id: string;
    title: string;
    status: string;
    building_block?: string;
    quality_scenarios: string[];
    acceptance_criteria: string[];
  },
): void {
  const tasksDir = join(projectRoot, ".arcbridge", "plan", "tasks");
  mkdirSync(tasksDir, { recursive: true });

  const result = readTaskFile(projectRoot, phaseId);
  const taskFile = result
    ? (result.taskFile as { schema_version: 1; phase_id: string; tasks: typeof task[] })
    : { schema_version: 1, phase_id: phaseId, tasks: [] as typeof task[] };

  // Don't duplicate
  if (!taskFile.tasks.some((t) => t.id === task.id)) {
    taskFile.tasks.push(task);
  }

  const taskPath = join(tasksDir, `${phaseId}.yaml`);
  writeFileSync(taskPath, stringify(taskFile), "utf-8");
}

/**
 * Update a phase's status in phases.yaml.
 */
export function syncPhaseToYaml(
  projectRoot: string,
  phaseId: string,
  status: string,
  startedAt?: string | null,
  completedAt?: string | null,
): void {
  const result = readPhasesFile(projectRoot);
  if (!result) return;

  const { phasesFile, phasesPath } = result;
  const phase = phasesFile.phases.find((p) => p.id === phaseId);
  if (!phase) return;

  phase.status = status as typeof phase.status;
  if (startedAt) phase.started_at = startedAt;
  if (completedAt) phase.completed_at = completedAt;

  writeFileSync(phasesPath, stringify(phasesFile), "utf-8");
}

/**
 * Add a new phase to the phases.yaml file.
 */
export function addPhaseToYaml(
  projectRoot: string,
  phase: {
    id: string;
    name: string;
    phase_number: number;
    description: string;
    gate_requirements?: string[];
  },
): { success: boolean; warning?: string } {
  try {
    const readResult = readPhasesFile(projectRoot);
    if (!readResult) {
      return { success: false, warning: "phases.yaml not found or failed validation" };
    }

    const { phasesFile, phasesPath } = readResult;

    // Guard against duplicates
    const existingById = phasesFile.phases.some((p) => p.id === phase.id);
    const existingByNumber = phasesFile.phases.some((p) => p.phase_number === phase.phase_number);

    if (existingByNumber && !existingById) {
      const conflicting = phasesFile.phases.find((p) => p.phase_number === phase.phase_number);
      return {
        success: false,
        warning: `Phase number ${phase.phase_number} already used by '${conflicting?.id}'`,
      };
    }

    // Ensure task file exists (for new phases and retries of the same phase)
    const tasksDir = join(projectRoot, ".arcbridge", "plan", "tasks");
    mkdirSync(tasksDir, { recursive: true });
    const taskFilePath = join(tasksDir, `${phase.id}.yaml`);
    if (!existsSync(taskFilePath)) {
      writeFileSync(
        taskFilePath,
        stringify({ schema_version: 1, phase_id: phase.id, tasks: [] }),
        "utf-8",
      );
    }

    if (existingById) {
      return { success: true }; // Retry — phase already exists, task file ensured
    }

    phasesFile.phases.push({
      id: phase.id,
      name: phase.name,
      phase_number: phase.phase_number,
      status: "planned",
      description: phase.description,
      gate_requirements: phase.gate_requirements ?? [],
    });

    phasesFile.phases.sort((a, b) => a.phase_number - b.phase_number);
    writeFileSync(phasesPath, stringify(phasesFile), "utf-8");

    return { success: true };
  } catch (err) {
    return {
      success: false,
      warning: `YAML write failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Update a quality scenario's status in 10-quality-scenarios.yaml.
 */
export function syncScenarioToYaml(
  projectRoot: string,
  scenarioId: string,
  status: string,
  linkedTests?: string[],
  verification?: string,
): void {
  const scenarioPath = join(
    projectRoot,
    ".arcbridge",
    "arc42",
    "10-quality-scenarios.yaml",
  );

  if (!existsSync(scenarioPath)) return;

  const raw = readFileSync(scenarioPath, "utf-8");
  const parsed = parse(raw);
  const result = QualityScenariosFileSchema.safeParse(parsed);
  if (!result.success) return;

  const scenariosFile = result.data;
  const scenario = scenariosFile.scenarios.find((s) => s.id === scenarioId);
  if (!scenario) return;

  scenario.status = status as typeof scenario.status;
  if (linkedTests) {
    scenario.linked_tests = linkedTests;
  }
  if (verification) {
    scenario.verification = verification as typeof scenario.verification;
  }

  writeFileSync(scenarioPath, stringify(scenariosFile), "utf-8");
}

/**
 * Delete a task from the YAML task file.
 */
export function deleteTaskFromYaml(
  projectRoot: string,
  phaseId: string,
  taskId: string,
): { success: boolean; warning?: string } {
  try {
    const readResult = readTaskFile(projectRoot, phaseId);
    if (!readResult) {
      // No file or unparseable — check which case
      const taskPath = join(projectRoot, ".arcbridge", "plan", "tasks", `${phaseId}.yaml`);
      if (!existsSync(taskPath)) {
        return { success: true }; // No file = nothing to remove
      }
      return {
        success: false,
        warning: `Could not parse ${phaseId}.yaml — task may reappear after reindex`,
      };
    }

    const { taskFile, taskPath } = readResult;
    const before = taskFile.tasks.length;
    taskFile.tasks = taskFile.tasks.filter((t) => t.id !== taskId);

    if (taskFile.tasks.length === before) {
      return { success: true }; // Task wasn't in YAML (created via MCP only)
    }

    writeFileSync(taskPath, stringify(taskFile), "utf-8");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      warning: `YAML update failed: ${err instanceof Error ? err.message : String(err)} — task may reappear after reindex`,
    };
  }
}

/**
 * Delete a phase from phases.yaml and its associated task file.
 */
export function deletePhaseFromYaml(
  projectRoot: string,
  phaseId: string,
): { success: boolean; warning?: string } {
  try {
    const readResult = readPhasesFile(projectRoot);
    if (!readResult) {
      return { success: false, warning: "phases.yaml not found or could not be parsed" };
    }

    const { phasesFile, phasesPath } = readResult;
    const before = phasesFile.phases.length;
    phasesFile.phases = phasesFile.phases.filter((p) => p.id !== phaseId);

    if (phasesFile.phases.length === before) {
      return { success: false, warning: `Phase '${phaseId}' not found in phases.yaml` };
    }

    writeFileSync(phasesPath, stringify(phasesFile), "utf-8");

    // Remove the associated task file
    const taskFilePath = join(projectRoot, ".arcbridge", "plan", "tasks", `${phaseId}.yaml`);
    try {
      unlinkSync(taskFilePath);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      warning: `YAML update failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
