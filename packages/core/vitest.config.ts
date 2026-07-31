import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    // Builds the .NET indexer + fixture once, before workers spawn — see the
    // file for why doing it per-suite was actively harmful.
    globalSetup: ["./vitest.global-setup.ts"],
    env: {
      // Exercise the Roslyn indexer from THIS checkout. Without it, the global
      // `arcbridge-dotnet-indexer` tool wins when installed, so the suite would
      // silently validate whatever stale version a developer happens to have
      // rather than the source under test — and a change to the C# indexer could
      // pass CI while never having run.
      ARCBRIDGE_PREFER_SOURCE: "1",
    },
  },
});
