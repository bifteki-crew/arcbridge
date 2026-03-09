import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stringify } from "yaml";
import { configTemplate } from "../templates/config/nextjs-app-router.js";
import type { InitProjectInput } from "../templates/types.js";
import type { ArchLensConfig } from "../schemas/config.js";

export function generateConfig(
  targetDir: string,
  input: InitProjectInput,
): ArchLensConfig {
  const config = configTemplate(input);
  const archlensDir = join(targetDir, ".archlens");
  mkdirSync(archlensDir, { recursive: true });

  const yamlContent = stringify(config);
  writeFileSync(join(archlensDir, "config.yaml"), yamlContent, "utf-8");

  return config;
}
