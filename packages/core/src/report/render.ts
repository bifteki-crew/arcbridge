import type { ReportData, ActivitySummary, ArchitectureHealth } from "./collect.js";

/** Escape text for safe interpolation into HTML. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function num(n: number): string {
  return n.toLocaleString("en-US");
}

/** Horizontal bar row — inline SVG keeps the report dependency-free. */
function bars(rows: { label: string; value: number; tone?: string }[]): string {
  if (rows.length === 0) return `<p class="empty">None.</p>`;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return `<div class="bars">${rows
    .map((r) => {
      const pct = Math.round((r.value / max) * 100);
      return `<div class="bar-row"><span class="bar-label">${esc(r.label)}</span>` +
        `<span class="bar-track"><span class="bar-fill ${r.tone ?? ""}" style="width:${pct}%"></span></span>` +
        `<span class="bar-value">${num(r.value)}</span></div>`;
    })
    .join("")}</div>`;
}

function statCard(label: string, value: string, tone = ""): string {
  return `<div class="stat ${tone}"><div class="stat-value">${esc(value)}</div><div class="stat-label">${esc(label)}</div></div>`;
}

function architectureSection(a: ArchitectureHealth): string {
  const { drift, scenarios, plan, blocks } = a;
  const driftTone = drift.bySeverity.error > 0 ? "bad" : drift.total > 0 ? "warn" : "good";

  const cards = [
    statCard("Building blocks", num(blocks.total)),
    statCard(
      "Open drift",
      drift.total === 0 ? "none" : `${num(drift.total)} (${num(drift.bySeverity.error ?? 0)} error)`,
      driftTone,
    ),
    statCard(
      "Scenario pass rate",
      scenarios.passRate === null ? "not measured" : `${scenarios.passRate}%`,
      scenarios.passRate === null ? "" : scenarios.passRate >= 100 ? "good" : scenarios.passRate >= 50 ? "warn" : "bad",
    ),
    statCard(
      "Phases complete",
      `${num(plan.phases.complete)} / ${num(plan.phases.total)}`,
    ),
    statCard(
      "Tasks done",
      `${num(plan.tasks.done)} / ${num(plan.tasks.total - plan.tasks.cancelled)}`,
      plan.tasks.blocked > 0 ? "warn" : "",
    ),
  ].join("");

  const staleRows = blocks.stale.slice(0, 12).map((b) => ({
    label: `${b.name}${b.lastSynced ? "" : " (never synced)"}`,
    value: b.ageDays ?? 0,
    tone: (b.ageDays ?? 999) > 7 || b.lastSynced === null ? "warn" : "good",
  }));

  const failingMust =
    scenarios.failingMust.length === 0
      ? ""
      : `<div class="callout bad"><strong>${scenarios.failingMust.length} must-have scenario(s) failing:</strong> ` +
        scenarios.failingMust.map((s) => `${esc(s.id)} — ${esc(s.name)}`).join("; ") +
        ` — these block phase completion.</div>`;

  return `<section>
  <h2>Architecture health</h2>
  <div class="stats">${cards}</div>
  ${failingMust}
  <div class="grid">
    <div class="panel">
      <h3>Drift by kind</h3>
      ${bars(drift.byKind.map((d) => ({ label: d.kind, value: d.count, tone: "warn" })))}
    </div>
    <div class="panel">
      <h3>Drift by building block</h3>
      ${bars(drift.byBlock.map((d) => ({ label: d.block, value: d.count, tone: "warn" })))}
    </div>
    <div class="panel">
      <h3>Quality scenarios by status</h3>
      ${bars(
        Object.entries(scenarios.byStatus).map(([status, count]) => ({
          label: status,
          value: count,
          tone: status === "passing" ? "good" : status === "failing" ? "bad" : "",
        })),
      )}
    </div>
    <div class="panel">
      <h3>Documentation staleness <span class="hint">days since last sync</span></h3>
      ${bars(staleRows)}
      <p class="note">The convention targets docs within one coding session of the code. Blocks that
      never synced, or drifted past a week, are the ones to re-sync first.</p>
    </div>
  </div>
</section>`;
}

