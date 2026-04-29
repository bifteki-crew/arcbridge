import type { ArcBridgeConfig } from "../../schemas/config.js";
import type { InitProjectInput } from "../types.js";

export function configTemplate(input: InitProjectInput): ArcBridgeConfig {
  return {
    schema_version: 1,
    project_name: input.name,
    project_type: "fullstack-nextjs-dotnet",
    services: [
      { name: "frontend", path: "frontend", type: "nextjs", tsconfig: "frontend/tsconfig.json" },
      { name: "api", path: "api", type: "dotnet" },
    ],
    platforms: input.platforms as ArcBridgeConfig["platforms"],
    quality_priorities:
      input.quality_priorities as ArcBridgeConfig["quality_priorities"],
    indexing: {
      include: ["frontend/src/**/*", "frontend/app/**/*", "api/**/*.cs"],
      exclude: ["node_modules", "dist", ".next", "bin", "obj", "coverage"],
      default_mode: "fast",
      csharp_indexer: "auto",
    },
    testing: {
      test_command: "npm test",
      timeout_ms: 60000,
    },
    drift: {
      ignore_paths: [],
    },
    metrics: { auto_record: false },
    sync: {
      auto_detect_drift: true,
      drift_severity_threshold: "warning",
      propose_updates_on: "phase-complete",
    },
  };
}
