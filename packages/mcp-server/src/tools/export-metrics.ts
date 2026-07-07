import { exportMetrics } from "@arcbridge/core";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, textResult, type ToolResult } from "../helpers.js";

export interface ExportMetricsParams {
  target_dir: string;
  format: "json" | "csv" | "markdown";
  task_id?: string;
  phase_id?: string;
  model?: string;
  agent_role?: string;
  tool_name?: string;
  since?: string;
  until?: string;
  max_rows: number;
}

/** Export formats of arcbridge_get_metrics (format != summary). */
export async function handleExportMetrics(
  ctx: ServerContext,
  params: ExportMetricsParams,
): Promise<ToolResult> {
  const db = ensureDb(ctx, params.target_dir);
  if (!db) return notInitialized();

  const filePath = exportMetrics(
    db,
    params.target_dir,
    params.format,
    {
      taskId: params.task_id,
      phaseId: params.phase_id,
      model: params.model,
      agentRole: params.agent_role,
      toolName: params.tool_name,
      since: params.since,
      until: params.until,
    },
    params.max_rows,
  );

  return textResult(
    `Metrics exported to: ${filePath}\n\nYou can commit this file to preserve the activity record in git.`,
  );
}
