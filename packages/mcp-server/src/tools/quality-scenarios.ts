import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { QualityCategorySchema, QualityPrioritySchema, QualityScenarioStatusSchema } from "@arcbridge/core";
import type { ServerContext } from "../context.js";
import { textResult } from "../helpers.js";
import { handleListScenarios } from "./get-quality-scenarios.js";
import { handleUpdateScenarioStatus } from "./update-scenario-status.js";

/**
 * Consolidated quality-scenario access (replaces arcbridge_get_quality_scenarios
 * and arcbridge_update_scenario_status in 0.10.0). arcbridge_verify_scenarios
 * stays separate — it runs tests.
 */
export function registerQualityScenarios(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "arcbridge_quality_scenarios",
    "List or update quality scenarios. `action: list` shows scenarios with linked code/tests and status (filter by category/status/priority). `action: update` sets a scenario's status after manual verification and can link test files (requires scenario_id + status) — linking tests lets `arcbridge_verify_scenarios` run them automatically.",
    {
      target_dir: z.string().describe("Absolute path to the project directory"),
      action: z.enum(["list", "update"]).default("list").describe("What to do"),
      category: QualityCategorySchema.optional().describe("list: filter by category"),
      status: QualityScenarioStatusSchema.optional().describe(
        "list: filter by status. update (required): new status (passing|failing|untested|partial)",
      ),
      priority: QualityPrioritySchema.optional().describe("list: filter by priority (must/should/could)"),
      scenario_id: z.string().optional().describe("update (required): scenario ID, e.g. 'SEC-01'"),
      linked_tests: z
        .array(z.string())
        .optional()
        .describe("update: test file paths to link (sets verification to 'semi-automatic' if currently 'manual')"),
    },
    async (params) => {
      if (params.action === "update") {
        if (!params.scenario_id || !params.status) {
          return textResult("`action: update` requires `scenario_id` and `status`.");
        }
        return handleUpdateScenarioStatus(ctx, {
          target_dir: params.target_dir,
          scenario_id: params.scenario_id,
          status: params.status as "passing" | "failing" | "untested" | "partial",
          linked_tests: params.linked_tests,
        });
      }
      return handleListScenarios(ctx, {
        target_dir: params.target_dir,
        category: params.category,
        status: params.status,
        priority: params.priority,
      });
    },
  );
}
