import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Vitest 4 dropped vitest.workspace.ts. These are the same package configs.
    projects: ["packages/*/vitest.config.ts"],
  },
});
