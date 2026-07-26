import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    // Builds the .NET indexer + fixture once, before workers spawn — see the
    // file for why doing it per-suite was actively harmful.
    globalSetup: ["./vitest.global-setup.ts"],
  },
});
