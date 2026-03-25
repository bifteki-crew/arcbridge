import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";
import type {
  InsertActivityParams,
  QueryMetricsParams,
  MetricsResult,
  SessionTotals,
  LatestQualitySnapshot,
  ActivityRow,
  AggregatedRow,
  ExportFormat,
} from "./types.js";

export function insertActivity(
  db: Database.Database,
  params: InsertActivityParams,
): number {
  const totalTokens =
    params.totalTokens ??
    (params.inputTokens != null && params.outputTokens != null
      ? params.inputTokens + params.outputTokens
      : null);

  const stmt = db.prepare(`
    INSERT INTO agent_activity (
      tool_name, action, model, agent_role,
      task_id, phase_id,
      input_tokens, output_tokens, total_tokens, cost_usd, duration_ms,
      drift_count, drift_errors, test_pass_count, test_fail_count,
      lint_clean, typecheck_clean,
      notes, metadata, recorded_at
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?,
      ?, ?, ?
    )
  `);

  const result = stmt.run(
    params.toolName,
    params.action ?? null,
    params.model ?? null,
    params.agentRole ?? null,
    params.taskId ?? null,
    params.phaseId ?? null,
    params.inputTokens ?? null,
    params.outputTokens ?? null,
    totalTokens,
    params.costUsd ?? null,
    params.durationMs ?? null,
    params.driftCount ?? null,
    params.driftErrors ?? null,
    params.testPassCount ?? null,
    params.testFailCount ?? null,
    params.lintClean != null ? (params.lintClean ? 1 : 0) : null,
    params.typecheckClean != null ? (params.typecheckClean ? 1 : 0) : null,
    params.notes ?? null,
    JSON.stringify(params.metadata ?? {}),
    new Date().toISOString(),
  );

  return Number(result.lastInsertRowid);
}

