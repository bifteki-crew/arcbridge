// `arcbridge report` data collection + HTML rendering.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openMemoryDatabase, type Database } from "../db/connection.js";
import { initializeSchema } from "../db/schema.js";
import { collectReportData } from "../report/collect.js";
import { renderReportHtml, esc } from "../report/render.js";

const NOW = "2026-07-25T12:00:00.000Z";
let db: Database;

beforeEach(() => {
  db = openMemoryDatabase();
  initializeSchema(db);
});
afterEach(() => db.close());

function addBlock(id: string, name: string, lastSynced: string | null): void {
  db.prepare(
    "INSERT INTO building_blocks (id, name, level, responsibility, code_paths, interfaces, last_synced) VALUES (?, ?, 1, 'r', '[]', '[]', ?)",
  ).run(id, name, lastSynced);
}

function addScenario(id: string, status: string, priority = "should"): void {
  db.prepare(
    "INSERT INTO quality_scenarios (id, name, category, scenario, expected, priority, status) VALUES (?, ?, 'security', 's', 'e', ?, ?)",
  ).run(id, `Scenario ${id}`, priority, status);
}

function addDrift(kind: string, severity: string, block: string | null): void {
  db.prepare(
    "INSERT INTO drift_log (detected_at, kind, severity, description, affected_block) VALUES (?, ?, ?, 'd', ?)",
  ).run(NOW, kind, severity, block);
}

describe("collectReportData — architecture health", () => {
  it("summarizes blocks, drift, scenarios and plan progress", () => {
    addBlock("core", "Core", "2026-07-20T12:00:00.000Z"); // 5 days stale
    addBlock("cli", "CLI", null); // never synced
    addScenario("SEC-01", "passing", "must");
    addScenario("SEC-02", "failing", "must");
    addScenario("PERF-01", "untested");
    addDrift("undocumented_module", "warning", "core");
    addDrift("dependency_violation", "error", "core");
    db.prepare("INSERT INTO phases (id, name, phase_number, status, description) VALUES ('p0','Setup',0,'complete','d')").run();
    db.prepare("INSERT INTO phases (id, name, phase_number, status, description) VALUES ('p1','Build',1,'in-progress','d')").run();
    for (const [id, status] of [["t1", "done"], ["t2", "blocked"], ["t3", "cancelled"]] as const) {
      db.prepare(
        "INSERT INTO tasks (id, phase_id, title, status, quality_scenarios, acceptance_criteria, created_at) VALUES (?, 'p0', 't', ?, '[]', '[]', ?)",
      ).run(id, status, NOW);
    }

    const d = collectReportData(db, NOW).architecture;

    expect(d.blocks.total).toBe(2);
    // Never-synced sorts first, then oldest
    expect(d.blocks.stale[0].id).toBe("cli");
    expect(d.blocks.stale[0].ageDays).toBeNull();
    expect(d.blocks.stale[1].ageDays).toBe(5);

    expect(d.drift.total).toBe(2);
    expect(d.drift.bySeverity.error).toBe(1);
    expect(d.drift.bySeverity.info).toBe(0); // defaulted, not missing
    expect(d.drift.byBlock[0]).toEqual({ block: "core", count: 2 });

    expect(d.scenarios.total).toBe(3);
    // 1 passing of 2 checked (untested excluded from the rate)
    expect(d.scenarios.passRate).toBe(50);
    expect(d.scenarios.failingMust.map((s) => s.id)).toEqual(["SEC-02"]);

    expect(d.plan.phases).toEqual({ total: 2, complete: 1 });
    expect(d.plan.tasks).toEqual({ total: 3, done: 1, blocked: 1, cancelled: 1 });
  });

  it("reports an unmeasured pass rate when nothing is checked", () => {
    addScenario("A", "untested");
    expect(collectReportData(db, NOW).architecture.scenarios.passRate).toBeNull();
  });

  it("labels drift with no affected block as unassigned", () => {
    addDrift("new_dependency", "info", null);
    expect(collectReportData(db, NOW).architecture.drift.byBlock[0].block).toBe("(unassigned)");
  });
});

describe("collectReportData — agent activity", () => {
  function addActivity(fields: Record<string, unknown>): void {
    const row: Record<string, unknown> = {
      tool_name: "arcbridge_check_drift",
      model: "claude-x",
      agent_role: "implementer",
      total_tokens: 100,
      cost_usd: 0.01,
      duration_ms: 500,
      recorded_at: NOW,
      ...fields,
    };
    const cols = Object.keys(row);
    db.prepare(
      `INSERT INTO agent_activity (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`,
    ).run(...cols.map((c) => row[c] as never));
  }

  it("flags no data when the telemetry table is empty", () => {
    const a = collectReportData(db, NOW).activity;
    expect(a.hasData).toBe(false);
    expect(a.totals.activities).toBe(0);
    expect(a.byModel).toEqual([]);
  });

  it("aggregates totals and groups once activity exists", () => {
    addActivity({});
    addActivity({ model: "gpt-y", total_tokens: 200, cost_usd: 0.02, drift_count: 3, drift_errors: 1 });

    const a = collectReportData(db, NOW).activity;
    expect(a.hasData).toBe(true);
    expect(a.totals.activities).toBe(2);
    expect(a.totals.tokens).toBe(300);
    expect(a.totals.costUsd).toBeCloseTo(0.03, 5);
    expect(a.byModel.map((m) => m.key).sort()).toEqual(["claude-x", "gpt-y"]);
    expect(a.byDay[0].day).toBe("2026-07-25");
    // Only rows carrying a quality snapshot appear in the trend
    expect(a.qualityTrend).toHaveLength(1);
    expect(a.qualityTrend[0].driftCount).toBe(3);
  });
});

describe("renderReportHtml", () => {
  it("produces a self-contained document with both sections", () => {
    addBlock("core", "Core", NOW);
    addScenario("SEC-01", "passing");
    const html = renderReportHtml(collectReportData(db, NOW));

    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("Architecture health");
    expect(html).toContain("Agent activity");
    // No external assets or scripts — safe to open from disk / attach to CI
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/https?:\/\/[^"']+\.(css|js)/i);
    // Empty telemetry renders guidance, not a blank panel
    expect(html).toContain("No activity recorded yet");
    expect(html).toContain("auto_record: true");
  });

  it("escapes values that would otherwise inject markup", () => {
    addBlock("x", '<img src=x onerror="alert(1)">', null);
    const html = renderReportHtml(collectReportData(db, NOW));
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });

  it("esc() escapes all HTML-significant characters", () => {
    expect(esc(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
    expect(esc(null)).toBe("");
  });
});
