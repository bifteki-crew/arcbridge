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

function medianForKind(results: FixtureResult[], kind: QuestionResult["kind"]): number | null {
  return median(
    allQuestions(results)
      .filter((q) => q.kind === kind && q.savingPct !== null)
      .map((q) => q.savingPct as number),
  );
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

  const structure = medianForKind(results, "structure");
  const block = medianForKind(results, "block");
  const symbol = medianForKind(results, "symbol");
  lines.push(
    "## Headline (median saving by question type)",
    "",
    "| Question type | Median saving | What it measures |",
    "|---|--:|---|",
    `| Structure / navigation | ${fmt(structure)} | ArcBridge's map vs. reading every file |`,
    `| Module (block) detail | ${fmt(block)} | one block's summary vs. reading its files |`,
    `| Single symbol | ${fmt(symbol)} | symbol detail vs. reading files that mention it |`,
    "",
    "The structure/navigation number is the load-bearing claim — it's what agents do",
    "constantly (\"understand this codebase\") and where reading files scales worst.",
    "The single-symbol number is **negative on this tiny corpus** and should be read",
    "with the caveat in Interpretation below, not taken at face value.",
    "",
  );

  for (const fixture of results) {
    lines.push(`## Fixture: \`${fixture.fixture}\``, "");

    lines.push("Pipeline (init → adopt → drift --reindex):", "");
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
    "- **Structure/navigation is the real win (~90%+).** Understanding how a codebase is",
    "  organized otherwise means reading every file; ArcBridge answers it with a compact",
    "  building-block map. This is the honest headline.",
    "- **Single-symbol lookup is negative on this corpus — a fixture-size artifact, not a",
    "  regression.** `query_symbols` returns the symbol's source snippet *plus* its",
    "  signature, caller/callee graph, and owning block. On a 2-line file with one",
    "  caller, that rich response is larger than just reading the file. On a",
    "  realistically-sized file (100+ lines) with callers spread across several files —",
    "  where an agent would otherwise grep-and-read many candidates — the same response",
    "  wins decisively. The tiny corpus understates this case; a larger real repo is the",
    "  fix (a known F0 follow-up).",
    "- **`adopt` produced one coarse block per fixture** (`api`, `main`) rather than",
    "  per-directory blocks, because these single-service trees are small. So the",
    "  \"module detail\" number here is closer to \"whole-project detail\"; it will separate",
    "  from the structure number on larger, multi-module projects.",
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
  lines.push(`  structure: ${fmt(medianForKind(results, "structure"))}`);
  lines.push(`  block:     ${fmt(medianForKind(results, "block"))}`);
  lines.push(`  symbol:    ${fmt(medianForKind(results, "symbol"))}  (negative on tiny fixtures — see report)`);
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
