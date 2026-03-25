import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { insertActivity, getSessionTotals } from "@arcbridge/core";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, textResult } from "../helpers.js";

export function registerRecordActivity(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "arcbridge_record_activity",
    "Record agent activity — model, tokens, cost, duration, and optional quality snapshot. Use this to track what work was done and measure agent performance.",
    {
      target_dir: z.string().describe("Absolute path to the project directory"),
      tool_name: z.string().describe("Name of the tool or action performed (e.g., 'arcbridge_update_task', 'code_edit')"),
      action: z.string().optional().describe("Human-readable label (e.g., 'implement login form')"),
      model: z.string().optional().describe("Model identifier (e.g., 'claude-sonnet-4-20250514')"),
      agent_role: z.string().optional().describe("Active ArcBridge role (e.g., 'implementer')"),
      task_id: z.string().optional().describe("Associated task ID"),
      phase_id: z.string().optional().describe("Associated phase ID"),
      input_tokens: z.number().int().nonnegative().optional().describe("Input/prompt tokens"),
      output_tokens: z.number().int().nonnegative().optional().describe("Output/completion tokens"),
      total_tokens: z.number().int().nonnegative().optional().describe("Total tokens (auto-computed if input+output given)"),
      cost_usd: z.number().nonnegative().optional().describe("Estimated cost in USD"),
      duration_ms: z.number().int().nonnegative().optional().describe("Wall-clock duration in ms"),
      drift_count: z.number().int().nonnegative().optional().describe("Current drift count"),
      drift_errors: z.number().int().nonnegative().optional().describe("Current drift errors"),
      test_pass_count: z.number().int().nonnegative().optional().describe("Passing tests"),
      test_fail_count: z.number().int().nonnegative().optional().describe("Failing tests"),
      lint_clean: z.boolean().optional().describe("Whether lint passes cleanly"),
      typecheck_clean: z.boolean().optional().describe("Whether typecheck passes cleanly"),
      notes: z.string().optional().describe("Free-form notes"),
      metadata: z.record(z.unknown()).optional().describe("Additional key-value metadata"),
    },
    async (params) => {
      const db = ensureDb(ctx, params.target_dir);
      if (!db) return notInitialized();

      const rowId = insertActivity(db, {
        toolName: params.tool_name,
        action: params.action,
        model: params.model,
        agentRole: params.agent_role,
        taskId: params.task_id,
        phaseId: params.phase_id,
        inputTokens: params.input_tokens,
        outputTokens: params.output_tokens,
        totalTokens: params.total_tokens,
        costUsd: params.cost_usd,
        durationMs: params.duration_ms,
        driftCount: params.drift_count,
        driftErrors: params.drift_errors,
        testPassCount: params.test_pass_count,
        testFailCount: params.test_fail_count,
        lintClean: params.lint_clean,
        typecheckClean: params.typecheck_clean,
        notes: params.notes,
        metadata: params.metadata,
      });

      // Get today's totals for the model
      const today = new Date().toISOString().slice(0, 10);
      const totals = getSessionTotals(db, today, params.model);

      const totalTokens =
        params.total_tokens ??
        (params.input_tokens != null && params.output_tokens != null
          ? params.input_tokens + params.output_tokens
          : null);

      const lines: string[] = [
        `# Activity Recorded (#${rowId})`,
        "",
        `- **Tool:** ${params.tool_name}`,
      ];

      if (params.action) lines.push(`- **Action:** ${params.action}`);
      if (params.model) lines.push(`- **Model:** ${params.model}`);
      if (totalTokens != null) {
        const detail = params.input_tokens != null && params.output_tokens != null
          ? `${params.input_tokens.toLocaleString()} in / ${params.output_tokens.toLocaleString()} out (${totalTokens.toLocaleString()} total)`
          : `${totalTokens.toLocaleString()} total`;
        lines.push(`- **Tokens:** ${detail}`);
      }
      if (params.cost_usd != null) lines.push(`- **Cost:** $${params.cost_usd.toFixed(4)}`);
      if (params.duration_ms != null) lines.push(`- **Duration:** ${params.duration_ms.toLocaleString()}ms`);

      lines.push(
        "",
        `## Session Totals (today${params.model ? `, ${params.model}` : ""})`,
        `- **Total cost:** $${totals.totalCost.toFixed(4)}`,
        `- **Total tokens:** ${totals.totalTokens.toLocaleString()}`,
        `- **Activities recorded:** ${totals.activityCount}`,
      );

      return textResult(lines.join("\n"));
    },
  );
}
