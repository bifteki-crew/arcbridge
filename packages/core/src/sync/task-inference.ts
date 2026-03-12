import type Database from "better-sqlite3";

export interface TaskInferenceResult {
  taskId: string;
  previousStatus: string;
  inferredStatus: string;
  reason: string;
}

interface TaskRow {
  id: string;
  title: string;
  status: string;
  building_block: string | null;
  quality_scenarios: string;
  acceptance_criteria: string;
}

interface BlockRow {
  id: string;
  code_paths: string;
}

/**
 * Infer task status from code state.
 * Checks if building block code exists, acceptance criteria symbols are present, etc.
 */
export function inferTaskStatuses(
  db: Database.Database,
  phaseId: string,
): TaskInferenceResult[] {
  const results: TaskInferenceResult[] = [];

  const tasks = db
    .prepare(
      "SELECT id, title, status, building_block, quality_scenarios, acceptance_criteria FROM tasks WHERE phase_id = ? AND status != 'done'",
    )
    .all(phaseId) as TaskRow[];

  for (const task of tasks) {
    const inference = inferSingleTask(db, task);
    if (inference && inference.inferredStatus !== task.status) {
      results.push(inference);
    }
  }

  return results;
}

/**
 * Apply inferred statuses to the database.
 */
export function applyInferences(
  db: Database.Database,
  inferences: TaskInferenceResult[],
): void {
  const update = db.prepare(
    "UPDATE tasks SET status = ?, completed_at = CASE WHEN ? = 'done' THEN ? ELSE completed_at END WHERE id = ?",
  );

  const now = new Date().toISOString();

  const run = db.transaction(() => {
    for (const inf of inferences) {
      update.run(inf.inferredStatus, inf.inferredStatus, now, inf.taskId);
    }
  });

  run();
}

function inferSingleTask(
  db: Database.Database,
  task: TaskRow,
): TaskInferenceResult | null {
  // Check 1: Does the building block have indexed code?
  if (task.building_block) {
    const block = db
      .prepare("SELECT id, code_paths FROM building_blocks WHERE id = ?")
      .get(task.building_block) as BlockRow | undefined;

    if (block) {
      const codePaths = safeParseJson<string[]>(block.code_paths, []);
      if (codePaths.length > 0) {
        const hasCode = codePaths.some((cp) => {
          const prefix = cp.replace(/\*+\/?$/, "");
          const match = db
            .prepare("SELECT 1 FROM symbols WHERE file_path LIKE ? ESCAPE '\\' LIMIT 1")
            .get(`${escapeLike(prefix)}%`);
          return !!match;
        });

        if (hasCode && task.status === "todo") {
          return {
            taskId: task.id,
            previousStatus: task.status,
            inferredStatus: "in-progress",
            reason: `Building block \`${task.building_block}\` has indexed code`,
          };
        }
      }
    }
  }

  // Check 2: Do acceptance criteria reference symbols that exist?
  const criteria = safeParseJson<string[]>(task.acceptance_criteria, []);
  if (criteria.length > 0) {
    // Look for symbol-like references in criteria (file paths or symbol IDs)
    const symbolRefs = criteria.filter(
      (c) => c.includes("/") || c.includes("::"),
    );

    if (symbolRefs.length > 0) {
      const allFound = symbolRefs.every((ref) => {
        if (ref.includes("::")) {
          // Symbol ID reference
          return !!db
            .prepare("SELECT 1 FROM symbols WHERE id = ?")
            .get(ref);
        }
        // File path reference
        return !!db
          .prepare("SELECT 1 FROM symbols WHERE file_path = ? LIMIT 1")
          .get(ref);
      });

      if (allFound) {
        return {
          taskId: task.id,
          previousStatus: task.status,
          inferredStatus: "done",
          reason: `All acceptance criteria symbol references found in codebase`,
        };
      }

      const someFound = symbolRefs.some((ref) => {
        if (ref.includes("::")) {
          return !!db
            .prepare("SELECT 1 FROM symbols WHERE id = ?")
            .get(ref);
        }
        return !!db
          .prepare("SELECT 1 FROM symbols WHERE file_path = ? LIMIT 1")
          .get(ref);
      });

      if (someFound && task.status === "todo") {
        return {
          taskId: task.id,
          previousStatus: task.status,
          inferredStatus: "in-progress",
          reason: `Some acceptance criteria symbol references found in codebase`,
        };
      }
    }
  }

  // Check 3: Quality scenarios linked to this task — are they passing?
  const scenarioIds = safeParseJson<string[]>(task.quality_scenarios, []);
  if (scenarioIds.length > 0) {
    const placeholders = scenarioIds.map(() => "?").join(", ");
    const scenarios = db
      .prepare(
        `SELECT id, status FROM quality_scenarios WHERE id IN (${placeholders})`,
      )
      .all(...scenarioIds) as { id: string; status: string }[];

    const allPassing = scenarios.length > 0 && scenarios.every((s) => s.status === "passing");
    if (allPassing && task.status !== "done") {
      return {
        taskId: task.id,
        previousStatus: task.status,
        inferredStatus: "done",
        reason: `All linked quality scenarios are passing`,
      };
    }
  }

  return null;
}

function escapeLike(value: string): string {
  return value.replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function safeParseJson<T>(value: string | null, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