export function getSessionTotals(
  db: Database.Database,
  since?: string,
  model?: string,
): SessionTotals {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (since) {
    conditions.push("recorded_at >= ?");
    values.push(since);
  }
  if (model) {
    conditions.push("model = ?");
    values.push(model);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const row = db
    .prepare(
      `SELECT
        COALESCE(SUM(cost_usd), 0) as total_cost,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        COUNT(*) as activity_count
      FROM agent_activity ${where}`,
    )
    .get(...values) as {
    total_cost: number;
    total_tokens: number;
    activity_count: number;
  };

  return {
    totalCost: row.total_cost,
    totalTokens: row.total_tokens,
    activityCount: row.activity_count,
  };
}

export function queryMetrics(
  db: Database.Database,
  params: QueryMetricsParams,
): MetricsResult {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.taskId) {
    conditions.push("task_id = ?");
    values.push(params.taskId);
  }
  if (params.phaseId) {
    conditions.push("phase_id = ?");
    values.push(params.phaseId);
  }
  if (params.model) {
    conditions.push("model = ?");
    values.push(params.model);
  }
  if (params.agentRole) {
    conditions.push("agent_role = ?");
    values.push(params.agentRole);
  }
  if (params.toolName) {
    conditions.push("tool_name = ?");
    values.push(params.toolName);
  }
  if (params.since) {
    conditions.push("recorded_at >= ?");
    values.push(params.since);
  }
  if (params.until) {
    conditions.push("recorded_at <= ?");
    values.push(params.until);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Quality snapshot: latest non-null values
  const qualitySnapshot = getLatestQualitySnapshot(db, where, values);

  // Totals
  const totalsRow = db
    .prepare(
      `SELECT
        COALESCE(SUM(cost_usd), 0) as total_cost,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        COUNT(*) as activity_count,
        MIN(recorded_at) as first_at,
        MAX(recorded_at) as last_at
      FROM agent_activity ${where}`,
    )
    .get(...values) as {
    total_cost: number;
    total_tokens: number;
    activity_count: number;
    first_at: string | null;
    last_at: string | null;
  };

  const totals: SessionTotals = {
    totalCost: totalsRow.total_cost,
    totalTokens: totalsRow.total_tokens,
    activityCount: totalsRow.activity_count,
  };

  const timeSpan =
    totalsRow.first_at && totalsRow.last_at
      ? { first: totalsRow.first_at, last: totalsRow.last_at }
      : null;

  if (params.groupBy === "none") {
    const rows = db
      .prepare(
        `SELECT * FROM agent_activity ${where} ORDER BY recorded_at DESC LIMIT ?`,
      )
      .all(...values, params.limit) as ActivityRow[];

    return { rows, grouped: false, qualitySnapshot, totals, timeSpan };
  }

  // Grouped aggregation
  const groupColumn = getGroupColumn(params.groupBy);
  const rows = db
    .prepare(
      `SELECT
        ${groupColumn} as group_key,
        COUNT(*) as activity_count,
        SUM(total_tokens) as sum_tokens,
        ROUND(AVG(total_tokens)) as avg_tokens,
        ROUND(SUM(cost_usd), 4) as sum_cost,
        ROUND(AVG(duration_ms)) as avg_duration,
        MIN(recorded_at) as first_activity,
        MAX(recorded_at) as last_activity
      FROM agent_activity ${where}
      GROUP BY ${groupColumn}
      ORDER BY sum_cost DESC`,
    )
    .all(...values) as Array<{
    group_key: string | null;
    activity_count: number;
    sum_tokens: number | null;
    avg_tokens: number | null;
    sum_cost: number | null;
    avg_duration: number | null;
    first_activity: string;
    last_activity: string;
  }>;

  const aggregated: AggregatedRow[] = rows.map((r) => ({
    groupKey: r.group_key ?? "(none)",
    activityCount: r.activity_count,
    sumTokens: r.sum_tokens,
    avgTokens: r.avg_tokens,
    sumCost: r.sum_cost,
    avgDuration: r.avg_duration,
    firstActivity: r.first_activity,
    lastActivity: r.last_activity,
  }));

  return { rows: aggregated, grouped: true, qualitySnapshot, totals, timeSpan };
}

export function exportMetrics(
  db: Database.Database,
  projectRoot: string,
  format: ExportFormat,
  params: Omit<QueryMetricsParams, "groupBy" | "limit">,
  maxRows: number = 100_000,
): string {
  const result = queryMetrics(db, {
    ...params,
    groupBy: "none",
    limit: maxRows,
  });

  const rows = result.rows as ActivityRow[];
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dir = join(projectRoot, ".arcbridge", "metrics");
  mkdirSync(dir, { recursive: true });

  let content: string;
  let filename: string;

  switch (format) {
    case "json": {
      filename = `activity-${timestamp}.json`;
      content = JSON.stringify(
        {
          exported_at: new Date().toISOString(),
          totals: result.totals,
          quality_snapshot: result.qualitySnapshot,
          activities: rows.map((r) => ({
            ...r,
            metadata: safeParseJson(r.metadata),
          })),
        },
        null,
        2,
      );
      break;
    }

    case "csv": {
      filename = `activity-${timestamp}.csv`;
      const headers = [
        "id", "recorded_at", "tool_name", "action", "model", "agent_role",
        "task_id", "phase_id", "input_tokens", "output_tokens", "total_tokens",
        "cost_usd", "duration_ms", "drift_count", "drift_errors",
        "test_pass_count", "test_fail_count", "lint_clean", "typecheck_clean", "notes",
      ];
      const csvRows = rows.map((r) =>
        headers
          .map((h) => {
            const val = r[h as keyof ActivityRow];
            if (val == null) return "";
            const str = String(val);
            return str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")
              ? `"${str.replace(/"/g, '""')}"`
              : str;
          })
          .join(","),
      );
      content = [headers.join(","), ...csvRows].join("\n");
      break;
    }

    case "markdown": {
      filename = `activity-${timestamp}.md`;
      const lines: string[] = [
        `# Agent Activity Report`,
        "",
        `**Exported:** ${new Date().toISOString()}`,
        `**Activities:** ${result.totals.activityCount}`,
        `**Total cost:** $${result.totals.totalCost.toFixed(4)}`,
        `**Total tokens:** ${result.totals.totalTokens.toLocaleString()}`,
        "",
      ];

      if (result.qualitySnapshot.capturedAt) {
        const q = result.qualitySnapshot;
        lines.push(
          "## Latest Quality Snapshot",
          "",
          `| Metric | Value |`,
          `|--------|-------|`,
        );
        if (q.driftCount != null) lines.push(`| Drift issues | ${q.driftCount} (${q.driftErrors ?? 0} errors) |`);
        if (q.testPassCount != null) lines.push(`| Tests | ${q.testPassCount} pass / ${q.testFailCount ?? 0} fail |`);
        if (q.lintClean != null) lines.push(`| Lint | ${q.lintClean ? "clean" : "errors"} |`);
        if (q.typecheckClean != null) lines.push(`| Typecheck | ${q.typecheckClean ? "clean" : "errors"} |`);
        lines.push("");
      }

      lines.push(
        "## Activities",
        "",
        "| Time | Tool | Action | Model | Tokens | Cost | Duration |",
        "|------|------|--------|-------|--------|------|----------|",
      );

      for (const r of rows) {
        lines.push(
          `| ${r.recorded_at.slice(0, 19)} | ${esc(r.tool_name)} | ${esc(r.action)} | ${esc(r.model)} | ${r.total_tokens ?? ""} | ${r.cost_usd != null ? "$" + r.cost_usd.toFixed(4) : ""} | ${r.duration_ms != null ? r.duration_ms + "ms" : ""} |`,
        );
      }

      content = lines.join("\n") + "\n";
      break;
    }
  }

  const filePath = join(dir, filename);
  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

function getGroupColumn(groupBy: string): string {
  switch (groupBy) {
    case "model": return "model";
    case "task": return "task_id";
    case "phase": return "phase_id";
    case "tool": return "tool_name";
    case "day": return "DATE(recorded_at)";
    default: return "model";
  }
}

function getLatestQualitySnapshot(
  db: Database.Database,
  where: string,
  values: unknown[],
): LatestQualitySnapshot {
  const row = db
    .prepare(
      `SELECT
        drift_count, drift_errors,
        test_pass_count, test_fail_count,
        lint_clean, typecheck_clean,
        recorded_at
      FROM agent_activity
      ${where ? where + " AND" : "WHERE"}
        (drift_count IS NOT NULL OR test_pass_count IS NOT NULL OR lint_clean IS NOT NULL OR typecheck_clean IS NOT NULL)
      ORDER BY recorded_at DESC
      LIMIT 1`,
    )
    .get(...values) as {
    drift_count: number | null;
    drift_errors: number | null;
    test_pass_count: number | null;
    test_fail_count: number | null;
    lint_clean: number | null;
    typecheck_clean: number | null;
    recorded_at: string;
  } | undefined;

  if (!row) {
    return {
      driftCount: null,
      driftErrors: null,
      testPassCount: null,
      testFailCount: null,
      lintClean: null,
      typecheckClean: null,
      capturedAt: null,
    };
  }

  return {
    driftCount: row.drift_count,
    driftErrors: row.drift_errors,
    testPassCount: row.test_pass_count,
    testFailCount: row.test_fail_count,
    lintClean: row.lint_clean != null ? row.lint_clean === 1 : null,
    typecheckClean: row.typecheck_clean != null ? row.typecheck_clean === 1 : null,
    capturedAt: row.recorded_at,
  };
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** Escape a value for use in a Markdown table cell. */
function esc(val: string | null | undefined): string {
  if (val == null) return "";
  return val.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
