import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { syncScenarioToYaml } from "@arcbridge/core";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, textResult } from "../helpers.js";

interface ScenarioRow {
  id: string;
  name: string;
  status: string;
  linked_tests: string;
  verification: string;
}

export function registerUpdateScenarioStatus(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "arcbridge_update_scenario_status",
    "Update a quality scenario's status and optionally link test files. Use this to mark scenarios as passing/failing after manual verification, or to link test files so `arcbridge_verify_scenarios` can run them automatically.",
    {
      target_dir: z.string().describe("Absolute path to the project directory"),
      scenario_id: z.string().describe("Quality scenario ID (e.g., 'SEC-01', 'PERF-01')"),
      status: z
        .enum(["passing", "failing", "untested", "partial"])
        .describe("New status for the scenario"),
      linked_tests: z
        .array(z.string())
        .optional()
        .describe(
          "Test file paths to link to this scenario (e.g., ['src/__tests__/auth.test.ts']). " +
          "Once linked, `arcbridge_verify_scenarios` can run them automatically.",
        ),
      notes: z.string().optional().describe("Optional notes about the verification"),
    },
    async (params) => {
      const db = ensureDb(ctx, params.target_dir);
      if (!db) return notInitialized();

      const projectRoot = ctx.projectRoot ?? params.target_dir;

      // Check scenario exists
      const scenario = db
        .prepare("SELECT id, name, status, linked_tests, verification FROM quality_scenarios WHERE id = ?")
        .get(params.scenario_id) as ScenarioRow | undefined;

      if (!scenario) {
        const available = db
          .prepare("SELECT id, name, status FROM quality_scenarios ORDER BY id")
          .all() as { id: string; name: string; status: string }[];
        const list = available.length > 0
          ? available.map((s) => `  - \`${s.id}\` ${s.name} (${s.status})`).join("\n")
          : "  (none)";
        return textResult(
          `Scenario '${params.scenario_id}' not found.\n\n**Available scenarios:**\n${list}`,
        );
      }

      const oldStatus = scenario.status;

      // Update status in DB
      db.prepare("UPDATE quality_scenarios SET status = ?, last_checked = ? WHERE id = ?").run(
        params.status,
        new Date().toISOString(),
        params.scenario_id,
      );

      // Update linked_tests if provided
      if (params.linked_tests) {
        db.prepare("UPDATE quality_scenarios SET linked_tests = ? WHERE id = ?").run(
          JSON.stringify(params.linked_tests),
          params.scenario_id,
        );
      }

      // Sync status (and linked_tests if provided) to YAML
      syncScenarioToYaml(projectRoot, params.scenario_id, params.status, params.linked_tests);

      const lines = [
        `Scenario **${scenario.id}** (${scenario.name}) updated: ${oldStatus} → **${params.status}**`,
      ];

      if (params.linked_tests) {
        lines.push(
          "",
          `**Linked tests:** ${params.linked_tests.length} file(s)`,
          ...params.linked_tests.map((t) => `  - ${t}`),
        );
      }

      if (params.notes) {
        lines.push("", `**Notes:** ${params.notes}`);
      }

      return textResult(lines.join("\n"));
    },
  );
}
