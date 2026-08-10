import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { repoRoot } from "./paths.js";
import { runSuite, type RunResult } from "./autonomous/runner.js";
import { renderLoopReport } from "./autonomous/report.js";

/**
 * F1 Part B — the multi-step autonomous benchmark.
 *
 * A live model performs the same multi-step change twice: once with ArcBridge's
 * model and tools, once on a copy where they have been removed. Both are then
 * measured against the SAME committed architecture.
 *
 * Deliberately not part of `pnpm test` or CI. It costs real money, it is not
 * deterministic, and a nondeterministic gate is worse than no gate.
 */
const DEFAULTS = {
  repeats: Number(process.env.ARCBRIDGE_LOOP_REPEATS ?? 3),
  model: process.env.ARCBRIDGE_LOOP_MODEL ?? "claude-sonnet-5",
  maxTurns: Number(process.env.ARCBRIDGE_LOOP_MAX_TURNS ?? 60),
};

function subjectRepo(): string {
  return (
    process.env.ARCBRIDGE_BENCH_FULLSTACK ??
    resolve(repoRoot, "..", "arcbridge-example-fullstack")
  );
}

function preflight(subject: string): string[] {
  const problems: string[] = [];
  try {
    execFileSync("claude", ["--version"], { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    problems.push("the `claude` CLI is not on PATH — this benchmark drives a real agent session");
  }
  if (!existsSync(subject)) {
    problems.push(`subject repository not found at ${subject} (set ARCBRIDGE_BENCH_FULLSTACK)`);
  } else if (!existsSync(join(subject, ".arcbridge"))) {
    problems.push(`${subject} has no committed .arcbridge/ model to measure against`);
  }
  try {
    execFileSync("dotnet", ["--version"], { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    problems.push("the .NET SDK is not installed — the completion check builds the API");
  }
  return problems;
}

async function main(): Promise<void> {
  const subject = subjectRepo();
  const problems = preflight(subject);
  if (problems.length > 0) {
    console.error("Cannot run the autonomous benchmark:");
    for (const p of problems) console.error(`  - ${p}`);
    process.exitCode = 1;
    return;
  }

  const cliVersion = execFileSync("claude", ["--version"], { encoding: "utf-8" }).trim();
  console.error(
    `Autonomous loop benchmark — model=${DEFAULTS.model} repeats=${DEFAULTS.repeats} ` +
      `maxTurns=${DEFAULTS.maxTurns}\n  subject: ${subject}\n  cli: ${cliVersion}`,
  );
  console.error("  NOTE: this spends real tokens on the authenticated account.\n");

  const results: RunResult[] = await runSuite(DEFAULTS.repeats, {
    subjectRepo: subject,
    model: DEFAULTS.model,
    maxTurns: DEFAULTS.maxTurns,
    keepTrees: process.env.ARCBRIDGE_LOOP_KEEP === "1",
  });

  const spent = results.reduce((sum, r) => sum + r.usage.costUsd, 0);
  console.error(`\n  total spend: $${spent.toFixed(2)} across ${results.length} session(s)`);

  const reportsDir = join(repoRoot, "packages", "bench", "reports");
  mkdirSync(reportsDir, { recursive: true });
  const out = join(reportsDir, "autonomous-loop.md");
  writeFileSync(
    out,
    renderLoopReport(results, {
      generatedAt: new Date().toISOString(),
      model: DEFAULTS.model,
      cliVersion,
      repeats: DEFAULTS.repeats,
      maxTurns: DEFAULTS.maxTurns,
      subject,
    }),
    "utf-8",
  );
  console.error(`  report written to ${out}`);
}

await main();
