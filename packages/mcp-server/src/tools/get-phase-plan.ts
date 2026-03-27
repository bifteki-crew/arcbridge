import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { refreshFromDocs } from "@arcbridge/core";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, safeParseJson } from "../helpers.js";

interface PhaseRow {
  id: string;
  name: string;
  phase_number: number;
  status: string;
  description: string;
  gate_status: string;
  started_at: string | null;
  completed_at: string | null;
}

interface TaskRow {
  id: string;
  title: string;
  status: string;
  building_block: string | null;
  quality_scenarios: string;
  acceptance_criteria: string;
}

export function registerGetPhasePlan(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "arcbridge_get_phase_plan",
    "Get the complete phase plan with all phases, their tasks, status, and gate requirements.",
    {
      target_dir: z
        .string()
        .describe("Absolute path to the project directory"),
    },
    async (params) => {
      const db = ensureDb(ctx, params.target_dir);
      if (!db) return notInitialized();

      // Refresh DB from docs to pick up any YAML edits
      refreshFromDocs(db, params.target_dir);

      const phases = db
        .prepare(
          "SELECT id, name, phase_number, status, description, gate_status, started_at, completed_at FROM phases ORDER BY phase_number",
        )
        .all() as PhaseRow[];

      if (phases.length === 0) {
        return {
          content: [
            { type: "text" as const, text: "No phases defined yet." },
          ],
        };
      }

      const lines: string[] = ["# Phase Plan", ""];

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
