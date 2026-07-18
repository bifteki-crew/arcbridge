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
  // Even on this early failure: emit the count outputs (downstream consumers
  // must always find them) and write the summary/comment (diagnosable from the
  // PR UI, matching the "summary on every run" contract).
  writeArtifacts(
    [
      MARKER,
      "## ArcBridge drift check — misconfigured",
      "",
      `Invalid \`severity-threshold\` input: \`${threshold}\`. Use \`error\`, \`warning\`, or \`info\`.`,
    ].join("\n"),
  );
  setOutputs({ error: 0, warning: 0, info: 0 });
  fail(`Invalid severity-threshold "${threshold}" — use error, warning, or info.`);
}

let entries;
let baseMeta = null; // present when the CLI ran with --base (PR-incremental mode)
try {
  const parsed = JSON.parse(readFileSync(jsonPath, "utf-8"));
  if (!Array.isArray(parsed.drift)) throw new Error("missing `drift` array");
  entries = parsed.drift;
  if (parsed.base && typeof parsed.base === "object") baseMeta = parsed.base;
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
if (baseMeta) {
  // PR-incremental mode: say what was scoped and what that scoping excluded,
  // so the comment carries the same "nothing dropped silently" guarantee as
  // the CLI footer.
  const excluded = [];
  if (baseMeta.excludedOtherFiles > 0) excluded.push(`${baseMeta.excludedOtherFiles} on unchanged files`);
  if (baseMeta.excludedModelLevel > 0) excluded.push(`${baseMeta.excludedModelLevel} model-level (no single file)`);
  lines.push(
    `_Scoped to files changed since \`${baseMeta.ref}\` (${baseMeta.changedFiles} file(s)).` +
      (excluded.length > 0
        ? ` Excluded: ${excluded.join(" + ")} — run without \`base\` for the full report._`
        : "_"),
    "",
  );
}
if (entries.length === 0) {
  lines.push(
    baseMeta
      ? "✅ **No drift on changed files** — this change matches the committed architecture model."
      : "✅ **No drift detected** — code matches the committed architecture model.",
  );
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
  // GITHUB_OUTPUT entries are line-delimited key=value pairs — a newline in the
  // reason (e.g. from an exception message) would corrupt the file, so flatten.
  const oneLine = String(reason).replace(/\s*\r?\n\s*/g, " ").trim();
  appendFileSync(process.env.GITHUB_OUTPUT, `fail=true\nfail-reason=${oneLine}\n`);
  process.exit(0); // verdict is enforced by the final action step, after the comment posts
}
