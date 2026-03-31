import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { refreshFromDocs } from "@arcbridge/core";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, safeParseJson } from "../helpers.js";

interface TaskRow {
  id: string;
  phase_id: string;
  title: string;
  description: string | null;
  status: string;
  building_block: string | null;
  quality_scenarios: string;
  acceptance_criteria: string;
}

interface PhaseRow {
  id: string;
  name: string;
}

export function registerGetCurrentTasks(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "arcbridge_get_current_tasks",
    "Get tasks for the current phase (in-progress, or first planned if none is in-progress), with their building blocks, quality scenarios, and acceptance criteria.",
    {
      target_dir: z
        .string()
        .describe("Absolute path to the project directory"),
      status: z
        .enum(["todo", "in-progress", "done", "blocked"])
        .optional()
        .describe("Filter tasks by status"),
    },
    async (params) => {
      const db = ensureDb(ctx, params.target_dir);
      if (!db) return notInitialized();

      // Refresh DB from docs to pick up any YAML edits
      refreshFromDocs(db, params.target_dir);

      // Find current phase (in-progress first, fall back to first planned)
      let currentPhase = db
        .prepare(
          "SELECT id, name FROM phases WHERE status = 'in-progress' ORDER BY phase_number LIMIT 1",
        )
        .get() as PhaseRow | undefined;

      if (!currentPhase) {
        // No in-progress phase — show first planned phase so agents can start it
        currentPhase = db
          .prepare(
            "SELECT id, name FROM phases WHERE status = 'planned' ORDER BY phase_number LIMIT 1",
          )
          .get() as PhaseRow | undefined;
      }

      if (!currentPhase) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No active or planned phases found. Use `arcbridge_get_phase_plan` to see all phases.",
            },
          ],
        };
      }

      let query =
        "SELECT id, phase_id, title, description, status, building_block, quality_scenarios, acceptance_criteria FROM tasks WHERE phase_id = ?";
      const queryParams: string[] = [currentPhase.id];

      if (params.status) {
        query += " AND status = ?";
        queryParams.push(params.status);
      }

      query += " ORDER BY id";

      const tasks = db.prepare(query).all(...queryParams) as TaskRow[];

      const lines: string[] = [
        `# Current Tasks: ${currentPhase.name}`,
        "",
      ];

      if (tasks.length === 0) {
        lines.push(
          params.status
            ? `No tasks with status '${params.status}' in this phase.`
            : "No tasks in this phase.",
        );
      } else {
        const done = tasks.filter((t) => t.status === "done").length;
        lines.push(`**Progress:** ${done}/${tasks.length} complete`, "");

        for (const task of tasks) {
          const check =
            task.status === "done"
              ? "[x]"
              : task.status === "in-progress"
                ? "[>]"
                : task.status === "blocked"
                  ? "[!]"
                  : "[ ]";

          lines.push(`## ${check} ${task.id}: ${task.title}`, "");
          lines.push(`**Status:** ${task.status}`);

          if (task.building_block) {
            lines.push(`**Building block:** \`${task.building_block}\``);
          }

          const qScenarios = safeParseJson<string[]>(task.quality_scenarios, []);
          if (qScenarios.length > 0) {
            lines.push(
              `**Quality scenarios:** ${qScenarios.join(", ")}`,
            );
          }

          const criteria = safeParseJson<string[]>(task.acceptance_criteria, []);
          if (criteria.length > 0) {
            lines.push("", "**Acceptance criteria:**");
            for (const c of criteria) {
              lines.push(
                `- ${task.status === "done" ? "[x]" : "[ ]"} ${c}`,
              );
            }
          }

          lines.push("");
        }
      }

      // Warn about future phases with no tasks
      const emptyFuturePhases = db
        .prepare(`
          SELECT p.id, p.name, p.phase_number FROM phases p
          WHERE p.status IN ('planned', 'in-progress')
            AND p.id != ?
            AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.phase_id = p.id)
          ORDER BY p.phase_number
        `)
        .all(currentPhase.id) as { id: string; name: string; phase_number: number }[];

      if (emptyFuturePhases.length > 0) {
        lines.push(
          "---",
          "",
          "**Warning:** The following phases have no tasks yet:",
          ...emptyFuturePhases.map((p) => `- Phase ${p.phase_number}: ${p.name} (\`${p.id}\`)`),
          "",
          "Use `arcbridge_create_task` to plan tasks before reaching these phases.",
        );
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );
}
