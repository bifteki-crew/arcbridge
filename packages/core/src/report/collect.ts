import type { Database } from "../db/connection.js";

/**
 * Snapshot of everything `arcbridge report` renders. Two independent halves:
 * `architecture` is derived from the committed model + the latest drift run
 * (always populated), while `activity` comes from the agent_activity telemetry
 * table, which is EMPTY unless `metrics.auto_record` is enabled or an agent
 * calls record_activity — so the renderer must handle an empty activity half.
 */
export interface ReportData {
  projectName: string | null;
  generatedAt: string;
  architecture: ArchitectureHealth;
  activity: ActivitySummary;
}

export interface ArchitectureHealth {
  blocks: { total: number; stale: BlockStaleness[] };
  drift: {
    total: number;
    bySeverity: Record<string, number>;
    byKind: { kind: string; count: number }[];
    byBlock: { block: string; count: number }[];
  };
  scenarios: {
    total: number;
    byStatus: Record<string, number>;
    /** Share of non-untested scenarios that pass, or null when none are checked. */
    passRate: number | null;
    failingMust: { id: string; name: string }[];
  };
  plan: {
    phases: { total: number; complete: number };
    tasks: { total: number; done: number; blocked: number; cancelled: number };
  };
}

export interface BlockStaleness {
  id: string;
  name: string;
  lastSynced: string | null;
  /** Whole days since last sync; null when never synced. */
  ageDays: number | null;
}

export interface ActivitySummary {
  /** False when agent_activity has no rows — the renderer shows guidance instead. */
  hasData: boolean;
  totals: { activities: number; tokens: number; costUsd: number; durationMs: number };
  byModel: { key: string; activities: number; tokens: number; costUsd: number }[];
  byRole: { key: string; activities: number; tokens: number; costUsd: number }[];
  byDay: { day: string; activities: number; tokens: number; costUsd: number }[];
  /** Latest-first quality snapshots, for a drift-over-time trend. */
  qualityTrend: {
    recordedAt: string;
    driftCount: number | null;
    driftErrors: number | null;
    testPass: number | null;
    testFail: number | null;
  }[];
}

function countBy<T extends string>(rows: { key: T; count: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.key] = r.count;
  return out;
}

/** Whole days between an ISO timestamp and now; null for unparseable input. */
function ageInDays(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((now - then) / 86_400_000));
}

