import type { Database } from "@arcbridge/core";
import { loadConfig, insertActivity } from "@arcbridge/core";

// Cache config per project root to avoid reading YAML on every tool call
const configCache = new Map<string, { autoRecord: boolean; loadedAt: number }>();
const CACHE_TTL_MS = 30_000; // 30 seconds

function isAutoRecordEnabled(projectRoot: string): boolean {
  const cached = configCache.get(projectRoot);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.autoRecord;
  }

  const { config } = loadConfig(projectRoot);
  const autoRecord = config?.metrics?.auto_record ?? false;
  configCache.set(projectRoot, { autoRecord, loadedAt: Date.now() });
  return autoRecord;
}

/**
 * Auto-record agent activity if metrics.auto_record is enabled in config.
 * Call at the end of key MCP tool handlers. No-op if disabled or config missing.
 */
export function autoRecord(
  db: Database,
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
    if (!isAutoRecordEnabled(projectRoot)) return;

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
