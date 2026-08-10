import { cpSync, rmSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { TASK_PROMPT, BASELINE_GUIDANCE } from "./task.js";

/**
 * The two arms of the comparison.
 *
 * The only difference is what the agent can see and use. Both get the same task,
 * the same model, the same turn budget and the same file-editing tools.
 *
 * `baseline` has the ArcBridge model REMOVED from its copy — not merely the MCP
 * tools withheld. That is the honest counterfactual for "a project without
 * ArcBridge": there is no architecture document to read either. It does mean the
 * treatment is bundled (tools + documentation + convention) and does not isolate
 * which part helps; a third arm with the docs present but no tools would separate
 * that, and is a deliberate future refinement rather than something this measures.
 */
export type ArmId = "baseline" | "arcbridge";

export interface Arm {
  id: ArmId;
  label: string;
  /** Prompt handed to the agent. */
  prompt(): string;
  /** Strip or add whatever distinguishes this arm, inside a fresh copy. */
  prepare(runRoot: string): void;
  /** Extra CLI arguments — the MCP config for the ArcBridge arm. */
  cliArgs(runRoot: string): string[];
}

/**
 * Everything in the repository that would leak ArcBridge to the baseline. The
 * generated CLAUDE.md and .claude/ carry the convention in prose, and .mcp.json
 * would hand it the server outright — withholding only `.arcbridge/` would leave
 * the baseline reading instructions about a model it cannot see.
 */
const ARCBRIDGE_ARTIFACTS = [".arcbridge", ".mcp.json", "CLAUDE.md", ".claude"];

export const ARMS: Arm[] = [
  {
    id: "baseline",
    label: "Baseline (no ArcBridge)",
    prompt: () => `${TASK_PROMPT}\n${BASELINE_GUIDANCE}`,
    prepare(runRoot) {
      for (const artifact of ARCBRIDGE_ARTIFACTS) {
        rmSync(join(runRoot, artifact), { recursive: true, force: true });
      }
    },
    cliArgs: () => [],
  },
  {
    id: "arcbridge",
    label: "ArcBridge (tools + model, no gate)",
    prompt: () => TASK_PROMPT,
    prepare(runRoot) {
      // The committed model, CLAUDE.md and .claude/ are already present — that IS
      // the treatment. Only the MCP server needs wiring for this run.
      writeMcpConfig(runRoot);
    },
    cliArgs: (runRoot) => ["--mcp-config", join(runRoot, ".bench-mcp.json")],
  },
];

/**
 * Point the run at the MCP server built from THIS checkout rather than a
 * published version, so the benchmark measures the code under test.
 */
function writeMcpConfig(runRoot: string): void {
  const serverEntry = join(
    process.env.ARCBRIDGE_REPO ?? process.cwd(),
    "packages",
    "mcp-server",
    "dist",
    "index.js",
  );
  const config = {
    mcpServers: {
      arcbridge: { command: process.execPath, args: [serverEntry] },
    },
  };
  writeFileSync(join(runRoot, ".bench-mcp.json"), JSON.stringify(config, null, 2), "utf-8");
}

/**
 * A pristine copy of the subject repository for one run, with git metadata and
 * build output left behind. `.arcbridge/index.db` is deliberately not copied: it
 * is derived, and a stale index would let a run start from another run's state.
 */
export function prepareRunTree(sourceRepo: string, runRoot: string): void {
  if (!existsSync(sourceRepo)) {
    throw new Error(`Subject repository not found at ${sourceRepo}`);
  }
  mkdirSync(runRoot, { recursive: true });
  cpSync(sourceRepo, runRoot, {
    recursive: true,
    filter: (src) => {
      const skip = ["/.git/", "/node_modules/", "/bin/", "/obj/", "/.next/"];
      if (skip.some((part) => `${src}/`.includes(part))) return false;
      return !src.endsWith("index.db") && !src.endsWith("index.db-wal") && !src.endsWith("index.db-shm");
    },
  });
}
