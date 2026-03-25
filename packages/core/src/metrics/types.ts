export interface InsertActivityParams {
  toolName: string;
  action?: string;
  model?: string;
  agentRole?: string;
  taskId?: string;
  phaseId?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
  durationMs?: number;
  driftCount?: number;
  driftErrors?: number;
  testPassCount?: number;
  testFailCount?: number;
  lintClean?: boolean;
  typecheckClean?: boolean;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface QueryMetricsParams {
  taskId?: string;
  phaseId?: string;
  model?: string;
  agentRole?: string;
  toolName?: string;
  since?: string;
  until?: string;
  groupBy: "model" | "task" | "phase" | "tool" | "day" | "none";
  limit: number;
}

export interface ActivityRow {
  id: number;
  tool_name: string;
  action: string | null;
  model: string | null;
  agent_role: string | null;
  task_id: string | null;
  phase_id: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  cost_usd: number | null;
  duration_ms: number | null;
  drift_count: number | null;
  drift_errors: number | null;
  test_pass_count: number | null;
  test_fail_count: number | null;
  lint_clean: number | null;
  typecheck_clean: number | null;
  notes: string | null;
  metadata: string;
  recorded_at: string;
}

export interface AggregatedRow {
  groupKey: string;
  activityCount: number;
  sumTokens: number | null;
  avgTokens: number | null;
  sumCost: number | null;
  avgDuration: number | null;
  firstActivity: string;
  lastActivity: string;
}

export interface LatestQualitySnapshot {
  driftCount: number | null;
  driftErrors: number | null;
  testPassCount: number | null;
  testFailCount: number | null;
  lintClean: boolean | null;
  typecheckClean: boolean | null;
  capturedAt: string | null;
}

export interface SessionTotals {
  totalCost: number;
  totalTokens: number;
  activityCount: number;
}

export interface MetricsResult {
  rows: ActivityRow[] | AggregatedRow[];
  grouped: boolean;
  qualitySnapshot: LatestQualitySnapshot;
  totals: SessionTotals;
  timeSpan: { first: string; last: string } | null;
}

export type ExportFormat = "json" | "csv" | "markdown";
