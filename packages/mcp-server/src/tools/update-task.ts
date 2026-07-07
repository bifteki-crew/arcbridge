import { syncTaskToYaml } from "@arcbridge/core";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, type ToolResult } from "../helpers.js";
import { autoRecord } from "../auto-record.js";
import type { TaskRow } from "../db-types.js";

export interface UpdateTaskParams {
  target_dir: string;
  task_id: string;
  status: "in-progress" | "done" | "blocked" | "cancelled";
  notes?: string;
}

/** `update` action of arcbridge_manage_tasks. */
export async function handleUpdateTask(
  ctx: ServerContext,
  params: UpdateTaskParams,
): Promise<ToolResult> {
  const start = Date.now();
  const db = ensureDb(ctx, params.target_dir);
  if (!db) return notInitialized();

  // Check task exists
  const task = db
    .prepare("SELECT id, title, status, phase_id FROM tasks WHERE id = ?")
    .get(params.task_id) as TaskRow | undefined;

  if (!task) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Task '${params.task_id}' not found. Use \`arcbridge_get_phase_plan\` to see available tasks.`,
        },
      ],
    };
  }

  const oldStatus = task.status;
  const now = new Date().toISOString();

  // Update status in DB
  if (params.status === "done") {
    db.prepare(
      "UPDATE tasks SET status = ?, completed_at = ? WHERE id = ?",
    ).run(params.status, now, params.task_id);
  } else {
    // Clear completed_at when moving away from done (e.g., done → cancelled)
    db.prepare(
      "UPDATE tasks SET status = ?, completed_at = NULL WHERE id = ?",
    ).run(params.status, params.task_id);
  }

  // Write back to YAML
  syncTaskToYaml(
    params.target_dir,
    task.phase_id,
    params.task_id,
    params.status,
    params.status === "done" ? now : null,
  );

  const lines: string[] = [
    `Task **${task.id}** updated: ${oldStatus} → ${params.status}`,
    "",
    `**${task.title}**`,
  ];

  if (params.notes) {
    lines.push("", `**Notes:** ${params.notes}`);
  }

  // If task is done or cancelled, show phase progress
  if (params.status === "done" || params.status === "cancelled") {
    // Cancelled tasks are excluded from the total — they're out of scope
    const phaseStats = db
      .prepare(
        "SELECT SUM(CASE WHEN status != 'cancelled' THEN 1 ELSE 0 END) as total, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done FROM tasks WHERE phase_id = ?",
      )
      .get(task.phase_id) as { total: number; done: number };

    lines.push(
      "",
      `**Phase progress:** ${phaseStats.done}/${phaseStats.total} tasks complete`,
    );

    if (phaseStats.total > 0 && phaseStats.done === phaseStats.total) {
      lines.push(
        "",
        "All tasks in this phase are complete! The phase is ready to advance.",
      );
    }
  }

  autoRecord(db, params.target_dir, {
    toolName: "arcbridge_manage_tasks",
    action: `${task.id}: ${oldStatus} → ${params.status}`,
    taskId: params.task_id,
    phaseId: task.phase_id,
    durationMs: Date.now() - start,
  });

  return {
    content: [{ type: "text" as const, text: lines.join("\n") }],
  };
}
