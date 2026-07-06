import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { textResult } from "../helpers.js";
import { handleCreateTask } from "./create-task.js";
import { handleUpdateTask } from "./update-task.js";
import { handleDeleteTask } from "./delete-task.js";

/**
 * Consolidated task CRUD (replaces arcbridge_create_task, arcbridge_update_task
 * and arcbridge_delete_task in 0.10.0). One tool, one `action` discriminator —
 * fewer near-duplicate schemas for agents to pick between.
 */
export function registerManageTasks(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "arcbridge_manage_tasks",
    "Create, update, or delete tasks. `action: create` adds a task to a phase (requires phase_id + title). `action: update` changes a task's status (requires task_id + status) — use status 'cancelled' for tasks no longer relevant, preserving the decision trail. `action: delete` removes tasks permanently (requires task_ids) — prefer update→cancelled for planned-but-dropped work. To list tasks, use `arcbridge_get_phase_plan`.",
    {
      target_dir: z.string().describe("Absolute path to the project directory"),
      action: z.enum(["create", "update", "delete"]).describe("What to do"),
      phase_id: z.string().optional().describe("create (required): phase to add the task to"),
      title: z.string().optional().describe("create (required): task title"),
      building_block: z
        .string()
        .optional()
        .describe("create: building block this task belongs to (see `arcbridge_get_building_blocks`)"),
      quality_scenarios: z
        .array(z.string())
        .optional()
        .describe("create: quality scenario IDs this task addresses"),
      acceptance_criteria: z
        .array(z.string())
        .optional()
        .describe("create: acceptance criteria"),
      task_id: z.string().optional().describe("update (required): task ID, e.g. 'task-0.1-init'"),
      status: z
        .enum(["in-progress", "done", "blocked", "cancelled"])
        .optional()
        .describe("update (required): new status"),
      notes: z.string().optional().describe("update: notes about the status change"),
      task_ids: z.array(z.string()).optional().describe("delete (required): task IDs to delete"),
    },
    async (params) => {
      switch (params.action) {
        case "create": {
          if (!params.phase_id || !params.title) {
            return textResult("`action: create` requires `phase_id` and `title`.");
          }
          return handleCreateTask(ctx, {
            target_dir: params.target_dir,
            phase_id: params.phase_id,
            title: params.title,
            building_block: params.building_block,
            quality_scenarios: params.quality_scenarios ?? [],
            acceptance_criteria: params.acceptance_criteria ?? [],
          });
        }
        case "update": {
          if (!params.task_id || !params.status) {
            return textResult("`action: update` requires `task_id` and `status`.");
          }
          return handleUpdateTask(ctx, {
            target_dir: params.target_dir,
            task_id: params.task_id,
            status: params.status,
            notes: params.notes,
          });
        }
        case "delete": {
          if (!params.task_ids?.length && !params.task_id) {
            return textResult("`action: delete` requires `task_ids` (or `task_id`).");
          }
          return handleDeleteTask(ctx, {
            target_dir: params.target_dir,
            task_id: params.task_id,
            task_ids: params.task_ids,
          });
        }
      }
    },
  );
}
