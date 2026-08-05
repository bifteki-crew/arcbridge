import type { FixtureResult, QuestionResult } from "./token-proxy.js";

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const m = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.round(m * 10) / 10;
}

function allQuestions(results: FixtureResult[]): QuestionResult[] {
  return results.flatMap((r) => r.questions);
}

function medianForKind(
  results: FixtureResult[],
  kind: QuestionResult["kind"],
  memberKind?: "fixture" | "live",
): number | null {
  return median(
    allQuestions(results)
      .filter(
        (q) =>
          q.kind === kind &&
          q.savingPct !== null &&
          (memberKind === undefined || q.memberKind === memberKind),
      )
      .map((q) => q.savingPct as number),
  );
}

/** How many questions of a kind actually produced a saving figure. */
function sampleSize(
  results: FixtureResult[],
  kind: QuestionResult["kind"],
  memberKind: "fixture" | "live",
): number {
  return results
    .filter((r) => r.memberKind === memberKind)
    .flatMap((r) => r.questions)
    .filter((q) => q.kind === kind && q.savingPct !== null).length;
}

const KIND_LABELS: [QuestionResult["kind"], string][] = [
  ["structure", "Structure / navigation"],
  ["block", "Module (block) detail"],
  ["symbol", "Single symbol"],
  ["route", "API route map"],
  ["component", "Component graph"],
  ["contract", "Cross-service contract check"],
];

/** Median rows for one member class, or null when that class has no members. */
function medianTable(results: FixtureResult[], memberKind: "fixture" | "live"): string | null {
  if (!results.some((r) => r.memberKind === memberKind)) return null;
  const rows: string[] = [];
  for (const [kind, label] of KIND_LABELS) {
    const n = sampleSize(results, kind, memberKind);
    if (n === 0) continue;
    // Sample size is shown because several of these kinds are answered by a
    // single member today — a "median" of one observation is a data point, and
    // presenting it like an average over many would overstate it.
    rows.push(`| ${label} | ${fmt(medianForKind(results, kind, memberKind))} | ${n} |`);
  }
  return rows.length > 0 ? rows.join("\n") : null;
}

function fmt(n: number | null): string {
  return n === null ? "n/a" : `${n}%`;
}

