import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { refreshFromDocs } from "@arcbridge/core";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, safeParseJson } from "../helpers.js";
import type { PhaseRow, TaskRow } from "../db-types.js";

export function registerGetPhasePlan(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "arcbridge_get_phase_plan",
    "Get the phase plan with phases, tasks, status, and gate requirements. Use filters to reduce output for large projects.",
    {
      target_dir: z
        .string()
        .describe("Absolute path to the project directory"),
      phase_id: z
        .string()
        .optional()
        .describe("Show only a specific phase by ID"),
      status: z
        .enum(["planned", "in-progress", "complete", "blocked"])
        .optional()
        .describe("Filter phases by status"),
      include_completed: z
        .boolean()
        .default(true)
        .describe("Include completed phases (default: true). Set to false to hide completed phases and reduce output."),
    },
    async (params) => {
      const db = ensureDb(ctx, params.target_dir);
      if (!db) return notInitialized();

      // Refresh DB from docs to pick up any YAML edits
      refreshFromDocs(db, params.target_dir);

      let query = "SELECT id, name, phase_number, status, description, gate_status, started_at, completed_at FROM phases";
      const conditions: string[] = [];
      const queryParams: string[] = [];

      if (params.phase_id) {
        conditions.push("id = ?");
        queryParams.push(params.phase_id);
      }
      if (params.status) {
        conditions.push("status = ?");
        queryParams.push(params.status);
      }
      if (!params.include_completed && !params.status) {
        conditions.push("status != 'complete'");
      }

      if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
      }
      query += " ORDER BY phase_number";

      const phases = db.prepare(query).all(...queryParams) as PhaseRow[];

      if (phases.length === 0) {
        const hint = params.phase_id
          ? `Phase '${params.phase_id}' not found.`
          : params.status
            ? `No phases with status '${params.status}'.`
            : "No phases defined yet.";
        return {
          content: [{ type: "text" as const, text: hint }],
        };
      }

      // Count total for context
      const totalPhases = (
        db.prepare("SELECT COUNT(*) as count FROM phases").get() as { count: number }
      ).count;

      const lines: string[] = [];
      if (phases.length < totalPhases) {
        lines.push(`# Phase Plan (${phases.length} of ${totalPhases} phases)`, "");
      } else {
        lines.push("# Phase Plan", "");
      }

      for (const phase of phases) {
        const icon =
          phase.status === "complete"
            ? "[x]"
            : phase.status === "in-progress"
              ? "[>]"
              : phase.status === "blocked"
                ? "[!]"
                : "[ ]";

        lines.push(
          `## ${icon} Phase ${phase.phase_number}: ${phase.name}`,
          "",
          `**ID:** \`${phase.id}\``,
          `**Status:** ${phase.status}`,
          `**Description:** ${phase.description}`,
        );

        if (phase.started_at) {
          lines.push(`**Started:** ${phase.started_at}`);
        }
        if (phase.completed_at) {
          lines.push(`**Completed:** ${phase.completed_at}`);
        }

        // Tasks for this phase
        const tasks = db
          .prepare(
            "SELECT id, title, status, building_block, quality_scenarios, acceptance_criteria FROM tasks WHERE phase_id = ? ORDER BY id",
          )
          .all(phase.id) as TaskRow[];

        if (tasks.length > 0) {
          const done = tasks.filter((t) => t.status === "done").length;
          lines.push(
            "",
            `### Tasks (${done}/${tasks.length} complete)`,
            "",
          );

          for (const task of tasks) {
            const check =
              task.status === "done"
                ? "[x]"
                : task.status === "in-progress"
                  ? "[>]"
                  : task.status === "blocked"
                    ? "[!]"
                    : "[ ]";

            lines.push(`- ${check} **${task.id}:** ${task.title}`);

            if (task.building_block) {
              lines.push(`  - Block: \`${task.building_block}\``);
            }

            const qScenarios = safeParseJson<string[]>(task.quality_scenarios, []);
            if (qScenarios.length > 0) {
              lines.push(
                `  - Quality: ${qScenarios.join(", ")}`,
              );
            }

            const criteria = safeParseJson<string[]>(task.acceptance_criteria, []);
            if (criteria.length > 0) {
              for (const c of criteria) {
                lines.push(`  - [ ] ${c}`);
              }
            }
          }
        }

        lines.push("");
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );
}
