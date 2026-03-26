import { defineConfig } from "tsup";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  platform: "node",
  external: ["web-tree-sitter", "node:sqlite"],
  onSuccess: async () => {
    // Fix tsup/esbuild stripping the node: prefix from node:sqlite imports
    const distPath = join("dist", "index.js");
    const content = readFileSync(distPath, "utf-8");
    writeFileSync(distPath, content.replace(/from "sqlite"/g, 'from "node:sqlite"'));
  },
});
