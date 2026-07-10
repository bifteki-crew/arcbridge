import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { parse } from "yaml";
import { countTokens, sumTokens } from "./tokenizer.js";
import { createDriver } from "./mcp-driver.js";
import { prepFixture, type CliStep } from "./prep.js";
import { CORPUS, type CorpusMember, type Question } from "./corpus.js";

export interface QuestionResult {
  fixture: string;
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
  steps: CliStep[];
  questions: QuestionResult[];
}

interface SourceFile {
  rel: string;
  content: string;
}

/** All indexable source files under the fixture's src/ tree. */
function listSourceFiles(projectRoot: string): SourceFile[] {
  const srcRoot = join(projectRoot, "src");
  const out: SourceFile[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry)) {
        // Normalize to forward slashes so baseline matching lines up with the
        // YAML code_paths (which always use `/`), including on Windows.
        const rel = relative(projectRoot, full).split(sep).join("/");
        out.push({ rel, content: readFileSync(full, "utf-8") });
      }
    }
  };
  if (existsSync(srcRoot)) walk(srcRoot);
  return out;
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
      results.push({ fixture: member.name, steps: prepped.steps, questions });
    } finally {
      await driver.close();
      prepped.cleanup();
    }
  }
  return results;
}
