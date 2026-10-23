import { defineConfig } from "vitest/config";

/**
 * Vitest 4 removed `vitest.workspace.ts` and `defineWorkspace`; projects are
 * declared here instead.
 *
 * This file is load-bearing, not boilerplate. The per-package configs carry
 * `globalSetup` (which builds the .NET indexer from source) and
 * `ARCBRIDGE_PREFER_SOURCE`. When vitest cannot find the projects it does not
 * complain — it runs every test file in one root project with neither of those
 * applied, so the Roslyn-backed suites find no built indexer and turn
 * themselves off via `describe.skip`. The run then reports 33 skipped tests and
 * exits 0, which reads as a pass. Losing this file is a silent loss of
 * coverage, so `projects` must keep matching the per-package configs.
 */
export default defineConfig({
  test: {
    projects: ["packages/*/vitest.config.ts"],
  },
});