/** A GitHub-flavored markdown report suitable for pasting into the README. */
export function renderMarkdown(results: FixtureResult[], generatedAt: string): string {
  const lines: string[] = [
    "# ArcBridge token-savings report",
    "",
    `Generated: ${generatedAt}`,
    "",
    "Deterministic token proxy (F0). For each question it compares the tokens in",
    "ArcBridge's tool response against the tokens in the source files an agent would",
    "otherwise read to answer the same question. Token counts use a real BPE",
    "tokenizer (`gpt-tokenizer`, cl100k_base). Not a live-agent eval — see the",
    "package README for methodology and limits.",
    "",
  ];

  const liveTable = medianTable(results, "live");
  const fixtureTable = medianTable(results, "fixture");
  lines.push(
    "## Headline — real repositories",
    "",
    "Measured on corpus members that are real repositories with realistic file sizes.",
    "**These are the numbers to quote.**",
    "",
    "| Question type | Median saving | n |",
    "|---|--:|--:|",
    liveTable ?? "| _(no live members)_ | n/a | 0 |",
    "",
    "### How to read these, including where they flatter",
    "",
    "- **Structure is an upper bound.** Its baseline is *every indexed file* — what",
    "  answering with no map at all would cost. A real agent would skim a README and",
    "  a directory listing first, so treat this as the ceiling, not the expectation.",
    "- **The targeted questions are the defensible claim.** Module, symbol, route and",
    "  component all compare against the specific files that genuinely answer them.",
    "- **The contract check reports a NEGATIVE result.** On a clean repository",
    "  `check_drift` answers \"no drift detected\" in a few tokens, while the baseline",
    "  reads both sides of the boundary. The saving is therefore the cost of",
    "  *verifying* that a frontend and backend still agree — real work, but it is",
    "  measuring a cheap \"all clear\", not a rich answer. Do not quote it as a",
    "  headline; it is the least comparable number in this table.",
    "- **Quality constraints have no baseline at all** and are excluded from the",
    "  medians. That information does not exist in source code, so no set of files",
    "  answers the question — an infinite saving against zero would be meaningless.",
    "  It appears in the per-repository tables as `n/a`.",
    "- **`n` is the number of observations.** Several kinds are answered by a single",
    "  corpus member today; a median of one is a data point, not an average.",
    "",
    "## Small fixtures (scale caveat — not representative)",
    "",
    "The pinned fixtures are a few files each (baselines under 1k tokens), kept for",
    "fast functional coverage. At that scale a rich tool response can exceed simply",
    "reading the file, so **single-symbol savings go negative here**. That is a",
    "fixture-size artifact, not a regression — the same question on a real repo is",
    "strongly positive (see above). Reported for transparency, not as a claim.",
    "",
    "| Question type | Median saving | n |",
    "|---|--:|--:|",
    fixtureTable ?? "| _(no fixtures)_ | n/a | 0 |",
    "",
  );

  for (const fixture of results) {
    lines.push(`## ${fixture.memberKind === "live" ? "Repository" : "Fixture"}: \`${fixture.fixture}\``, "");

    lines.push(
      fixture.memberKind === "live"
        ? "Pipeline (existing model, drift --reindex only — adopt is never run on a live repo):"
        : "Pipeline (init → adopt → drift --reindex):",
      "",
    );
    for (const step of fixture.steps) {
      const status = step.ok ? "ok" : `exit ${step.code}`;
      lines.push(`- \`${step.cmd}\` — ${status}`);
    }
    lines.push("");

    lines.push(
      "| Question | Tool | Baseline files | Baseline tokens | ArcBridge tokens | Saving |",
      "|---|---|--:|--:|--:|--:|",
    );
    for (const q of fixture.questions) {
      const saving = q.savingPct === null ? (q.note ? `n/a (${q.note})` : "n/a") : `${q.savingPct}%`;
      lines.push(
        `| ${q.label} | \`${q.tool}\` | ${q.baselineFiles} | ${q.baselineTokens} | ${q.arcbridgeTokens} | ${saving} |`,
      );
    }
    lines.push("");
  }

  lines.push(
    "## Interpretation",
    "",
    "- **Targeted questions are where the real saving is.** On a real repository, asking",
    "  about one module or one symbol costs ~1k tokens through ArcBridge versus tens or",
    "  hundreds of thousands to read the relevant code. That is the defensible claim.",
    "- **Treat the structure/navigation figure as an upper bound.** Its baseline is",
    "  \"read every indexed file\", which is the worst case rather than typical agent",
    "  behaviour — a real agent would skim a README or list directories first. The",
    "  ratio is real, but don't read 99% as a typical session saving.",
    "- **The single-symbol case inverts with scale, and that is the headline correction.**",
    "  `query_symbols` returns the source snippet *plus* signature, caller/callee graph",
    "  and owning block. Against a 2-line fixture file that is more tokens than just",
    "  reading it (hence the negative fixture number); against a real symbol referenced",
    "  across ~18 files it wins by ~98%. Same code, opposite verdict — which is exactly",
    "  why the corpus needed a real repository.",
    "- **Known blind spot in the live member.** ArcBridge's own repo is a TypeScript",
    "  monorepo of libraries and a CLI — not the application shape ArcBridge targets. It",
    "  never exercises routes, components or cross-service DTOs, so it validates",
    "  magnitude but not shape. A purpose-built fullstack example is the next corpus",
    "  addition.",
    "- Quality-scenario / intent questions are intentionally excluded: that knowledge is",
    "  not present in the code at all, so there is no fair token baseline to compare against",
    "  (and it's context ArcBridge provides that file-reading simply cannot).",
    "",
    "### Methodology",
    "",
    "- Token counts use a real BPE tokenizer (`gpt-tokenizer`, cl100k_base).",
    "- Baselines: *structure* = all source files; *block* = files under the block's code",
    "  paths; *symbol* = files that mention the symbol name (grep-then-read).",
    "- Deterministic (no live model). The multi-step live-agent eval is a separate,",
    "  periodic/manual measurement, not part of this proxy.",
    "",
  );

  return lines.join("\n");
}

/** A compact console summary for local runs and CI logs. */
export function renderConsole(results: FixtureResult[]): string {
  const lines: string[] = [];
  const failedSteps = results.flatMap((r) =>
    r.steps.filter((s) => !s.ok).map((s) => `  ${r.fixture}: ${s.cmd} → exit ${s.code}`),
  );

  lines.push("ArcBridge token-savings proxy (median by question type)");
  for (const kind of ["live", "fixture"] as const) {
    if (!results.some((r) => r.memberKind === kind)) continue;
    lines.push(`  ${kind === "live" ? "real repos" : "fixtures (scale caveat)"}:`);
    lines.push(`    structure: ${fmt(medianForKind(results, "structure", kind))}`);
    lines.push(`    block:     ${fmt(medianForKind(results, "block", kind))}`);
    lines.push(`    symbol:    ${fmt(medianForKind(results, "symbol", kind))}`);
  }
  for (const r of results) {
    for (const q of r.questions) {
      const s = q.savingPct === null ? (q.note ?? "n/a") : `${q.savingPct}%`;
      lines.push(`  ${r.fixture}/${q.questionId}: ${q.baselineTokens} → ${q.arcbridgeTokens} tok (${s})`);
    }
  }
  if (failedSteps.length) {
    lines.push("  non-zero pipeline steps (inspect — may be real blockers):");
    lines.push(...failedSteps);
  }
  return lines.join("\n");
}
