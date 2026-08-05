import { readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { openDatabase } from "@arcbridge/core";
import { countTokens, sumTokens } from "./tokenizer.js";
import { createDriver } from "./mcp-driver.js";
import { prepFixture, type CliStep } from "./prep.js";
import { CORPUS, type CorpusMember, type Question } from "./corpus.js";

export interface QuestionResult {
  fixture: string;
  /** "live" = a real repo; "fixture" = a small pinned fixture (scale caveat). */
  memberKind: "fixture" | "live";
  questionId: string;
  label: string;
  kind: Question["kind"];
  tool: string;
  arcbridgeTokens: number;
  baselineTokens: number;
  baselineFiles: number;
  /** (baseline - arcbridge) / baseline, in percent. Null when baseline is 0. */
  savingPct: number | null;
  note?: string;
}

export interface FixtureResult {
  fixture: string;
  memberKind: "fixture" | "live";
  steps: CliStep[];
  questions: QuestionResult[];
}

interface SourceFile {
  rel: string;
  content: string;
}

/**
 * The baseline file set: exactly the files ArcBridge indexed, read from the
 * project's own index.db. This is the honest comparison set — it's the code an
 * agent would have to read to answer the same question — and, unlike a
 * hardcoded src/ walk, it works for any project shape: a monorepo's per-package
 * source trees, a Next.js app dir, a .NET project tree.
 */
function listSourceFiles(projectRoot: string): SourceFile[] {
  const dbPath = join(projectRoot, ".arcbridge", "index.db");
  // Fail loudly. An empty baseline is indistinguishable from "no saving to
  // measure" once it reaches the report (baselineTokens=0 renders as n/a), so a
  // broken prep step would quietly look like a legitimate result.
  if (!existsSync(dbPath)) {
    throw new Error(
      `No index at ${dbPath} — prep did not produce an index. ` +
        `Check the drift --reindex step for this member.`,
    );
  }
  const db = openDatabase(dbPath);
  try {
    const rows = db
      .prepare("SELECT DISTINCT file_path FROM symbols ORDER BY file_path")
      .all() as { file_path: string }[];
    if (rows.length === 0) {
      throw new Error(
        `Index at ${dbPath} contains no symbols — nothing was indexed, so any ` +
          `"saving" would be measured against an empty baseline.`,
      );
    }
    const out: SourceFile[] = [];
    for (const { file_path } of rows) {
      // Stored paths are project-relative with forward slashes
      const full = join(projectRoot, ...file_path.split("/"));
      if (!existsSync(full) || statSync(full).isDirectory()) continue;
      out.push({ rel: file_path, content: readFileSync(full, "utf-8") });
    }
    return out;
  } finally {
    db.close();
  }
}

interface YamlBlock {
  id: string;
  code_paths?: string[];
}

/** Read the adopted building blocks straight from YAML (source of truth). */
function readBlocks(projectRoot: string): YamlBlock[] {
  const path = join(projectRoot, ".arcbridge", "arc42", "05-building-blocks.yaml");
  if (!existsSync(path)) return [];
  const doc = parse(readFileSync(path, "utf-8")) as { blocks?: YamlBlock[] };
  return doc.blocks ?? [];
}

/**
 * Strip trailing glob suffixes so a code_path becomes a plain path prefix.
 * code_paths are always forward-slashed, so strip a literal trailing `/`
 * (not `path.sep`, which is `\` on Windows and would escape `$` in a regex).
 */
function normalizePrefix(codePath: string): string {
  return codePath.replace(/\/?\*+$/, "").replace(/\/$/, "");
}

/**
 * Whether `path` is at or under `prefix`, respecting path-segment boundaries so
 * `src/routes` does NOT match `src/routes2`. An empty prefix is the repo root
 * and covers everything (adopt stores a whole-project block's code path as "").
 */
function underPrefix(path: string, prefix: string): boolean {
  if (prefix === "") return true;
  return path === prefix || path.startsWith(prefix + "/");
}

function firstSymbolId(searchOutput: string): string | null {
  const m = searchOutput.match(/\*\*ID:\*\*\s*`([^`]+)`/);
  return m ? m[1] : null;
}

async function runQuestion(
  member: CorpusMember,
  q: Question,
  projectRoot: string,
  files: SourceFile[],
  call: (name: string, args: Record<string, unknown>) => Promise<string>,
): Promise<QuestionResult> {
  const base = {
    fixture: member.name,
    memberKind: member.kind,
    questionId: q.id,
    label: q.label,
    kind: q.kind,
  };

  if (q.kind === "structure") {
    const answer = await call("arcbridge_get_building_blocks", { target_dir: projectRoot });
    const baselineTokens = sumTokens(files.map((f) => f.content));
    const arcbridgeTokens = countTokens(answer);
    return {
      ...base,
      tool: "get_building_blocks",
      arcbridgeTokens,
      baselineTokens,
      baselineFiles: files.length,
      savingPct: pct(baselineTokens, arcbridgeTokens),
    };
  }

  if (q.kind === "block") {
    const target = q.blockPathPrefix!;
    // Pick the block whose code path *covers* the target module (one-way:
    // target is at or under the block's code path), preferring the most
    // specific — the longest such code path — mirroring the drift detector's
    // longest-prefix rule. The match is deliberately not bidirectional: a block
    // scoped to a child of the target (e.g. a single file under src/routes/)
    // must not out-specific the intended module-level block.
    let best: { block: YamlBlock; specificity: number } | null = null;
    for (const b of readBlocks(projectRoot)) {
      for (const cp of b.code_paths ?? []) {
        const p = normalizePrefix(cp);
        if (underPrefix(target, p)) {
          if (!best || p.length > best.specificity) best = { block: b, specificity: p.length };
        }
      }
    }
    if (!best) {
      return { ...base, tool: "get_building_blocks", arcbridgeTokens: 0, baselineTokens: 0, baselineFiles: 0, savingPct: null, note: `no block matched prefix ${target}` };
    }
    const block = best.block;
    const answer = await call("arcbridge_get_building_blocks", { target_dir: projectRoot, block_id: block.id });
    const prefixes = (block.code_paths ?? []).map(normalizePrefix);
    const baseline = files.filter((f) => prefixes.some((p) => underPrefix(f.rel, p)));
    const baselineTokens = sumTokens(baseline.map((f) => f.content));
    const arcbridgeTokens = countTokens(answer);
    return {
      ...base,
      tool: `get_building_blocks(block_id=${block.id})`,
      arcbridgeTokens,
      baselineTokens,
      baselineFiles: baseline.length,
      savingPct: pct(baselineTokens, arcbridgeTokens),
    };
  }

  if (q.kind === "route" || q.kind === "component" || q.kind === "contract") {
    const tool =
      q.kind === "route"
        ? "arcbridge_get_route_map"
        : q.kind === "component"
          ? "arcbridge_get_component_graph"
          : "arcbridge_check_drift";
    const answer = await call(tool, { target_dir: projectRoot });
    const prefixes = (q.baselinePrefixes ?? []).map(normalizePrefix);
    const baseline = files.filter((f) => prefixes.some((p) => underPrefix(f.rel, p)));
    if (baseline.length === 0) {
      return { ...base, tool, arcbridgeTokens: countTokens(answer), baselineTokens: 0, baselineFiles: 0, savingPct: null, note: "no baseline files matched the declared prefixes" };
    }
    const baselineTokens = sumTokens(baseline.map((f) => f.content));
    const arcbridgeTokens = countTokens(answer);
    return {
      ...base,
      tool: tool.replace("arcbridge_", ""),
      arcbridgeTokens,
      baselineTokens,
      baselineFiles: baseline.length,
      savingPct: pct(baselineTokens, arcbridgeTokens),
    };
  }

  if (q.kind === "quality") {
    // Deliberately unmeasured. Quality constraints are not derivable from source
    // code, so there is no set of files an agent could read instead — the honest
    // report is "no baseline exists", not an infinite saving against zero.
    const answer = await call("arcbridge_get_quality_scenarios", {
      target_dir: projectRoot,
      action: "list",
    });
    return {
      ...base,
      tool: "get_quality_scenarios",
      arcbridgeTokens: countTokens(answer),
      baselineTokens: 0,
      baselineFiles: 0,
      savingPct: null,
      note: "no file-reading baseline exists — this information is not in the source",
    };
  }

  // symbol
  const search = await call("arcbridge_query_symbols", { target_dir: projectRoot, query: q.symbolName });
  const symbolId = firstSymbolId(search);
  if (!symbolId) {
    return { ...base, tool: "query_symbols", arcbridgeTokens: 0, baselineTokens: 0, baselineFiles: 0, savingPct: null, note: `symbol ${q.symbolName} not found` };
  }
  const answer = await call("arcbridge_query_symbols", { target_dir: projectRoot, symbol_id: symbolId });
  // Baseline: every source file that mentions the symbol name (grep-then-read).
  const baseline = files.filter((f) => f.content.includes(q.symbolName!));
  const baselineTokens = sumTokens(baseline.map((f) => f.content));
  const arcbridgeTokens = countTokens(answer);
  return {
    ...base,
    tool: "query_symbols(symbol_id)",
    arcbridgeTokens,
    baselineTokens,
    baselineFiles: baseline.length,
    savingPct: pct(baselineTokens, arcbridgeTokens),
  };
}

function pct(baseline: number, arcbridge: number): number | null {
  if (baseline <= 0) return null;
  return Math.round(((baseline - arcbridge) / baseline) * 1000) / 10;
}

/** Prep every corpus member and measure each question. Cleans up temp dirs. */
export async function runTokenProxy(): Promise<FixtureResult[]> {
  const results: FixtureResult[] = [];
  for (const member of CORPUS) {
    const prepped = prepFixture(member);
    const driver = await createDriver();
    try {
      const files = listSourceFiles(prepped.projectRoot);
      const questions: QuestionResult[] = [];
      for (const q of member.questions) {
        questions.push(await runQuestion(member, q, prepped.projectRoot, files, driver.call));
      }
      results.push({ fixture: member.name, memberKind: member.kind, steps: prepped.steps, questions });
    } finally {
      await driver.close();
      prepped.cleanup();
    }
  }
  return results;
}
