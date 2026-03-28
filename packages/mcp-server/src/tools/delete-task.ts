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
    "Delete a task permanently. Use this to remove example/template tasks or duplicates. For tasks that were planned but are no longer relevant, prefer `arcbridge_update_task` with status 'cancelled' instead — this preserves the decision trail.",
    {
      target_dir: z
        .string()
        .describe("Absolute path to the project directory"),
      task_id: z.string().describe("Task ID to delete"),
    },
    async (params) => {
      const db = ensureDb(ctx, params.target_dir);
      if (!db) return notInitialized();

      const task = db
        .prepare("SELECT id, title, phase_id FROM tasks WHERE id = ?")
        .get(params.task_id) as TaskRow | undefined;

      if (!task) {
        return textResult(
          `Task '${params.task_id}' not found. Use \`arcbridge_get_current_tasks\` to see available tasks.`,
        );
      }

      // Delete from YAML first (source of truth), then DB
      const yamlResult = deleteTaskFromYaml(params.target_dir, task.phase_id, params.task_id);
      db.prepare("DELETE FROM tasks WHERE id = ?").run(params.task_id);

      const msg = `Task **${task.id}** deleted: "${task.title}"`;
      if (yamlResult.warning) {
        return textResult(`${msg}\n\n**Warning:** ${yamlResult.warning}`);
      }
      return textResult(msg);
    },
  );
}
