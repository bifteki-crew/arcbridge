import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stringify } from "yaml";
import { configTemplate as nextjsConfig } from "../templates/config/nextjs-app-router.js";
import { configTemplate as reactViteConfig } from "../templates/config/react-vite.js";
import { configTemplate as apiServiceConfig } from "../templates/config/api-service.js";
import { configTemplate as dotnetWebapiConfig } from "../templates/config/dotnet-webapi.js";
import { configTemplate as unityGameConfig } from "../templates/config/unity-game.js";
import { configTemplate as angularAppConfig } from "../templates/config/angular-app.js";
import type { InitProjectInput } from "../templates/types.js";
import type { ArcBridgeConfig } from "../schemas/config.js";

const configTemplates: Record<string, (input: InitProjectInput) => ArcBridgeConfig> = {
  "nextjs-app-router": nextjsConfig,
  "react-vite": reactViteConfig,
  "api-service": apiServiceConfig,
  "dotnet-webapi": dotnetWebapiConfig,
  "unity-game": unityGameConfig,
  "angular-app": angularAppConfig,
};

export function generateConfig(
  targetDir: string,
  input: InitProjectInput,
): ArcBridgeConfig {
  const templateFn = configTemplates[input.template] ?? nextjsConfig;
  const config = templateFn(input);
  const arcBridgeDir = join(targetDir, ".arcbridge");
  mkdirSync(arcBridgeDir, { recursive: true });

  const yamlContent = stringify(config);
  writeFileSync(join(arcBridgeDir, "config.yaml"), yamlContent, "utf-8");

  return config;
}
