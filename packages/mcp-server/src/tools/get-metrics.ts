import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { queryMetrics, type AggregatedRow, type ActivityRow } from "@arcbridge/core";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, textResult } from "../helpers.js";

export function registerGetMetrics(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "arcbridge_get_metrics",
    "Query agent activity metrics — filter by model, task, phase, or time range. Group by model/task/phase/tool/day for aggregated views.",
    {
      target_dir: z.string().describe("Absolute path to the project directory"),
      task_id: z.string().optional().describe("Filter by task ID"),
      phase_id: z.string().optional().describe("Filter by phase ID"),
      model: z.string().optional().describe("Filter by model name"),
      agent_role: z.string().optional().describe("Filter by agent role"),
      tool_name: z.string().optional().describe("Filter by tool name"),
      since: z.string().optional().describe("ISO 8601 timestamp — activity after this time"),
      until: z.string().optional().describe("ISO 8601 timestamp — activity before this time"),
      group_by: z.enum(["model", "task", "phase", "tool", "day", "none"]).default("none")
        .describe("Group results for aggregation"),
      limit: z.number().int().min(1).max(500).default(50)
        .describe("Max rows in detail view (group_by=none)"),
    },
    async (params) => {
      const db = ensureDb(ctx, params.target_dir);
      if (!db) return notInitialized();

      const result = queryMetrics(db, {
        taskId: params.task_id,
        phaseId: params.phase_id,
        model: params.model,
        agentRole: params.agent_role,
        toolName: params.tool_name,
        since: params.since,
        until: params.until,
        groupBy: params.group_by,
        limit: params.limit,
      });

      if (result.totals.activityCount === 0) {
        return textResult("No agent activity recorded yet. Use `arcbridge_record_activity` to log agent work.");
      }

      const lines: string[] = [];

      if (result.grouped) {
        const rows = result.rows as AggregatedRow[];
        lines.push(
          `# Agent Metrics (grouped by ${params.group_by})`,
          "",
          `| ${capitalize(params.group_by)} | Activities | Total Tokens | Avg Tokens | Total Cost | Avg Duration |`,
          `|${"-".repeat(20)}|-----------|-------------|-----------|-----------|-------------|`,
        );

        for (const r of rows) {
          lines.push(
            `| ${r.groupKey} | ${r.activityCount} | ${r.sumTokens?.toLocaleString() ?? "-"} | ${r.avgTokens?.toLocaleString() ?? "-"} | ${r.sumCost != null ? "$" + r.sumCost.toFixed(4) : "-"} | ${r.avgDuration != null ? Math.round(r.avgDuration) + "ms" : "-"} |`,
          );
        }
      } else {
        const rows = result.rows as ActivityRow[];
        lines.push(
          "# Agent Activity (recent)",
          "",
          "| Time | Tool | Action | Model | Tokens | Cost | Duration |",
          "|------|------|--------|-------|--------|------|----------|",
        );

        for (const r of rows) {
          lines.push(
            `| ${r.recorded_at.slice(0, 19)} | ${r.tool_name} | ${r.action ?? ""} | ${r.model ?? ""} | ${r.total_tokens?.toLocaleString() ?? ""} | ${r.cost_usd != null ? "$" + r.cost_usd.toFixed(4) : ""} | ${r.duration_ms != null ? r.duration_ms.toLocaleString() + "ms" : ""} |`,
          );
        }
      }

      // Quality snapshot
      const q = result.qualitySnapshot;
      if (q.capturedAt) {
        lines.push(
          "",
          "## Latest Quality Snapshot",
          "",
        );
        if (q.driftCount != null) lines.push(`- **Drift:** ${q.driftCount} issues (${q.driftErrors ?? 0} errors)`);
        if (q.testPassCount != null) lines.push(`- **Tests:** ${q.testPassCount} pass / ${q.testFailCount ?? 0} fail`);
        if (q.lintClean != null) lines.push(`- **Lint:** ${q.lintClean ? "clean" : "errors"}`);
        if (q.typecheckClean != null) lines.push(`- **Typecheck:** ${q.typecheckClean ? "clean" : "errors"}`);
      }

      // Totals
      lines.push(
        "",
        "## Totals",
        "",
        `- **Activities:** ${result.totals.activityCount}`,
        `- **Total cost:** $${result.totals.totalCost.toFixed(4)}`,
        `- **Total tokens:** ${result.totals.totalTokens.toLocaleString()}`,
      );

      if (result.timeSpan) {
        lines.push(`- **Time span:** ${result.timeSpan.first.slice(0, 10)} → ${result.timeSpan.last.slice(0, 10)}`);
      }

      return textResult(lines.join("\n"));
    },
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
