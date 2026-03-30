import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stringify } from "yaml";
import type { PhasesFile, TaskFile } from "../schemas/phases.js";
import type { InitProjectInput } from "../templates/types.js";
import {
  phasePlanTemplate as nextjsPlan,
  phaseTasksTemplate as nextjsTasks,
} from "../templates/phases/nextjs-app-router.js";
import {
  phasePlanTemplate as reactVitePlan,
  phaseTasksTemplate as reactViteTasks,
} from "../templates/phases/react-vite.js";
import {
  phasePlanTemplate as apiServicePlan,
  phaseTasksTemplate as apiServiceTasks,
} from "../templates/phases/api-service.js";
import {
  phasePlanTemplate as dotnetWebapiPlan,
  phaseTasksTemplate as dotnetWebapiTasks,
} from "../templates/phases/dotnet-webapi.js";
import {
  phasePlanTemplate as unityGamePlan,
  phaseTasksTemplate as unityGameTasks,
} from "../templates/phases/unity-game.js";

type PlanFn = (input: InitProjectInput) => PhasesFile;
type TasksFn = (input: InitProjectInput, phaseId: string) => TaskFile | null;

const planTemplates: Record<string, { plan: PlanFn; tasks: TasksFn }> = {
  "nextjs-app-router": { plan: nextjsPlan, tasks: nextjsTasks },
  "react-vite": { plan: reactVitePlan, tasks: reactViteTasks },
  "api-service": { plan: apiServicePlan, tasks: apiServiceTasks },
  "dotnet-webapi": { plan: dotnetWebapiPlan, tasks: dotnetWebapiTasks },
  "unity-game": { plan: unityGamePlan, tasks: unityGameTasks },
};

export function generatePlan(
  targetDir: string,
  input: InitProjectInput,
): void {
  const planDir = join(targetDir, ".arcbridge", "plan");
  const tasksDir = join(planDir, "tasks");

  mkdirSync(planDir, { recursive: true });
  mkdirSync(tasksDir, { recursive: true });

  // Write phases.yaml
  const tmpl = planTemplates[input.template] ?? planTemplates["nextjs-app-router"]!;
  const phasePlan = tmpl.plan(input);
  writeFileSync(join(planDir, "phases.yaml"), stringify(phasePlan), "utf-8");

  // Write task files for each phase
  for (const phase of phasePlan.phases) {
    const taskFile = tmpl.tasks(input, phase.id);
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
