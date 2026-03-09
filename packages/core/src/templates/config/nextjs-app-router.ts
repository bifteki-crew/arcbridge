import type { ArchLensConfig } from "../../schemas/config.js";
import type { InitProjectInput } from "../types.js";

export function configTemplate(input: InitProjectInput): ArchLensConfig {
  return {
    schema_version: 1,
    project_name: input.name,
    project_type: input.template,
    services: [
      {
        name: "main",
        path: ".",
        type: "nextjs",
        tsconfig: "tsconfig.json",
      },
    ],
    platforms: input.platforms as ArchLensConfig["platforms"],
    quality_priorities:
      input.quality_priorities as ArchLensConfig["quality_priorities"],
    indexing: {
      include: ["src/**/*", "app/**/*"],
      exclude: ["node_modules", "dist", ".next", "coverage"],
      default_mode: "fast",
    },
    sync: {
      auto_detect_drift: true,
      drift_severity_threshold: "warning",
      propose_updates_on: "phase-complete",
    },
  };
}
