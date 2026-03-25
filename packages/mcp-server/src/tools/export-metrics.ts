import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { exportMetrics } from "@arcbridge/core";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, textResult } from "../helpers.js";

export function registerExportMetrics(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "arcbridge_export_metrics",
    "Export agent activity metrics to a file (JSON, CSV, or Markdown) in .arcbridge/metrics/ for git commits or reporting.",
    {
      target_dir: z.string().describe("Absolute path to the project directory"),
      format: z.enum(["json", "csv", "markdown"]).default("json")
        .describe("Export format"),
      task_id: z.string().optional().describe("Filter by task ID"),
      phase_id: z.string().optional().describe("Filter by phase ID"),
      model: z.string().optional().describe("Filter by model name"),
      agent_role: z.string().optional().describe("Filter by agent role"),
      tool_name: z.string().optional().describe("Filter by tool name"),
      since: z.string().optional().describe("ISO 8601 — activity after this time"),
      until: z.string().optional().describe("ISO 8601 — activity before this time"),
    },
    async (params) => {
      const db = ensureDb(ctx, params.target_dir);
      if (!db) return notInitialized();

      const filePath = exportMetrics(db, params.target_dir, params.format, {
        taskId: params.task_id,
        phaseId: params.phase_id,
        model: params.model,
        agentRole: params.agent_role,
        toolName: params.tool_name,
        since: params.since,
        until: params.until,
      });

      return textResult(
        `Metrics exported to: ${filePath}\n\nYou can commit this file to preserve the activity record in git.`,
      );
    },
  );
}
