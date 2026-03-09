import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { ensureDb, NOT_INITIALIZED } from "../helpers.js";

export function registerCreateTask(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "archlens_create_task",
    "Create a new task in a phase. Links it to a building block and quality scenarios.",
    {
      target_dir: z
        .string()
        .describe("Absolute path to the project directory"),
      phase_id: z.string().describe("Phase ID to add the task to"),
      title: z.string().min(1).describe("Task title"),
      building_block: z
        .string()
        .optional()
        .describe("Building block this task belongs to"),
      quality_scenarios: z
        .array(z.string())
        .default([])
        .describe("Quality scenario IDs this task addresses"),
      acceptance_criteria: z
        .array(z.string())
        .default([])
        .describe("Acceptance criteria for this task"),
    },
    async (params) => {
      const db = ensureDb(ctx, params.target_dir);
      if (!db) return NOT_INITIALIZED;

      // Verify phase exists
      const phase = db
        .prepare("SELECT id, name, phase_number FROM phases WHERE id = ?")
        .get(params.phase_id) as
        | { id: string; name: string; phase_number: number }
        | undefined;

      if (!phase) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Phase '${params.phase_id}' not found. Use \`archlens_get_phase_plan\` to see phases.`,
            },
          ],
        };
      }

      // Generate task ID
      const existingCount = (
        db
          .prepare(
            "SELECT COUNT(*) as count FROM tasks WHERE phase_id = ?",
          )
          .get(params.phase_id) as { count: number }
      ).count;

      const taskNum = existingCount + 1;
      const slug = params.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 30);
      const taskId = `task-${phase.phase_number}.${taskNum}-${slug}`;

      const now = new Date().toISOString();

      db.prepare(
        "INSERT INTO tasks (id, phase_id, title, description, status, building_block, quality_scenarios, acceptance_criteria, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        taskId,
        params.phase_id,
        params.title,
        null,
        "todo",
        params.building_block ?? null,
        JSON.stringify(params.quality_scenarios),
        JSON.stringify(params.acceptance_criteria),
        now,
      );

      const lines = [
        `Task created: **${taskId}**`,
        "",
        `**Title:** ${params.title}`,
        `**Phase:** ${phase.name}`,
        `**Status:** todo`,
      ];

      if (params.building_block) {
        lines.push(`**Block:** \`${params.building_block}\``);
      }
      if (params.quality_scenarios.length > 0) {
        lines.push(
          `**Quality scenarios:** ${params.quality_scenarios.join(", ")}`,
        );
      }
      if (params.acceptance_criteria.length > 0) {
        lines.push("", "**Acceptance criteria:**");
        for (const c of params.acceptance_criteria) {
          lines.push(`- [ ] ${c}`);
        }
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );
}
