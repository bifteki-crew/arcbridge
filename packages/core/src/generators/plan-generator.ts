import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stringify } from "yaml";
import type { InitProjectInput } from "../templates/types.js";
import {
  phasePlanTemplate,
  phaseTasksTemplate,
} from "../templates/phases/nextjs-app-router.js";

export function generatePlan(
  targetDir: string,
  input: InitProjectInput,
): void {
  const planDir = join(targetDir, ".archlens", "plan");
  const tasksDir = join(planDir, "tasks");

  mkdirSync(planDir, { recursive: true });
  mkdirSync(tasksDir, { recursive: true });

  // Write phases.yaml
  const phasePlan = phasePlanTemplate(input);
  writeFileSync(join(planDir, "phases.yaml"), stringify(phasePlan), "utf-8");

  // Write task files for each phase
  for (const phase of phasePlan.phases) {
    const taskFile = phaseTasksTemplate(input, phase.id);
    if (taskFile) {
      writeFileSync(
        join(tasksDir, `${phase.id}.yaml`),
        stringify(taskFile),
        "utf-8",
      );
    }
  }

  // Write empty sync log
  writeFileSync(
    join(planDir, "sync-log.md"),
    `# Sync Log\n\nArchitecture sync events are recorded here.\n`,
    "utf-8",
  );
}
