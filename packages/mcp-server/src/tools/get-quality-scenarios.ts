import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { QualityCategorySchema, QualityScenarioStatusSchema } from "@archlens/core";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, safeParseJson } from "../helpers.js";

interface ScenarioRow {
  id: string;
  name: string;
  category: string;
  scenario: string;
  expected: string;
  priority: string;
  linked_code: string;
  linked_tests: string;
  linked_blocks: string;
  verification: string;
  status: string;
}

export function registerGetQualityScenarios(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "archlens_get_quality_scenarios",
    "Get quality scenarios, optionally filtered by category. Shows scenario details, linked code/tests, and current status.",
    {
      target_dir: z
        .string()
        .describe("Absolute path to the project directory"),
      category: QualityCategorySchema.optional().describe("Filter by category"),
      status: QualityScenarioStatusSchema.optional().describe("Filter by status"),
    },
    async (params) => {
      const db = ensureDb(ctx, params.target_dir);
      if (!db) return notInitialized();

      let query =
        "SELECT id, name, category, scenario, expected, priority, linked_code, linked_tests, linked_blocks, verification, status FROM quality_scenarios";
      const conditions: string[] = [];
      const queryParams: string[] = [];

      if (params.category) {
        conditions.push("category = ?");
        queryParams.push(params.category);
      }
      if (params.status) {
        conditions.push("status = ?");
        queryParams.push(params.status);
      }

      if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
      }
      query += " ORDER BY category, id";

      const scenarios = db.prepare(query).all(...queryParams) as ScenarioRow[];

      if (scenarios.length === 0) {
        const filter = [params.category, params.status]
          .filter(Boolean)
          .join(", ");
        return {
          content: [
            {
              type: "text" as const,
              text: filter
                ? `No quality scenarios found matching: ${filter}`
                : "No quality scenarios defined yet.",
            },
          ],
        };
      }

      // Group by category
      const byCategory = new Map<string, ScenarioRow[]>();
      for (const s of scenarios) {
        const list = byCategory.get(s.category) ?? [];
        list.push(s);
        byCategory.set(s.category, list);
      }

      const statusIcon = (s: string) =>
        s === "passing"
          ? "PASS"
          : s === "failing"
            ? "FAIL"
            : s === "partial"
              ? "PARTIAL"
              : "UNTESTED";

      const lines: string[] = ["# Quality Scenarios", ""];

      // Summary
      const passing = scenarios.filter((s) => s.status === "passing").length;
      const failing = scenarios.filter((s) => s.status === "failing").length;
      const untested = scenarios.filter((s) => s.status === "untested").length;
      const partial = scenarios.filter((s) => s.status === "partial").length;
      lines.push(
        `**Total:** ${scenarios.length} | **Passing:** ${passing} | **Failing:** ${failing} | **Untested:** ${untested} | **Partial:** ${partial}`,
        "",
      );

      for (const [category, items] of byCategory) {
        lines.push(
          `## ${category.charAt(0).toUpperCase() + category.slice(1)}`,
          "",
        );

        for (const s of items) {
          const linkedCode = safeParseJson<string[]>(s.linked_code, []);
          const linkedTests = safeParseJson<string[]>(s.linked_tests, []);
          const linkedBlocks = safeParseJson<string[]>(s.linked_blocks, []);

          lines.push(
            `### ${statusIcon(s.status)} ${s.id}: ${s.name}`,
            "",
            `- **Priority:** ${s.priority}`,
            `- **Verification:** ${s.verification}`,
            `- **Scenario:** ${s.scenario}`,
            `- **Expected:** ${s.expected}`,
          );

          if (linkedCode.length > 0) {
            lines.push(
              `- **Linked code:** ${linkedCode.map((c) => `\`${c}\``).join(", ")}`,
            );
          }
          if (linkedTests.length > 0) {
            lines.push(
              `- **Linked tests:** ${linkedTests.map((t) => `\`${t}\``).join(", ")}`,
            );
          }
          if (linkedBlocks.length > 0) {
            lines.push(
              `- **Linked blocks:** ${linkedBlocks.map((b) => `\`${b}\``).join(", ")}`,
            );
          }
          lines.push("");
        }
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );
}
