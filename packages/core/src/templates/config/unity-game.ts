import type { ArcBridgeConfig } from "../../schemas/config.js";
import type { InitProjectInput } from "../types.js";

export function configTemplate(input: InitProjectInput): ArcBridgeConfig {
  return {
    schema_version: 1,
    project_name: input.name,
    project_type: input.template,
    services: [{ name: "main", path: ".", type: "unity" as const }],
    platforms: input.platforms as ArcBridgeConfig["platforms"],
    quality_priorities:
      input.quality_priorities as ArcBridgeConfig["quality_priorities"],
    indexing: {
      include: ["Assets/**/*.cs"],
      exclude: ["Library", "Temp", "obj", "bin", "Logs", "UserSettings", "Packages"],
      default_mode: "fast",
      csharp_indexer: "auto",
    },
    testing: {
      test_command: "dotnet test",
      timeout_ms: 120000,
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
