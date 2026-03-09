import { z } from "zod";

export const BuildingBlockSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "Must be kebab-case"),
  name: z.string().min(1),
  level: z.number().int().min(1).max(3),
  parent_id: z.string().optional(),
  code_paths: z.array(z.string()).default([]),
  interfaces: z.array(z.string()).default([]),
  quality_scenarios: z.array(z.string()).default([]),
  adrs: z.array(z.string()).default([]),
  responsibility: z.string().min(1),
  service: z.string().default("main"),
});

export const BuildingBlocksFrontmatterSchema = z.object({
  section: z.literal("building-blocks"),
  schema_version: z.literal(1).default(1),
  last_synced: z.string(),
  blocks: z.array(BuildingBlockSchema),
});

export type BuildingBlock = z.infer<typeof BuildingBlockSchema>;
export type BuildingBlocksFrontmatter = z.infer<
  typeof BuildingBlocksFrontmatterSchema
>;