export function collectReportData(db: Database, generatedAt: string): ReportData {
  const now = Date.parse(generatedAt);
  const nowMs = Number.isNaN(now) ? Date.now() : now;

  const projectName =
    (db.prepare("SELECT value FROM arcbridge_meta WHERE key = 'project_name'").get() as
      | { value: string }
      | undefined)?.value ?? null;

  // --- Building blocks + staleness (the "docs within 1 session of accuracy" proxy)
  const blockRows = db
    .prepare("SELECT id, name, last_synced FROM building_blocks ORDER BY id")
    .all() as { id: string; name: string; last_synced: string | null }[];
  const stale = blockRows
    .map((b) => ({
      id: b.id,
      name: b.name,
      lastSynced: b.last_synced,
      ageDays: ageInDays(b.last_synced, nowMs),
    }))
    // Never-synced first, then oldest
    .sort((a, b) => (b.ageDays ?? Infinity) - (a.ageDays ?? Infinity));

  // --- Current drift snapshot (drift_log holds the latest run, not history)
  const driftBySeverity = db
    .prepare("SELECT severity AS key, COUNT(*) AS count FROM drift_log WHERE resolution IS NULL GROUP BY severity")
    .all() as { key: string; count: number }[];
  const driftByKind = db
    .prepare("SELECT kind, COUNT(*) AS count FROM drift_log WHERE resolution IS NULL GROUP BY kind ORDER BY count DESC, kind")
    .all() as { kind: string; count: number }[];
  const driftByBlock = db
    .prepare(
      "SELECT COALESCE(affected_block, '(unassigned)') AS block, COUNT(*) AS count FROM drift_log WHERE resolution IS NULL GROUP BY block ORDER BY count DESC, block",
    )
    .all() as { block: string; count: number }[];
  const driftTotal = driftBySeverity.reduce((sum, r) => sum + r.count, 0);

  // --- Quality scenarios
  const scenarioByStatus = db
    .prepare("SELECT status AS key, COUNT(*) AS count FROM quality_scenarios GROUP BY status")
    .all() as { key: string; count: number }[];
  const statusCounts = countBy(scenarioByStatus);
  const checked = (statusCounts.passing ?? 0) + (statusCounts.failing ?? 0) + (statusCounts.partial ?? 0);
  const failingMust = db
    .prepare("SELECT id, name FROM quality_scenarios WHERE priority = 'must' AND status = 'failing' ORDER BY id")
    .all() as { id: string; name: string }[];

  // --- Plan progress
  const phaseTotals = db
    .prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) AS complete FROM phases")
    .get() as { total: number; complete: number | null };
  const taskTotals = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done,
              SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) AS blocked,
              SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
       FROM tasks`,
    )
    .get() as { total: number; done: number | null; blocked: number | null; cancelled: number | null };

  return {
    projectName,
    generatedAt,
    architecture: {
      blocks: { total: blockRows.length, stale },
      drift: {
        total: driftTotal,
        bySeverity: statusDefaults(countBy(driftBySeverity), ["error", "warning", "info"]),
        byKind: driftByKind,
        byBlock: driftByBlock,
      },
      scenarios: {
        total: scenarioByStatus.reduce((sum, r) => sum + r.count, 0),
        byStatus: statusCounts,
        passRate: checked > 0 ? Math.round(((statusCounts.passing ?? 0) / checked) * 1000) / 10 : null,
        failingMust,
      },
      plan: {
        phases: { total: phaseTotals.total, complete: phaseTotals.complete ?? 0 },
        tasks: {
          total: taskTotals.total,
          done: taskTotals.done ?? 0,
          blocked: taskTotals.blocked ?? 0,
          cancelled: taskTotals.cancelled ?? 0,
        },
      },
    },
    activity: collectActivity(db),
  };
}

function statusDefaults(counts: Record<string, number>, keys: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of keys) out[k] = counts[k] ?? 0;
  return out;
}

function collectActivity(db: Database): ActivitySummary {
  const totalsRow = db
    .prepare(
      `SELECT COUNT(*) AS activities,
              COALESCE(SUM(total_tokens), 0) AS tokens,
              COALESCE(SUM(cost_usd), 0) AS cost,
              COALESCE(SUM(duration_ms), 0) AS duration
       FROM agent_activity`,
    )
    .get() as { activities: number; tokens: number; cost: number; duration: number };

  if (totalsRow.activities === 0) {
    return {
      hasData: false,
      totals: { activities: 0, tokens: 0, costUsd: 0, durationMs: 0 },
      byModel: [],
      byRole: [],
      byDay: [],
      qualityTrend: [],
    };
  }

  const grouped = (column: string): { key: string; activities: number; tokens: number; costUsd: number }[] =>
    db
      .prepare(
        `SELECT COALESCE(${column}, '(unknown)') AS key,
                COUNT(*) AS activities,
                COALESCE(SUM(total_tokens), 0) AS tokens,
                COALESCE(SUM(cost_usd), 0) AS costUsd
         FROM agent_activity GROUP BY key ORDER BY activities DESC, key`,
      )
      .all() as { key: string; activities: number; tokens: number; costUsd: number }[];

  const byDay = db
    .prepare(
      `SELECT substr(recorded_at, 1, 10) AS day,
              COUNT(*) AS activities,
              COALESCE(SUM(total_tokens), 0) AS tokens,
              COALESCE(SUM(cost_usd), 0) AS costUsd
       FROM agent_activity GROUP BY day ORDER BY day`,
    )
    .all() as { day: string; activities: number; tokens: number; costUsd: number }[];

  const qualityTrend = db
    .prepare(
      `SELECT recorded_at AS recordedAt, drift_count AS driftCount, drift_errors AS driftErrors,
              test_pass_count AS testPass, test_fail_count AS testFail
       FROM agent_activity
       WHERE drift_count IS NOT NULL OR test_pass_count IS NOT NULL
       ORDER BY recorded_at DESC
       LIMIT 50`,
    )
    .all() as ActivitySummary["qualityTrend"];

  return {
    hasData: true,
    totals: {
      activities: totalsRow.activities,
      tokens: totalsRow.tokens,
      costUsd: totalsRow.cost,
      durationMs: totalsRow.duration,
    },
    byModel: grouped("model"),
    byRole: grouped("agent_role"),
    byDay,
    qualityTrend,
  };
}
