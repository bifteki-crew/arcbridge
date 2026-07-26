import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Build the .NET indexer and its test fixture ONCE, before any test worker
 * starts.
 *
 * Previously each Roslyn suite ran `dotnet build` itself at module scope. Vitest
 * runs those files in parallel workers, so two builds of the same project raced;
 * the loser threw, the suite fell back to `describe.skip`, and the run reported
 * "22 skipped" — which reads like a pass. That silence is how a Roslyn-path bug
 * (routes inserted without response_type) survived a green test suite. Building
 * here removes the race, and the suites now only check for the built artifacts.
 */
export default async function setup(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const indexerProject = resolve(here, "../dotnet-indexer/ArcBridge.DotnetIndexer.csproj");
  const fixtureDir = resolve(here, "src/__tests__/fixtures/dotnet-project");

  try {
    execFileSync("dotnet", ["--version"], { encoding: "utf-8" });
  } catch {
    console.warn("[dotnet] SDK not found — Roslyn-backed suites will be SKIPPED.");
    return;
  }

  if (!existsSync(indexerProject)) {
    console.warn(`[dotnet] ${indexerProject} missing — Roslyn-backed suites will be SKIPPED.`);
    return;
  }

  for (const [label, args, cwd] of [
    ["indexer", ["build", indexerProject], undefined],
    ["fixture", ["build"], fixtureDir],
  ] as const) {
    try {
      execFileSync("dotnet", args, { encoding: "utf-8", cwd, timeout: 180_000 });
    } catch (err) {
      // Loud on purpose: a skipped Roslyn suite must never look like a pass.
      console.warn(
        `[dotnet] building the ${label} failed — Roslyn-backed suites will be SKIPPED.\n` +
          (err instanceof Error ? err.message : String(err)),
      );
      return;
    }
  }
}
