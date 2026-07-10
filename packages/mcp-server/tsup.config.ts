import { defineConfig } from "tsup";

export default defineConfig([
  // The stdio binary — keeps the shebang so it can be executed directly.
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: true,
    clean: true,
    sourcemap: true,
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
  // The importable library entry — no shebang; embedded, never executed.
  {
    entry: ["src/lib.ts"],
    format: ["esm"],
    dts: true,
    clean: false,
    sourcemap: true,
  },
]);
