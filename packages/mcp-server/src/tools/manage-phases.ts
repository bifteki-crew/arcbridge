import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { textResult } from "../helpers.js";
import { handleCreatePhase } from "./create-phase.js";
import { handleDeletePhase } from "./delete-phase.js";
import { handleCompletePhase } from "./complete-phase.js";

/**
 * Consolidated phase lifecycle (replaces arcbridge_create_phase,
 * arcbridge_delete_phase and arcbridge_complete_phase in 0.10.0). The
 * `complete` action keeps the full gate validation (tasks done, no critical
 * drift, quality scenarios passing).
 */
export function registerManagePhases(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "arcbridge_manage_phases",
    "Create, delete, or complete phases. `action: create` adds a phase to the plan (requires name + description). `action: delete` removes a planned phase and its tasks (requires phase_id; only status 'planned' can be deleted). `action: complete` validates all gates — tasks done, no critical drift, quality scenarios passing — and transitions the phase to 'complete' if they pass (phase_id defaults to the in-progress phase). To view phases, use `arcbridge_get_phase_plan`.",
    {
      target_dir: z.string().describe("Absolute path to the project directory"),
      action: z.enum(["create", "delete", "complete"]).describe("What to do"),
      name: z.string().optional().describe("create (required): phase name"),
      description: z.string().optional().describe("create (required): what this phase covers"),
      phase_number: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("create: phase number (default: next after highest)"),
      gate_requirements: z
        .array(z.string())
        .optional()
        .describe("create: requirements to complete this phase"),
      phase_id: z
        .string()
        .optional()
        .describe("delete (required) / complete: phase ID (complete defaults to the in-progress phase)"),
      notes: z.string().optional().describe("complete: notes about the completion"),
      auto_infer: z
        .boolean()
        .default(true)
        .describe("complete: infer task statuses from code state before checking gates"),
      run_tests: z
        .boolean()
        .default(false)
        .describe("complete: run linked tests for quality scenarios before the quality gate"),
    },
    async (params) => {
      switch (params.action) {
        case "create": {
          if (!params.name || !params.description) {
            return textResult("`action: create` requires `name` and `description`.");
          }
          return handleCreatePhase(ctx, {
            target_dir: params.target_dir,
            name: params.name,
            description: params.description,
            phase_number: params.phase_number,
            gate_requirements: params.gate_requirements ?? [],
          });
        }
        case "delete": {
          if (!params.phase_id) {
            return textResult("`action: delete` requires `phase_id`.");
          }
          return handleDeletePhase(ctx, {
            target_dir: params.target_dir,
            phase_id: params.phase_id,
          });
        }
        case "complete": {
          return handleCompletePhase(ctx, {
            target_dir: params.target_dir,
            phase_id: params.phase_id,
            notes: params.notes,
            auto_infer: params.auto_infer,
            run_tests: params.run_tests,
          });
        }
      }
    },
  );
}
