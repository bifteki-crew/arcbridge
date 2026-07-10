import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { cliEntry } from "./paths.js";
import type { CorpusMember } from "./corpus.js";

export interface CliStep {
  cmd: string;
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

/** Run the built ArcBridge CLI, capturing exit code + output (never throws). */
export function runCli(args: string[], cwd: string): CliStep {
  try {
    const stdout = execFileSync(process.execPath, [cliEntry, ...args], {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { cmd: `arcbridge ${args.join(" ")}`, ok: true, code: 0, stdout, stderr: "" };
  } catch (err) {
    // execFileSync errors can carry stdout/stderr as Buffers depending on
    // Node/options — coerce to string so downstream .trim()/.slice() are safe.
    const e = err as { status?: number; stdout?: string | Buffer; stderr?: string | Buffer };
    return {
      cmd: `arcbridge ${args.join(" ")}`,
      ok: false,
      code: e.status ?? 1,
      stdout: e.stdout?.toString() ?? "",
      stderr: e.stderr?.toString() ?? String(err),
    };
  }
}

export interface PreppedFixture {
  member: CorpusMember;
  projectRoot: string;
  steps: CliStep[];
  cleanup(): void;
}

/**
 * Copy a fixture to a temp dir and run the real adoption flow through the built
 * CLI: init → adopt --apply → drift --reindex. This is the honest integration
 * path — whatever breaks here is a real blocker. The final `drift --reindex`
 * also syncs + indexes the DB, so the token proxy reads current building blocks
 * and symbols. `drift` exits non-zero when it finds error-severity drift (by
 * design), so the caller inspects the step rather than assuming ok === success.
 */
export function prepFixture(member: CorpusMember): PreppedFixture {
  const projectRoot = mkdtempSync(join(tmpdir(), `arcbridge-bench-${member.name}-`));
  cpSync(member.sourceDir, projectRoot, { recursive: true });

  const steps: CliStep[] = [
    runCli(["init", "--template", member.template, "--json"], projectRoot),
    runCli(["adopt", "--apply", "--json"], projectRoot),
    runCli(["drift", "--reindex", "--json"], projectRoot),
  ];

  return {
    member,
    projectRoot,
    steps,
    cleanup() {
      rmSync(projectRoot, { recursive: true, force: true });
    },
  };
}
