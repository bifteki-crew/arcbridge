import { z } from "zod";

export const ServiceSchema = z.object({
  name: z.string().min(1),
  path: z.string().default("."),
  type: z.enum(["nextjs", "react", "fastify", "express", "hono", "dotnet"]),
  tsconfig: z.string().default("tsconfig.json"),
});

export const ArchLensConfigSchema = z.object({
  schema_version: z.literal(1).default(1),
  project_name: z.string().min(1),
  project_type: z
    .enum([
      "nextjs-app-router",
      "react-vite",
      "fullstack-monorepo",
      "api-service",
    ])
    .default("nextjs-app-router"),

  services: z.array(ServiceSchema).default([]),

  platforms: z
    .array(z.enum(["claude", "copilot", "gemini", "codex"]))
    .default(["claude"]),

  quality_priorities: z
    .array(
      z.enum([
        "security",
        "performance",
        "accessibility",
        "reliability",
        "maintainability",
      ]),
    )
    .default(["security", "performance", "accessibility"]),

  indexing: z
    .object({
      include: z.array(z.string()).default(["src/**/*", "app/**/*"]),
      exclude: z
        .array(z.string())
        .default(["node_modules", "dist", ".next", "coverage"]),
      default_mode: z.enum(["fast", "deep"]).default("fast"),
    })
    .default({}),

  sync: z
    .object({
      auto_detect_drift: z.boolean().default(true),
      drift_severity_threshold: z
        .enum(["info", "warning", "error"])
        .default("warning"),
      propose_updates_on: z
        .enum(["session-end", "phase-complete", "manual"])
        .default("phase-complete"),
    })
    .default({}),
});

export type ArchLensConfig = z.infer<typeof ArchLensConfigSchema>;
export type Service = z.infer<typeof ServiceSchema>;
