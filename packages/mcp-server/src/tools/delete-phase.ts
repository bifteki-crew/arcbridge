import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { deletePhaseFromYaml, refreshFromDocs } from "@arcbridge/core";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, textResult } from "../helpers.js";

interface PhaseRow {
  id: string;
  name: string;
  phase_number: number;
  status: string;
}

interface TaskCountRow {
  count: number;
}

export function registerDeletePhase(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "arcbridge_delete_phase",
    "Delete a phase and all its tasks permanently. Use this to remove template phases that don't apply to this project. Phases with status 'in-progress' or 'done' cannot be deleted — change their status first if you really need to remove them.",
    {
      target_dir: z
        .string()
        .describe("Absolute path to the project directory"),
      phase_id: z.string().describe("Phase ID to delete"),
    },
    async (params) => {
      const db = ensureDb(ctx, params.target_dir);
      if (!db) return notInitialized();

      const phase = db
        .prepare("SELECT id, name, phase_number, status FROM phases WHERE id = ?")
        .get(params.phase_id) as PhaseRow | undefined;

      if (!phase) {
        return textResult(
          `Phase '${params.phase_id}' not found. Use \`arcbridge_get_phase_plan\` to see available phases.`,
        );
      }

      if (phase.status !== "planned") {
        return textResult(
          `Cannot delete phase **${phase.id}** (status: ${phase.status}). Only phases with status 'planned' can be deleted.`,
        );
      }

      const taskCount = db
        .prepare("SELECT COUNT(*) as count FROM tasks WHERE phase_id = ?")
        .get(params.phase_id) as TaskCountRow;

      // Delete from YAML (source of truth) — removes phase + task file
      const yamlResult = deletePhaseFromYaml(params.target_dir, params.phase_id);

      if (!yamlResult.success) {
        return textResult(
          `Failed to delete phase: ${yamlResult.warning ?? "Unknown error"}`,
        );
      }

      // Sync DB from YAML
      refreshFromDocs(db, params.target_dir);

      const lines = [
        `Phase **${phase.id}** deleted: "${phase.name}" (phase ${phase.phase_number})`,
      ];
      if (taskCount.count > 0) {
        lines.push(`${taskCount.count} task${taskCount.count === 1 ? "" : "s"} removed.`);
      }

      return textResult(lines.join("\n"));
    },
  );
}
