import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stringify } from "yaml";
import { configTemplate as nextjsConfig } from "../templates/config/nextjs-app-router.js";
import { configTemplate as reactViteConfig } from "../templates/config/react-vite.js";
import { configTemplate as apiServiceConfig } from "../templates/config/api-service.js";
import type { InitProjectInput } from "../templates/types.js";
import type { ArchLensConfig } from "../schemas/config.js";

const configTemplates: Record<string, (input: InitProjectInput) => ArchLensConfig> = {
  "nextjs-app-router": nextjsConfig,
  "react-vite": reactViteConfig,
  "api-service": apiServiceConfig,
};

export function generateConfig(
  targetDir: string,
  input: InitProjectInput,
): ArchLensConfig {
  const templateFn = configTemplates[input.template] ?? nextjsConfig;
  const config = templateFn(input);
  const archlensDir = join(targetDir, ".archlens");
  mkdirSync(archlensDir, { recursive: true });

  const yamlContent = stringify(config);
  writeFileSync(join(archlensDir, "config.yaml"), yamlContent, "utf-8");

  return config;
}
