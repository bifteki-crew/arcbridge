import { z } from "zod";

export const AgentRoleSchema = z.object({
  role_id: z.string().regex(/^[a-z0-9-]+$/, "Must be kebab-case"),
  name: z.string().min(1),
  description: z.string().min(1),
  version: z.number().int().min(1).default(1),

  required_tools: z.array(z.string()).default([]),
  denied_tools: z.array(z.string()).default([]),
  read_only: z.boolean().default(false),

  quality_focus: z.array(z.string()).default([]),

  model_preferences: z
    .object({
      reasoning_depth: z.enum(["low", "medium", "high"]).default("medium"),
      speed_priority: z.enum(["low", "medium", "high"]).default("medium"),
      suggested_models: z
        .object({
          claude: z.string().optional(),
          openai: z.string().optional(),
          gemini: z.string().optional(),
        })
        .default({}),
    })
    .default({}),

  platform_overrides: z
    .object({
      claude: z.record(z.string(), z.unknown()).optional(),
      copilot: z.record(z.string(), z.unknown()).optional(),
      codex: z.record(z.string(), z.unknown()).optional(),
    })
    .default({}),

  // The markdown body (system prompt) is stored separately
  system_prompt: z.string().min(1),
});

export type AgentRole = z.infer<typeof AgentRoleSchema>;
