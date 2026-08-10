import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ARMS, prepareRunTree, type Arm, type ArmId } from "./arms.js";
import { measureCompletion, measureDrift, type Completion, type DriftSummary } from "./measure.js";

/**
 * Token usage as the CLI actually reports it.
 *
 * `inputTokens` alone is close to meaningless here — a session that read 18k
 * tokens of cached context reports 2 input tokens. Cache behaviour also differs
 * systematically between the arms (small tool responses versus large file reads),
 * so the comparable figures are the FULL total and the cost, both kept whole.
 */
export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  /** Everything the model processed or produced. The honest "tokens to complete". */
  totalTokens: number;
  costUsd: number;
  turns: number;
  /**
   * Tool calls by name. Without this, an "ArcBridge arm" that ignored the tools
   * would be indistinguishable from one that used them — which would silently
   * invalidate the whole comparison.
   */
  toolCalls: Record<string, number>;
  /** Calls to any arcbridge_* MCP tool. Zero here means the arm was a no-op. */
  arcbridgeToolCalls: number;
}

export interface RunResult {
  arm: ArmId;
  armLabel: string;
  run: number;
  ok: boolean;
  error?: string;
  usage: Usage;
  completion: Completion;
  drift: DriftSummary;
  durationMs: number;
}

export interface RunOptions {
  subjectRepo: string;
  model: string;
  maxTurns: number;
  /** Keep the produced trees for inspection instead of deleting them. */
  keepTrees?: boolean;
}

/** One arm, one repetition. */
export async function runOnce(arm: Arm, run: number, opts: RunOptions): Promise<RunResult> {
  const runRoot = mkdtempSync(join(tmpdir(), `arcbridge-loop-${arm.id}-${run}-`));
  const started = Date.now();
  try {
    prepareRunTree(opts.subjectRepo, runRoot);
    arm.prepare(runRoot);

    const promptFile = join(runRoot, ".bench-prompt.txt");
    writeFileSync(promptFile, arm.prompt(), "utf-8");

    const args = [
      "-p",
      arm.prompt(),
      // stream-json (which requires --verbose) is the only format that exposes
      // individual tool_use events; the closing result event still carries the
      // same usage and cost as plain json.
      "--output-format",
      "stream-json",
      "--verbose",
      "--model",
      opts.model,
      "--max-turns",
      String(opts.maxTurns),
      // The tree is a throwaway copy, so unattended editing is safe here. Without
      // this the run would stall on a permission prompt nobody can answer.
      "--dangerously-skip-permissions",
      ...arm.cliArgs(runRoot),
    ];

    const raw = execFileSync("claude", args, {
      cwd: runRoot,
      encoding: "utf-8",
      maxBuffer: 128 * 1024 * 1024,
      timeout: 30 * 60_000,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const usage = parseUsage(raw);
    // Remove the harness's own artifacts before measuring, so they cannot be
    // mistaken for the agent's work — unless the tree is being kept for
    // inspection, where the exact prompt and MCP wiring that produced it are the
    // first things anyone debugging will want. Neither file is inside a measured
    // path, so keeping them cannot affect the result.
    if (!opts.keepTrees) {
      rmSync(promptFile, { force: true });
      rmSync(join(runRoot, ".bench-mcp.json"), { force: true });
    }

    const completion = measureCompletion(runRoot);
    const drift = measureDrift(runRoot, opts.subjectRepo);

    return {
      arm: arm.id,
      armLabel: arm.label,
      run,
      ok: true,
      usage,
      completion,
      drift,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    return {
      arm: arm.id,
      armLabel: arm.label,
      run,
      ok: false,
      error: err instanceof Error ? err.message.slice(0, 400) : String(err),
      usage: emptyUsage(),
      completion: { built: false, buildDetail: "run failed", artifacts: [], complete: false },
      drift: { total: 0, errors: 0, warnings: 0, byKind: {} },
      durationMs: Date.now() - started,
    };
  } finally {
    if (opts.keepTrees) {
      console.error(`  [kept] ${arm.id} run ${run}: ${runRoot}`);
    } else {
      rmSync(runRoot, { recursive: true, force: true });
    }
  }
}

interface ResultEvent {
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  total_cost_usd?: number;
  num_turns?: number;
  is_error?: boolean;
  result?: string;
}

function parseUsage(raw: string): Usage {
  const toolCalls: Record<string, number> = {};
  let result: ResultEvent | null = null;

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue; // a partial line is not worth failing the run over
    }
    if (event.type === "assistant") {
      const message = event.message as { content?: { type?: string; name?: string }[] } | undefined;
      for (const block of message?.content ?? []) {
        if (block.type === "tool_use" && block.name) {
          toolCalls[block.name] = (toolCalls[block.name] ?? 0) + 1;
        }
      }
    }
    if (event.type === "result") result = event as ResultEvent;
  }

  if (!result) throw new Error(`No result event in agent output: ${raw.slice(0, 200)}`);
  if (result.is_error) {
    throw new Error(`Agent reported an error: ${String(result.result).slice(0, 200)}`);
  }

  const u = result.usage ?? {};
  const inputTokens = u.input_tokens ?? 0;
  const outputTokens = u.output_tokens ?? 0;
  const cacheCreationTokens = u.cache_creation_input_tokens ?? 0;
  const cacheReadTokens = u.cache_read_input_tokens ?? 0;
  const arcbridgeToolCalls = Object.entries(toolCalls)
    .filter(([name]) => name.includes("arcbridge"))
    .reduce((sum, [, n]) => sum + n, 0);

  return {
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    totalTokens: inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens,
    costUsd: result.total_cost_usd ?? 0,
    turns: result.num_turns ?? 0,
    toolCalls,
    arcbridgeToolCalls,
  };
}

function emptyUsage(): Usage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    turns: 0,
    toolCalls: {},
    arcbridgeToolCalls: 0,
  };
}

/** Every arm, `repeats` times each. Interleaved so a drifting service affects both arms alike. */
export async function runSuite(repeats: number, opts: RunOptions): Promise<RunResult[]> {
  const results: RunResult[] = [];
  for (let run = 1; run <= repeats; run++) {
    for (const arm of ARMS) {
      console.error(`  running ${arm.id} (${run}/${repeats})…`);
      const r = await runOnce(arm, run, opts);
      console.error(
        r.ok
          ? `    done: complete=${r.completion.complete} drift=${r.drift.total} ` +
              `tokens=${r.usage.totalTokens.toLocaleString()} cost=$${r.usage.costUsd.toFixed(2)} ` +
              `arcbridgeTools=${r.usage.arcbridgeToolCalls}`
          : `    FAILED: ${r.error}`,
      );
      results.push(r);
    }
  }
  return results;
}
