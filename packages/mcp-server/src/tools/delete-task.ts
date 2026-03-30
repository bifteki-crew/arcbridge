import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { deleteTaskFromYaml, refreshFromDocs } from "@arcbridge/core";
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
    "Delete one or more tasks permanently. Use this to remove example/template tasks or duplicates. For tasks that were planned but are no longer relevant, prefer `arcbridge_update_task` with status 'cancelled' instead — this preserves the decision trail.",
    {
      target_dir: z
        .string()
        .describe("Absolute path to the project directory"),
      task_ids: z
        .array(z.string())
        .min(1)
        .describe("Task IDs to delete"),
    },
    async (params) => {
      const db = ensureDb(ctx, params.target_dir);
      if (!db) return notInitialized();

      const results: string[] = [];
      const warnings: string[] = [];

      for (const id of params.task_ids) {
        const task = db
          .prepare("SELECT id, title, phase_id FROM tasks WHERE id = ?")
          .get(id) as TaskRow | undefined;

        if (!task) {
          warnings.push(`Task '${id}' not found — skipped`);
          continue;
        }

        const yamlResult = deleteTaskFromYaml(params.target_dir, task.phase_id, id);

        results.push(`- **${task.id}**: "${task.title}"`);
        if (yamlResult.warning) {
          warnings.push(`${task.id}: ${yamlResult.warning}`);
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
    },
  );
}
