// Parses `arcbridge drift --json` output for the composite action: writes the
// job summary and the sticky-comment body, emits counts as step outputs, and
// decides pass/fail against the severity threshold. Never throws for drift
// findings — the final action step enforces the verdict so the PR comment is
// posted before the job fails.
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";

const MARKER = "<!-- arcbridge-drift -->";
const RANK = { info: 1, warning: 2, error: 3 };
const MAX_ROWS = 50;

const jsonPath = process.env.DRIFT_JSON;
const logPath = process.env.DRIFT_LOG;
const exitCode = process.env.DRIFT_EXIT ?? "unknown";
const threshold = (process.env.SEVERITY_THRESHOLD ?? "error").toLowerCase();

if (!(threshold in RANK)) {
  fail(`Invalid severity-threshold "${threshold}" — use error, warning, or info.`);
}

let entries;
try {
  const parsed = JSON.parse(readFileSync(jsonPath, "utf-8"));
  if (!Array.isArray(parsed.drift)) throw new Error("missing `drift` array");
  entries = parsed.drift;
} catch (err) {
  // Not a drift verdict — the CLI itself failed (bad install, no .arcbridge/, …)
  let log = "";
  try {
    log = readFileSync(logPath, "utf-8").trim().split("\n").slice(-15).join("\n");
  } catch {
    /* no log */
  }
  const msg = [
    `${MARKER}`,
    "## ArcBridge drift check — could not run",
    "",
    `\`arcbridge drift\` exited with code ${exitCode} and did not produce a JSON verdict (${err.message}).`,
    "",
    "Last lines of stderr:",
    "```",
    log || "(empty)",
    "```",
    "",
    "Is `.arcbridge/` committed in this repository? See https://github.com/bifteki-crew/arcbridge",
  ].join("\n");
  writeArtifacts(msg);
  setOutputs({ error: 0, warning: 0, info: 0 });
  fail(`arcbridge drift did not produce a verdict (exit ${exitCode}).`);
}

const counts = { error: 0, warning: 0, info: 0 };
for (const e of entries) counts[e.severity] = (counts[e.severity] ?? 0) + 1;

const failing = entries.filter((e) => (RANK[e.severity] ?? 0) >= RANK[threshold]);

const lines = [MARKER, "## ArcBridge drift check", ""];
if (entries.length === 0) {
  lines.push("✅ **No drift detected** — code matches the committed architecture model.");
} else {
  const badge = failing.length > 0 ? "❌" : "⚠️";
  lines.push(
    `${badge} **${entries.length} drift finding(s)** — ${counts.error} error / ${counts.warning} warning / ${counts.info} info (threshold: \`${threshold}\`).`,
    "",
    "| Severity | Kind | Description | Block | File |",
    "|---|---|---|---|---|",
  );
  for (const e of entries.slice(0, MAX_ROWS)) {
    const cell = (v) => String(v ?? "—").replaceAll("|", "\\|").replaceAll("\n", " ");
    lines.push(
      `| ${cell(e.severity)} | ${cell(e.kind)} | ${cell(e.description)} | ${cell(e.affectedBlock)} | ${cell(e.affectedFile)} |`,
    );
  }
  if (entries.length > MAX_ROWS) {
    lines.push("", `_…and ${entries.length - MAX_ROWS} more (see the job summary/logs)._`);
  }
  lines.push(
    "",
    "Resolve drift by updating `.arcbridge/arc42/05-building-blocks.yaml` (or run `arcbridge adopt`), then re-run.",
  );
}
writeArtifacts(lines.join("\n"));
setOutputs(counts);

if (failing.length > 0) {
  fail(`${failing.length} drift finding(s) at or above severity "${threshold}".`);
} else {
  appendFileSync(process.env.GITHUB_OUTPUT, "fail=false\n");
}

function writeArtifacts(markdown) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + "\n");
  if (process.env.COMMENT_FILE) writeFileSync(process.env.COMMENT_FILE, markdown + "\n");
}

function setOutputs(c) {
  const out = [
    `error-count=${c.error}`,
    `warning-count=${c.warning}`,
    `info-count=${c.info}`,
    `total-count=${c.error + c.warning + c.info}`,
  ].join("\n");
  appendFileSync(process.env.GITHUB_OUTPUT, out + "\n");
}

function fail(reason) {
  appendFileSync(process.env.GITHUB_OUTPUT, `fail=true\nfail-reason=${reason}\n`);
  process.exit(0); // verdict is enforced by the final action step, after the comment posts
}
