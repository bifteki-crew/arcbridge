import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Whether the Roslyn-backed suites can run. The actual `dotnet build` happens
 * once in vitest.global-setup.ts, so this only *checks* — it never builds, which
 * is what previously raced between parallel workers and silently skipped these
 * suites (see the global setup for the full story).
 *
 * Skips are announced on stderr: a quietly skipped suite reads as a pass in the
 * summary, and that is how a Roslyn-path regression once survived a green run.
 */
export function dotnetReady(testDir: string): boolean {
  const reason = notReadyReason(testDir);
  if (reason) {
    console.warn(`[dotnet] SKIPPING Roslyn-backed suite: ${reason}`);
    return false;
  }
  return true;
}

function notReadyReason(testDir: string): string | null {
  try {
    execFileSync("dotnet", ["--version"], { encoding: "utf-8" });
  } catch {
    return "the .NET SDK is not installed";
  }

  const indexerProject = resolve(testDir, "../../../dotnet-indexer/ArcBridge.DotnetIndexer.csproj");
  if (!existsSync(indexerProject)) return `${indexerProject} does not exist`;

  // Built by the global setup. Debug is what `dotnet build` produces by default.
  const dll = resolve(testDir, "../../../dotnet-indexer/bin/Debug/net8.0/ArcBridge.DotnetIndexer.dll");
  if (!existsSync(dll)) return `${dll} was not built (see the global setup warning above)`;

  return null;
}
