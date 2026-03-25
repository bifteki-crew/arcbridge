import type Database from "better-sqlite3";
import { loadConfig, insertActivity } from "@arcbridge/core";

/**
 * Auto-record agent activity if metrics.auto_record is enabled in config.
 * Call at the end of key MCP tool handlers. No-op if disabled or config missing.
 */
export function autoRecord(
  db: Database.Database,
  projectRoot: string,
  params: {
    toolName: string;
    action?: string;
    taskId?: string;
    phaseId?: string;
    durationMs?: number;
    driftCount?: number;
    driftErrors?: number;
    testPassCount?: number;
    testFailCount?: number;
    lintClean?: boolean;
    typecheckClean?: boolean;
  },
): void {
  try {
    const { config } = loadConfig(projectRoot);
    if (!config?.metrics?.auto_record) return;

    insertActivity(db, {
      toolName: params.toolName,
      action: params.action,
      taskId: params.taskId,
      phaseId: params.phaseId,
      durationMs: params.durationMs,
      driftCount: params.driftCount,
      driftErrors: params.driftErrors,
      testPassCount: params.testPassCount,
      testFailCount: params.testFailCount,
      lintClean: params.lintClean,
      typecheckClean: params.typecheckClean,
    });
  } catch {
    // Never let metrics recording break the actual tool
  }
}
