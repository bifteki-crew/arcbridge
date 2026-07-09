import { existsSync } from "node:fs";
import { cliEntry } from "./paths.js";
import { prepFixture } from "./prep.js";
import { createDriver } from "./mcp-driver.js";
import { CORPUS } from "./corpus.js";

/**
 * Functional smoke across the corpus — the gating layer of F0. Runs the real
 * adoption pipeline (init → adopt → drift --reindex) via the built CLI on each
 * fixture, then drives the consolidated MCP tools against the result. Hard
 * failures (crashes, empty/failed tool responses, no symbols indexed) exit
 * non-zero. Drift *findings* are reported, not failed — a fixture legitimately
 * having drift is data, not a broken pipeline.
 */

interface Finding {
  fixture: string;
  hard: boolean;
  message: string;
}

function parseJsonLoose(s: string): unknown | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

async function checkFixture(name: string): Promise<Finding[]> {
  const member = CORPUS.find((m) => m.name === name)!;
  const findings: Finding[] = [];
  const prepped = prepFixture(member);
  const driver = await createDriver();

  try {
    const [init, adopt, drift] = prepped.steps;

    if (!init.ok) findings.push({ fixture: name, hard: true, message: `init failed (exit ${init.code}): ${init.stderr.slice(0, 300)}` });
    if (!adopt.ok) findings.push({ fixture: name, hard: true, message: `adopt --apply failed (exit ${adopt.code}): ${adopt.stderr.slice(0, 300)}` });

    // drift may exit non-zero on error-severity drift; only a non-JSON output
    // signals an actual crash.
    const driftJson = parseJsonLoose(drift.stdout);
    if (driftJson === null) {
      findings.push({ fixture: name, hard: true, message: `drift --reindex produced no parseable JSON (exit ${drift.code}): ${drift.stderr.slice(0, 300)}` });
    } else {
      const count = Array.isArray((driftJson as { drift?: unknown[] }).drift)
        ? (driftJson as { drift: unknown[] }).drift.length
        : "?";
      findings.push({ fixture: name, hard: false, message: `drift after adopt: ${count} finding(s) (exit ${drift.code})` });
    }

    // MCP tool sanity against the adopted project.
    const blocks = await driver.call("arcbridge_get_building_blocks", { target_dir: prepped.projectRoot });
    if (!blocks.trim() || /no building blocks/i.test(blocks)) {
      findings.push({ fixture: name, hard: true, message: "get_building_blocks returned empty" });
    }

    const symbolQ = member.questions.find((q) => q.kind === "symbol");
    if (symbolQ?.symbolName) {
      const search = await driver.call("arcbridge_query_symbols", { target_dir: prepped.projectRoot, query: symbolQ.symbolName });
      if (!/\*\*ID:\*\*/.test(search)) {
        findings.push({ fixture: name, hard: true, message: `query_symbols found no symbol for "${symbolQ.symbolName}" (indexing produced nothing?)` });
      }
    }
  } catch (err) {
    findings.push({ fixture: name, hard: true, message: `unexpected error: ${err instanceof Error ? err.stack ?? err.message : String(err)}` });
  } finally {
    await driver.close();
    prepped.cleanup();
  }

  return findings;
}

async function main(): Promise<void> {
  if (!existsSync(cliEntry)) {
    console.error(`Built CLI not found at ${cliEntry}. Run \`pnpm build\` first.`);
    process.exit(1);
  }

  const all: Finding[] = [];
  for (const member of CORPUS) {
    all.push(...(await checkFixture(member.name)));
  }

  console.log("ArcBridge corpus smoke\n");
  for (const f of all) {
    const tag = f.hard ? "FAIL" : "note";
    console.log(`  [${tag}] ${f.fixture}: ${f.message}`);
  }

  const hard = all.filter((f) => f.hard);
  console.log(`\n${hard.length ? `${hard.length} hard failure(s).` : "All fixtures passed functional smoke."}`);
  process.exit(hard.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