function activitySection(act: ActivitySummary): string {
  if (!act.hasData) {
    return `<section>
  <h2>Agent activity</h2>
  <div class="callout">
    <strong>No activity recorded yet.</strong> This half of the report is built from the
    <code>agent_activity</code> table, which stays empty until an agent calls
    <code>arcbridge_record_activity</code> — or until you enable automatic capture in
    <code>.arcbridge/config.yaml</code>:
    <pre>metrics:
  auto_record: true</pre>
    Architecture health above needs no telemetry and is always current.
  </div>
</section>`;
  }

  const { totals } = act;
  const cards = [
    statCard("Activities", num(totals.activities)),
    statCard("Total tokens", num(totals.tokens)),
    statCard("Total cost", `$${totals.costUsd.toFixed(4)}`),
    statCard("Total duration", `${Math.round(totals.durationMs / 1000)}s`),
  ].join("");

  const trendRows = act.qualityTrend
    .filter((q) => q.driftCount !== null)
    .slice(0, 20)
    .reverse()
    .map((q) => ({
      label: q.recordedAt.slice(0, 16).replace("T", " "),
      value: q.driftCount ?? 0,
      tone: (q.driftErrors ?? 0) > 0 ? "bad" : "warn",
    }));

  return `<section>
  <h2>Agent activity</h2>
  <div class="stats">${cards}</div>
  <div class="grid">
    <div class="panel">
      <h3>Activities by model</h3>
      ${bars(act.byModel.map((m) => ({ label: m.key, value: m.activities })))}
    </div>
    <div class="panel">
      <h3>Activities by agent role</h3>
      ${bars(act.byRole.map((r) => ({ label: r.key, value: r.activities })))}
    </div>
    <div class="panel">
      <h3>Tokens per day</h3>
      ${bars(act.byDay.map((d) => ({ label: d.day, value: d.tokens })))}
    </div>
    <div class="panel">
      <h3>Drift over time <span class="hint">from recorded quality snapshots</span></h3>
      ${bars(trendRows)}
      ${trendRows.length === 0 ? `<p class="note">No quality snapshots recorded yet.</p>` : ""}
    </div>
  </div>
</section>`;
}

const STYLES = `
:root { --fg:#1a1d21; --muted:#6b7280; --line:#e5e7eb; --bg:#fff; --panel:#f9fafb;
        --good:#059669; --warn:#d97706; --bad:#dc2626; --accent:#4f46e5; }
* { box-sizing:border-box; }
body { margin:0; padding:2rem 1.25rem 4rem; font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
       color:var(--fg); background:var(--bg); }
main { max-width:1080px; margin:0 auto; }
h1 { font-size:1.6rem; margin:0 0 .25rem; }
h2 { font-size:1.15rem; margin:2.5rem 0 1rem; padding-bottom:.4rem; border-bottom:1px solid var(--line); }
h3 { font-size:.85rem; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); margin:0 0 .75rem; }
.sub { color:var(--muted); margin:0 0 .5rem; font-size:.9rem; }
.stats { display:flex; flex-wrap:wrap; gap:.75rem; }
.stat { flex:1 1 150px; padding:.85rem 1rem; background:var(--panel); border:1px solid var(--line); border-radius:8px; }
.stat-value { font-size:1.35rem; font-weight:600; }
.stat-label { font-size:.8rem; color:var(--muted); margin-top:.15rem; }
.stat.good .stat-value { color:var(--good); } .stat.warn .stat-value { color:var(--warn); } .stat.bad .stat-value { color:var(--bad); }
.grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:1rem; margin-top:1rem; }
.panel { padding:1rem; border:1px solid var(--line); border-radius:8px; }
.bars { display:flex; flex-direction:column; gap:.35rem; }
.bar-row { display:grid; grid-template-columns:minmax(90px,38%) 1fr auto; align-items:center; gap:.6rem; font-size:.85rem; }
.bar-label { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.bar-track { background:var(--line); border-radius:3px; height:9px; overflow:hidden; }
.bar-fill { display:block; height:100%; background:var(--accent); border-radius:3px; }
.bar-fill.good { background:var(--good); } .bar-fill.warn { background:var(--warn); } .bar-fill.bad { background:var(--bad); }
.bar-value { font-variant-numeric:tabular-nums; color:var(--muted); }
.callout { margin:1rem 0; padding:.85rem 1rem; background:var(--panel); border-left:3px solid var(--accent); border-radius:4px; font-size:.9rem; }
.callout.bad { border-left-color:var(--bad); }
.callout pre { margin:.5rem 0 0; font-size:.85rem; }
.note { margin:.75rem 0 0; font-size:.8rem; color:var(--muted); }
.hint { font-weight:400; text-transform:none; letter-spacing:0; }
.empty { color:var(--muted); font-size:.85rem; margin:0; }
code { background:var(--panel); padding:.1rem .3rem; border-radius:3px; font-size:.9em; }
footer { margin-top:3rem; padding-top:1rem; border-top:1px solid var(--line); color:var(--muted); font-size:.8rem; }
@media (prefers-color-scheme: dark) {
  :root { --fg:#e5e7eb; --muted:#9ca3af; --line:#374151; --bg:#111418; --panel:#1a1f26; --accent:#818cf8; }
}
`;

/** Render the report as a single self-contained HTML document (no external assets). */
export function renderReportHtml(data: ReportData): string {
  const title = data.projectName ? `${data.projectName} — ArcBridge report` : "ArcBridge report";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>${STYLES}</style>
</head>
<body>
<main>
  <h1>${esc(title)}</h1>
  <p class="sub">Generated ${esc(data.generatedAt)} · architecture health from the committed
  <code>.arcbridge/</code> model and the latest drift run; agent activity from recorded telemetry.</p>
  ${architectureSection(data.architecture)}
  ${activitySection(data.activity)}
  <footer>Produced by <code>arcbridge report</code>. Regenerate any time — this file is derived output.</footer>
</main>
</body>
</html>
`;
}
