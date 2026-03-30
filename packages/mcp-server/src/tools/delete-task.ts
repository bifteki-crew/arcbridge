import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { deleteTaskFromYaml } from "@arcbridge/core";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, textResult } from "../helpers.js";

interface TaskRow {
  id: string;
  title: string;
  phase_id: string;
}

export function registerDeleteTask(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "arcbridge_delete_task",
    "Delete one or more tasks permanently. Use this to remove example/template tasks or duplicates. Pass a single task_id or an array of task_ids for batch deletion. For tasks that were planned but are no longer relevant, prefer `arcbridge_update_task` with status 'cancelled' instead — this preserves the decision trail.",
    {
      target_dir: z
        .string()
        .describe("Absolute path to the project directory"),
      task_id: z.string().optional().describe("Single task ID to delete"),
      task_ids: z
        .array(z.string())
        .optional()
        .describe("Array of task IDs to delete (batch deletion)"),
    },
    async (params) => {
      const db = ensureDb(ctx, params.target_dir);
      if (!db) return notInitialized();

      // Collect IDs from either param
      const ids = params.task_ids ?? (params.task_id ? [params.task_id] : []);
      if (ids.length === 0) {
        return textResult("Provide `task_id` or `task_ids` to delete.");
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
        db.prepare("DELETE FROM tasks WHERE id = ?").run(id);

        results.push(`- **${task.id}**: "${task.title}"`);
        if (yamlResult.warning) {
          warnings.push(`${task.id}: ${yamlResult.warning}`);
        }
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
    },
  );
}
