import { z } from "zod";

export const PhaseStatusSchema = z.enum([
  "planned",
  "in-progress",
  "complete",
  "blocked",
]);

export const TaskStatusSchema = z.enum([
  "todo",
  "in-progress",
  "done",
  "blocked",
  "cancelled",
]);

export const PhaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  phase_number: z.number().int().min(0),
  status: PhaseStatusSchema.default("planned"),
  description: z.string().min(1),
  gate_requirements: z.array(z.string()).default([]),
  started_at: z.string().optional(),
  completed_at: z.string().optional(),
});

export const TaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: TaskStatusSchema.default("todo"),
  building_block: z.string().optional(),
  quality_scenarios: z.array(z.string()).default([]),
  acceptance_criteria: z.array(z.string()).default([]),
  completed_at: z.string().optional(),
});

export const PhasesFileSchema = z.object({
  schema_version: z.literal(1).default(1),
  phases: z.array(PhaseSchema),
});

export const TaskFileSchema = z.object({
  schema_version: z.literal(1).default(1),
  phase_id: z.string().min(1),
  tasks: z.array(TaskSchema),
});

export type Phase = z.infer<typeof PhaseSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type PhasesFile = z.infer<typeof PhasesFileSchema>;
export type TaskFile = z.infer<typeof TaskFileSchema>;
