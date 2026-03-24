import { z } from "zod";

export const ServiceSchema = z.object({
  name: z.string().min(1),
  path: z.string().default("."),
  type: z.enum(["nextjs", "react", "fastify", "express", "hono", "dotnet"]),
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
      csharp_indexer: z
        .enum(["auto", "roslyn", "tree-sitter"])
        .default("auto")
        .describe(
          "C# indexer backend: 'auto' checks for dotnet CLI — uses Roslyn if found, otherwise tree-sitter. " +
          "'tree-sitter' works without .NET SDK. 'roslyn' requires .NET SDK.",
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
