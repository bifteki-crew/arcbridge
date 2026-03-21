import type { ArcBridgeConfig } from "../../schemas/config.js";
import type { InitProjectInput } from "../types.js";

export function configTemplate(input: InitProjectInput): ArcBridgeConfig {
  return {
    schema_version: 1,
    project_name: input.name,
    project_type: input.template,
    services: [
      {
        name: "main",
        path: ".",
        type: "react",
        tsconfig: "tsconfig.json",
      },
    ],
    platforms: input.platforms as ArcBridgeConfig["platforms"],
    quality_priorities:
      input.quality_priorities as ArcBridgeConfig["quality_priorities"],
    indexing: {
      include: ["src/**/*"],
      exclude: ["node_modules", "dist", "coverage"],
      default_mode: "fast",
      csharp_indexer: "auto",
    },
    testing: {
      test_command: "npx vitest run",
      timeout_ms: 60000,
    },
    drift: {
      ignore_paths: [],
    },
    sync: {
      auto_detect_drift: true,
      drift_severity_threshold: "warning",
      propose_updates_on: "phase-complete",
    },
  };
}
