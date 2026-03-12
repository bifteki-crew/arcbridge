import type { PhasesFile, TaskFile } from "../../schemas/phases.js";
import type { InitProjectInput } from "../types.js";

export function phasePlanTemplate(_input: InitProjectInput): PhasesFile {
  const phases = [
    {
      id: "phase-0-setup",
      name: "Project Setup",
      phase_number: 0,
      status: "in-progress" as const,
      description:
        "Initialize Vite + React project, configure TypeScript, install dependencies",
      gate_requirements: [
        "Project builds successfully with Vite",
        "Dev server starts without errors",
        "Linting and formatting configured",
      ],
    },
    {
      id: "phase-1-foundation",
      name: "Foundation",
      phase_number: 1,
      status: "planned" as const,
      description: "Core layout, routing, state management, and shared components",
      gate_requirements: [
        "Router configured with all primary routes",
        "Shared component library established",
        "Quality scenarios SEC-01, MAINT-01 verified",
      ],
    },
    {
      id: "phase-2-features",
      name: "Core Features",
      phase_number: 2,
      status: "planned" as const,
      description: "Implement the primary features of the application",
      gate_requirements: [
        "Core user flows work end-to-end",
        "Test coverage meets thresholds",
        "Performance budgets met",
      ],
    },
    {
      id: "phase-3-polish",
      name: "Polish & Launch",
      phase_number: 3,
      status: "planned" as const,
      description:
        "Error handling, accessibility, performance optimization, deployment",
      gate_requirements: [
        "All quality scenarios passing",
        "Accessibility audit passes",
        "Production build optimized and deployed",
      ],
    },
  ];

  return { schema_version: 1, phases };
}

export function phaseTasksTemplate(
  _input: InitProjectInput,
  phaseId: string,
): TaskFile | null {
  const tasksByPhase: Record<string, TaskFile> = {
    "phase-0-setup": {
      schema_version: 1,
      phase_id: "phase-0-setup",
      tasks: [
        {
          id: "task-0.1-init-vite",
          title: "Initialize Vite + React project",
          status: "todo",
          building_block: "app-shell",
          quality_scenarios: [],
          acceptance_criteria: [
            "Vite + React app created with TypeScript",
            "TypeScript configured in strict mode",
            "Project runs with `npm run dev`",
          ],
        },
        {
          id: "task-0.2-tooling",
          title: "Configure development tooling",
          status: "todo",
          quality_scenarios: ["MAINT-01"],
          acceptance_criteria: [
            "ESLint configured with recommended rules",
            "Prettier configured for consistent formatting",
            "Git hooks set up for pre-commit checks",
          ],
        },
        {
          id: "task-0.3-routing",
          title: "Set up client-side routing",
          status: "todo",
          building_block: "app-shell",
          quality_scenarios: [],
          acceptance_criteria: [
            "React Router (or TanStack Router) installed and configured",
            "Route structure matches planned building blocks",
            "404 handling configured",
          ],
        },
        {
          id: "task-0.4-testing",
          title: "Set up testing infrastructure",
          status: "todo",
          quality_scenarios: ["MAINT-02"],
          acceptance_criteria: [
            "Vitest configured for unit tests",
            "Testing Library configured for component tests",
            "Test scripts added to package.json",
          ],
        },
      ],
    },
    "phase-1-foundation": {
      schema_version: 1,
      phase_id: "phase-1-foundation",
      tasks: [
        {
          id: "task-1.1-layout",
          title: "Create app layout and navigation",
          status: "todo",
          building_block: "app-shell",
          quality_scenarios: ["A11Y-01", "A11Y-02"],
          acceptance_criteria: [
            "App shell with header, content, and footer",
            "Navigation component with keyboard accessibility",
            "Responsive design for mobile and desktop",
          ],
        },
        {
          id: "task-1.2-shared-components",
          title: "Build shared UI components",
          status: "todo",
          building_block: "ui-components",
          quality_scenarios: ["A11Y-01"],
          acceptance_criteria: [
            "Button, Input, and Card components created",
            "Components follow accessibility guidelines",
            "Component tests written",
          ],
        },
      ],
    },
  };

  return tasksByPhase[phaseId] ?? null;
}
