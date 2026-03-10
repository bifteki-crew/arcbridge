import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized } from "../helpers.js";

interface TaskRow {
  id: string;
  title: string;
  status: string;
  phase_id: string;
}

export function registerUpdateTask(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "archlens_update_task",
    "Update a task's status. Use this to mark tasks as in-progress, done, or blocked as you work.",
    {
      target_dir: z
        .string()
        .describe("Absolute path to the project directory"),
      task_id: z.string().describe("Task ID (e.g., 'task-0.1-init-nextjs')"),
      status: z
        .enum(["in-progress", "done", "blocked"])
        .describe("New status"),
      notes: z
        .string()
        .optional()
        .describe("Optional notes about the status change"),
    },
    async (params) => {
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
              text: `Task '${params.task_id}' not found. Use \`archlens_get_current_tasks\` to see available tasks.`,
            },
          ],
        };
      }

      const oldStatus = task.status;
      const now = new Date().toISOString();

      // Update status
      if (params.status === "done") {
        db.prepare(
          "UPDATE tasks SET status = ?, completed_at = ? WHERE id = ?",
        ).run(params.status, now, params.task_id);
      } else {
        db.prepare("UPDATE tasks SET status = ? WHERE id = ?").run(
          params.status,
          params.task_id,
        );
      }

      const lines: string[] = [
        `Task **${task.id}** updated: ${oldStatus} → ${params.status}`,
        "",
        `**${task.title}**`,
      ];

      if (params.notes) {
        lines.push("", `**Notes:** ${params.notes}`);
      }

      // If task is done, show phase progress
      if (params.status === "done") {
        const phaseStats = db
          .prepare(
            "SELECT COUNT(*) as total, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done FROM tasks WHERE phase_id = ?",
          )
          .get(task.phase_id) as { total: number; done: number };

        lines.push(
          "",
          `**Phase progress:** ${phaseStats.done}/${phaseStats.total} tasks complete`,
        );

        if (phaseStats.done === phaseStats.total) {
          lines.push(
            "",
            "All tasks in this phase are complete! The phase is ready to advance.",
          );
        }
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );
}
