import type { RunResult } from "./runner.js";
import type { ArmId } from "./arms.js";

export interface LoopMeta {
  generatedAt: string;
  model: string;
  cliVersion: string;
  repeats: number;
  maxTurns: number;
  subject: string;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

function range(values: number[]): string {
  if (values.length === 0) return "—";
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? fmt(min) : `${fmt(min)}–${fmt(max)}`;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString("en-US") : n.toFixed(2);
}

function forArm(results: RunResult[], arm: ArmId): RunResult[] {
  return results.filter((r) => r.arm === arm && r.ok);
}

export function renderLoopReport(results: RunResult[], meta: LoopMeta): string {
  const arms = [...new Set(results.map((r) => r.arm))] as ArmId[];
  const lines: string[] = [
    "# ArcBridge autonomous-loop benchmark (F1 Part B)",
    "",
    `Generated: ${meta.generatedAt}`,
    "",
    "A live model performs the **same multi-step change** twice: once with ArcBridge's",
    "committed model and MCP tools available, once on a copy where they have been",
    "removed entirely. Both results are then measured against the **same** committed",
    "architecture — the model is the ruler, applied identically; only one arm could",
    "see it while working.",
    "",
    "| Setting | Value |",
    "|---|---|",
    `| Model | \`${meta.model}\` |`,
    `| Agent CLI | ${meta.cliVersion} |`,
    `| Runs per arm | ${meta.repeats} |`,
    `| Turn budget | ${meta.maxTurns} |`,
    `| Subject | \`${meta.subject.split("/").pop()}\` |`,
    "",
    "## Results",
    "",
    "| Arm | Completed | Drift ADDED (median) | Added range | Drift total | Tokens (median) | Cost (median) |",
    "|---|--:|--:|--:|--:|--:|--:|",
  ];

  for (const arm of arms) {
    const rs = forArm(results, arm);
    const label = results.find((r) => r.arm === arm)?.armLabel ?? arm;
    if (rs.length === 0) {
      lines.push(`| ${label} | _all runs failed_ | — | — | — | — |`);
      continue;
    }
    const completed = rs.filter((r) => r.completion.complete).length;
    const added = rs.map((r) => r.drift.added);
    const totals = rs.map((r) => r.drift.total);
    const tokens = rs.map((r) => r.usage.totalTokens);
    const costs = rs.map((r) => r.usage.costUsd);
    lines.push(
      `| ${label} | ${completed}/${rs.length} | ${fmt(median(added) ?? 0)} | ${range(added)} | ` +
        `${fmt(median(totals) ?? 0)} | ${fmt(median(tokens) ?? 0)} | $${(median(costs) ?? 0).toFixed(2)} |`,
    );
  }

  lines.push(
    "",
    "### Drift by kind",
    "",
    "What each arm actually ADDED, net of the drift the subject already had.",
    "",
    "| Arm | Kind | Occurrences (summed across runs) |",
    "|---|---|--:|",
  );
  for (const arm of arms) {
    const rs = forArm(results, arm);
    const summed: Record<string, number> = {};
    for (const r of rs) {
      for (const [kind, n] of Object.entries(r.drift.addedByKind)) {
        summed[kind] = (summed[kind] ?? 0) + n;
      }
    }
    const label = results.find((r) => r.arm === arm)?.armLabel ?? arm;
    const kinds = Object.entries(summed).sort((a, b) => b[1] - a[1]);
    if (kinds.length === 0) {
      lines.push(`| ${label} | _none_ | 0 |`);
      continue;
    }
    for (const [kind, n] of kinds) lines.push(`| ${label} | \`${kind}\` | ${n} |`);
  }

  lines.push("", "## Per-run detail", "");
  lines.push(
    "Published in full rather than as aggregates: with this few runs of a",
    "nondeterministic system, the spread is the finding.",
    "",
    "| Arm | Run | Completed | Built | Drift | Tokens | Cost | Turns | Duration |",
    "|---|--:|--:|--:|--:|--:|--:|--:|--:|",
  );
  for (const r of results) {
    lines.push(
      `| ${r.arm} | ${r.run} | ${r.ok ? (r.completion.complete ? "yes" : "no") : "run failed"} | ` +
        `${r.ok ? (r.completion.built ? "yes" : "no") : "—"} | ${r.ok ? r.drift.total : "—"} | ` +
        `${r.ok ? fmt(r.usage.totalTokens) : "—"} | ${r.ok ? `$${r.usage.costUsd.toFixed(2)}` : "—"} | ` +
        `${r.ok ? r.usage.turns : "—"} | ${Math.round(r.durationMs / 1000)}s |`,
    );
  }

  const failedChecks = results
    .filter((r) => r.ok && !r.completion.complete)
    .flatMap((r) =>
      r.completion.artifacts
        .filter((a) => !a.passed)
        .map((a) => `- ${r.arm} run ${r.run}: missing — ${a.label}`)
        .concat(r.completion.built ? [] : [`- ${r.arm} run ${r.run}: build failed — ${r.completion.buildDetail}`]),
    );
  if (failedChecks.length > 0) {
    lines.push("", "### Incomplete runs", "", ...failedChecks);
  }

  lines.push(
    "",
    "## How to read this, and what it does not show",
    "",
    "- **Read the ADDED column, not the total.** The subject repository has standing",
    "  drift of its own; an arm that changed nothing still reports that floor. Only",
    "  the delta is attributable to the agent.",
    "- **Drift is the point.** Tokens are secondary; the claim being tested is whether",
    "  an agent working unattended stays architecturally coherent. Compare the drift",
    "  columns first, and only compare tokens between runs that actually COMPLETED —",
    "  an arm that gave up early looks cheap for the wrong reason.",
    "- **The treatment is bundled.** The ArcBridge arm has the tools *and* the",
    "  architecture documentation *and* the generated convention. This does not",
    "  isolate which of the three helps. A third arm with the docs present but no",
    "  tools would separate that and is a deliberate future refinement.",
    "- **No drift gate.** The ArcBridge arm is *not* forced to clear drift before",
    "  finishing. Enforcing that would drive its drift to zero by construction and",
    "  measure only the gate's existence. The question here is whether having the map",
    "  makes an agent naturally more coherent.",
    "- **Small n.** A handful of runs of a nondeterministic system. Treat a difference",
    "  smaller than the observed spread as noise, not a result.",
    "- **One task, one repository.** Greenfield additions are where ArcBridge should",
    "  help least, since little existing structure must be respected; a modification",
    "  to existing code is the harder test and is the natural next scenario.",
    "",
  );

  return lines.join("\n");
}
