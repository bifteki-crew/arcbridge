import { z } from "zod";

export const AdrStatusSchema = z.enum([
  "proposed",
  "accepted",
  "deprecated",
  "superseded",
]);

export const AdrFrontmatterSchema = z.object({
  id: z.string().regex(/^\d{3}-[a-z0-9-]+$/, "Must match pattern like 001-some-decision"),
  title: z.string().min(1),
  status: AdrStatusSchema.default("proposed"),
  date: z.string(),
  affected_blocks: z.array(z.string()).default([]),
  affected_files: z.array(z.string()).default([]),
  quality_scenarios: z.array(z.string()).default([]),
  superseded_by: z.string().optional(),
});

export type AdrFrontmatter = z.infer<typeof AdrFrontmatterSchema>;
