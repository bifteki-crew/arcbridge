import { z } from "zod";

/**
 * Quality categories. Accepts any lowercase kebab-case string for extensibility.
 * Common categories (inspired by ISO/IEC 25010): reliability, usability, security,
 * maintainability, portability, compatibility, performance, and accessibility
 * (often a sub-characteristic of usability, but commonly tracked separately).
 * Projects can define custom categories like: data-integrity, compliance, auditability.
 */
export const QualityCategorySchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, "Must be lowercase kebab-case (e.g., 'security', 'data-integrity')");

export const QualityPrioritySchema = z.enum(["must", "should", "could"]);

export const QualityScenarioStatusSchema = z.enum([
  "passing",
  "failing",
  "untested",
  "partial",
]);

export const QualityScenarioSchema = z.object({
  id: z.string().regex(/^[A-Z0-9]+-\d+$/, "Must match pattern like SEC-01"),
  name: z.string().min(1),
  category: QualityCategorySchema,
  priority: QualityPrioritySchema,
  scenario: z.string().min(1),
  expected: z.string().min(1),
  linked_code: z.array(z.string()).default([]),
  linked_tests: z.array(z.string()).default([]),
  linked_blocks: z.array(z.string()).default([]),
  verification: z.enum(["automatic", "manual", "semi-automatic"]),
  status: QualityScenarioStatusSchema.default("untested"),
});

export const QualityGoalSchema = z.object({
  id: QualityCategorySchema,
  priority: z.number().int().min(1),
  description: z.string().min(1),
});

export const QualityScenariosFileSchema = z.object({
  schema_version: z.literal(1).default(1),
  last_updated: z.string(),
  quality_goals: z.array(QualityGoalSchema),
  scenarios: z.array(QualityScenarioSchema),
});

export type QualityScenario = z.infer<typeof QualityScenarioSchema>;
export type QualityGoal = z.infer<typeof QualityGoalSchema>;
export type QualityScenariosFile = z.infer<typeof QualityScenariosFileSchema>;
