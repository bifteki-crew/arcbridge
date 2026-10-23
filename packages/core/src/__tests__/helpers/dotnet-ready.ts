import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Set this where the .NET toolchain is known to be present — CI — to turn a skip
 * into a failure.
 *
 * Skipping is the right behaviour on a laptop without the SDK, but it is
 * indistinguishable from the toolchain breaking underneath us, and the summary
 * reads the same either way. A vitest 4 bump once dropped the global setup's
 * configuration and the Roslyn suites answered by reporting `9 passed | 33
 * skipped`, exit 0 — a green build with a third of the coverage switched off.
 * Where .NET is guaranteed, there is no legitimate reason to skip, so any reason
 * is a fault worth failing on.
 */
export const REQUIRE_DOTNET_ENV = "ARCBRIDGE_REQUIRE_DOTNET";

/** Whether a missing .NET toolchain must fail the run rather than skip it. */
export function dotnetRequired(): boolean {
  const value = process.env[REQUIRE_DOTNET_ENV];
  return value !== undefined && value !== "" && value !== "0" && value !== "false";
}

/** The failure text used wherever an unavailable toolchain must not pass quietly. */
export function dotnetRequiredError(reason: string): Error {
  return new Error(
    `[dotnet] ${reason}, and ${REQUIRE_DOTNET_ENV} is set, so this is a failure rather ` +
      `than a skip. These suites exercise the Roslyn indexer; skipping them silently ` +
      `is how a Roslyn-path regression once survived a green run. Either fix the ` +
      `toolchain, or unset ${REQUIRE_DOTNET_ENV} if .NET genuinely is not available here.`,
  );
}

/**
 * Whether the Roslyn-backed suites can run. The actual `dotnet build` happens
 * once in vitest.global-setup.ts, so this only *checks* — it never builds, which
 * is what previously raced between parallel workers and silently skipped these
 * suites (see the global setup for the full story).
 *
 * Skips are announced on stderr: a quietly skipped suite reads as a pass in the
 * summary, and that is how a Roslyn-path regression once survived a green run.
 * With `ARCBRIDGE_REQUIRE_DOTNET` set they throw instead.
 */
export function dotnetReady(testDir: string): boolean {
  const reason = notReadyReason(testDir);
  if (reason) {
    if (dotnetRequired()) throw dotnetRequiredError(reason);
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
