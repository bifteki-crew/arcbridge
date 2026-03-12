import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { verifyScenarios, loadConfig } from "@archlens/core";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, textResult } from "../helpers.js";

export function registerVerifyScenarios(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "archlens_verify_scenarios",
    "Run linked tests for quality scenarios and update their pass/fail status. Only runs scenarios with verification='automatic' or 'semi-automatic' and non-empty linked_tests.",
    {
      target_dir: z
        .string()
        .describe("Absolute path to the project directory"),
      scenario_ids: z
        .array(z.string())
        .optional()
        .describe(
          "Specific scenario IDs to verify (e.g., ['SEC-01', 'PERF-01']). If omitted, verifies all automatic scenarios.",
        ),
      test_command: z
        .string()
        .optional()
        .describe(
          "Override the test command from config (e.g., 'npx jest'). File paths are appended as arguments.",
        ),
    },
    async (params) => {
      const db = ensureDb(ctx, params.target_dir);
      if (!db) return notInitialized();

      // Load test config
      let testCommand = "npx vitest run";
      let timeoutMs = 60000;

      const configResult = loadConfig(params.target_dir);
      if (configResult.config) {
        testCommand = configResult.config.testing.test_command;
        timeoutMs = configResult.config.testing.timeout_ms;
      }

      // Allow override via parameter
      if (params.test_command) {
        testCommand = params.test_command;
      }

      const projectRoot = ctx.projectRoot ?? params.target_dir;

      const result = verifyScenarios(db, projectRoot, {
        testCommand,
        timeoutMs,
        scenarioIds: params.scenario_ids,
      });

      const lines: string[] = ["# Scenario Verification Results", ""];

      if (result.results.length === 0) {
        lines.push(
          "No testable scenarios found. Scenarios need `verification: automatic` (or `semi-automatic`) and non-empty `linked_tests` to be verified.",
        );
        return textResult(lines.join("\n"));
      }

      lines.push(`Ran tests for ${result.results.length} scenario(s).`, "");

      const passing = result.results.filter((r) => r.passed).length;
      const failing = result.results.length - passing;
      lines.push(
        `**Summary:** ${passing} passing, ${failing} failing`,
        "",
      );

      for (const r of result.results) {
        const icon = r.passed ? "PASS" : "FAIL";
        lines.push(
          `### [${icon}] ${r.scenarioId}: ${r.scenarioName} (${r.durationMs}ms)`,
          "",
        );
        lines.push(`Tests: ${r.testPaths.join(", ")}`, "");
        if (!r.passed && r.output) {
          const trimmed = r.output.length > 500 ? `...${r.output.slice(-500)}` : r.output;
          lines.push("```", trimmed, "```", "");
        }
      }

      if (result.updated > 0) {
        lines.push(
          `---`,
          `Updated status for ${result.updated} scenario(s) in the database.`,
        );
      }

      if (result.errors.length > 0) {
        lines.push("", "## Errors", "");
        for (const e of result.errors) {
          lines.push(`- ${e}`);
        }
      }

      return textResult(lines.join("\n"));
    },
  );
}
