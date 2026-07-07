import { deleteTaskFromYaml, refreshFromDocs } from "@arcbridge/core";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, textResult, type ToolResult } from "../helpers.js";
import type { TaskRow } from "../db-types.js";

export interface DeleteTaskParams {
  target_dir: string;
  task_id?: string;
  task_ids?: string[];
}

/** `delete` action of arcbridge_manage_tasks. */
export async function handleDeleteTask(
  ctx: ServerContext,
  params: DeleteTaskParams,
): Promise<ToolResult> {
  const db = ensureDb(ctx, params.target_dir);
  if (!db) return notInitialized();

  const ids = params.task_ids ?? (params.task_id ? [params.task_id] : []);
  if (ids.length === 0) {
    return textResult("Provide `task_ids` (array) or `task_id` (string) to delete.");
  }

  const results: string[] = [];
  const warnings: string[] = [];

  for (const id of ids) {
    const task = db
      .prepare("SELECT id, title, phase_id FROM tasks WHERE id = ?")
      .get(id) as TaskRow | undefined;

    if (!task) {
      warnings.push(`Task '${id}' not found — skipped`);
      continue;
    }

    const yamlResult = deleteTaskFromYaml(params.target_dir, task.phase_id, id);

    if (yamlResult.success === false) {
      warnings.push(`${task.id}: ${yamlResult.warning ?? "YAML delete failed"}`);
    } else {
      results.push(`- **${task.id}**: "${task.title}"`);
      if (yamlResult.warning) {
        warnings.push(`${task.id}: ${yamlResult.warning}`);
      }
    }
  }

  // Sync DB from YAML (single refresh instead of per-task DELETE)
  if (results.length > 0) {
    refreshFromDocs(db, params.target_dir);
  }

  const lines: string[] = [];
  if (results.length > 0) {
    lines.push(`Deleted ${results.length} task${results.length === 1 ? "" : "s"}:`, "", ...results);
  }
  if (warnings.length > 0) {
    lines.push("", "**Warnings:**", ...warnings.map((w) => `- ${w}`));
  }
  if (results.length === 0 && warnings.length > 0) {
    lines.unshift("No tasks were deleted.");
  }

  return textResult(lines.join("\n"));
}
