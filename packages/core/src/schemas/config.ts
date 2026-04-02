import { z } from "zod";
import { QualityCategorySchema } from "./quality-scenarios.js";

export const ServiceSchema = z.object({
  name: z.string().min(1),
  path: z.string().default("."),
  type: z.enum(["nextjs", "react", "fastify", "express", "hono", "dotnet", "unity"]),
  tsconfig: z.string().optional(),
  csproj: z.string().optional(),
});

export const ArcBridgeConfigSchema = z.object({
  schema_version: z.literal(1).default(1),
  project_name: z.string().min(1),
  project_type: z
    .enum([
      "nextjs-app-router",
      "react-vite",
      "api-service",
      "dotnet-webapi",
      "unity-game",
    ])
    .default("nextjs-app-router"),

  services: z.array(ServiceSchema).default([]),

  platforms: z
    .array(z.enum(["claude", "copilot", "gemini", "codex"]))
    .default(["claude"]),

  quality_priorities: z
    .array(QualityCategorySchema)
    .default(["security", "performance", "accessibility"])
    .describe(
      "Quality priorities in order. Common: security, performance, accessibility, " +
      "reliability, maintainability, usability, portability, compatibility. " +
      "Custom categories like data-integrity or compliance are also supported.",
    ),

  indexing: z
    .object({
      include: z.array(z.string()).default(["src/**/*", "app/**/*"]),
      exclude: z
        .array(z.string())
        .default(["node_modules", "dist", ".next", "coverage"]),
      default_mode: z.enum(["fast", "deep"]).default("fast"),
      csharp_indexer: z
        .enum(["auto", "roslyn", "tree-sitter"])
        .default("auto")
        .describe(
          "C# indexer backend: 'auto' prefers the arcbridge-dotnet-indexer global tool, " +
          "falls back to monorepo source if dotnet CLI is available, else tree-sitter. " +
          "'tree-sitter' works without .NET SDK. 'roslyn' requires global tool or monorepo source + .NET SDK.",
        ),
    })
    .default({}),

  testing: z
    .object({
      test_command: z
        .string()
        .min(1)
        .default("npx vitest run")
        .describe("Command to run tests (space-separated, no shell syntax). File paths are appended as arguments."),
      timeout_ms: z
        .number()
        .int()
        .min(1000)
        .default(60000)
        .describe("Timeout per test run in milliseconds"),
    })
    .default({}),

  drift: z
    .object({
      ignore_paths: z
        .array(z.string())
        .default([])
        .describe(
          "File paths or prefixes to ignore in undocumented_module drift checks. " +
          "Framework files (e.g. next.config.ts, root layout/page) are auto-ignored for known project types.",
        ),
    })
    .default({}),

  metrics: z
    .object({
      auto_record: z
        .boolean()
        .default(false)
        .describe(
          "Automatically record agent activity (tool name, duration, quality snapshot) " +
          "when key MCP tools are invoked. Token/model info is optional and caller-provided.",
        ),
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

export type ArcBridgeConfig = z.infer<typeof ArcBridgeConfigSchema>;
export type Service = z.infer<typeof ServiceSchema>;
