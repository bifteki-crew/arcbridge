import type { PhasesFile, TaskFile } from "../../schemas/phases.js";
import type { InitProjectInput } from "../types.js";

export function phasePlanTemplate(_input: InitProjectInput): PhasesFile {
  const phases = [
    {
      id: "phase-0-setup",
      name: "Project Setup",
      phase_number: 0,
      status: "planned" as const,
      description:
        "Initialize Angular project, configure strict TypeScript, set up tooling and testing infrastructure",
      gate_requirements: [
        "Angular project builds and serves without errors",
        "Strict TypeScript configuration enabled",
        "Testing infrastructure configured (Vitest or Karma)",
        "Linting and formatting in place",
      ],
    },
    {
      id: "phase-1-foundation",
      name: "Foundation",
      phase_number: 1,
      status: "planned" as const,
      description:
        "App shell, routing with lazy loading, shared component library, core services (HTTP interceptor, auth guard)",
      gate_requirements: [
        "App shell with routing configured",
        "At least one lazy-loaded feature route",
        "HTTP interceptor for API calls",
        "Shared component library started",
        "Quality scenario PERF-05 (lazy loading) verified",
      ],
    },
    {
      id: "phase-2-features",
      name: "Core Features",
      phase_number: 2,
      status: "planned" as const,
      description:
        "Feature implementation, state management with signals or NgRx, integration tests",
      gate_requirements: [
        "Core features complete and functional",
        "State management approach established",
        "Integration tests cover key workflows",
        "All feature routes lazy-loaded",
      ],
    },
    {
      id: "phase-3-polish",
      name: "Polish & Launch",
      phase_number: 3,
      status: "planned" as const,
      description:
        "Performance audit (bundle size, change detection), accessibility, deployment configuration",
      gate_requirements: [
        "All quality scenarios passing",
        "Bundle size within budget",
        "Accessibility audit complete",
        "Production build and deployment successful",
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
          id: "task-0.1-init-project",
          title: "Initialize Angular project with strict configuration",
          status: "todo",
          building_block: "app-shell",
          quality_scenarios: [],
          acceptance_criteria: [
            "Angular CLI project created with strict mode",
            "Standalone components enabled (default in Angular 17+)",
            "TypeScript strict mode enforced",
          ],
        },
        {
          id: "task-0.2-routing",
          title: "Set up routing with lazy loading",
          status: "todo",
          building_block: "app-shell",
          quality_scenarios: ["PERF-05"],
          acceptance_criteria: [
            "App routes defined in app.routes.ts",
            "At least one feature route uses loadComponent or loadChildren",
            "Route guards and resolvers use functional approach",
          ],
        },
        {
          id: "task-0.3-core-services",
          title: "Set up core services and HTTP interceptor",
          status: "todo",
          building_block: "core-services",
          quality_scenarios: [],
          acceptance_criteria: [
            "HTTP interceptor for API base URL and error handling",
            "Core services provided in root",
            "Environment configuration set up",
          ],
        },
        {
          id: "task-0.4-testing",
          title: "Set up testing infrastructure",
          status: "todo",
          quality_scenarios: ["MAINT-02"],
          acceptance_criteria: [
            "Unit test framework configured (Vitest or Karma/Jasmine)",
            "First component test passes",
            "Test coverage reporting enabled",
          ],
        },
      ],
    },
    "phase-1-foundation": {
      schema_version: 1,
      phase_id: "phase-1-foundation",
      tasks: [
        {
          id: "task-1.1-shared-components",
          title: "Build shared component library",
          status: "todo",
          building_block: "shared-components",
          quality_scenarios: ["A11Y-01"],
          acceptance_criteria: [
            "Reusable UI components in shared/ directory",
            "Components use OnPush change detection or signals",
            "Components follow accessibility guidelines",
          ],
        },
        {
          id: "task-1.2-auth",
          title: "Implement authentication and route guards",
          status: "todo",
          building_block: "core-services",
          quality_scenarios: ["SEC-01"],
          acceptance_criteria: [
            "Auth service with login/logout/token management",
            "Functional route guard protecting private routes",
            "Auth interceptor attaching tokens to API requests",
          ],
        },
        {
          id: "task-1.3-api-client",
          title: "Set up API client layer",
          status: "todo",
          building_block: "api-client",
          quality_scenarios: [],
          acceptance_criteria: [
            "Typed API service methods for backend endpoints",
            "Error handling and retry logic",
            "Loading/error state management",
          ],
        },
        {
          id: "task-1.4-document-decisions",
          title: "Document architectural decisions as ADRs",
          status: "todo",
          quality_scenarios: [],
          acceptance_criteria: [
            "ADR for each significant architecture/pattern choice",
            "ADRs linked to affected building blocks and code paths",
          ],
        },
      ],
    },
  };

  return tasksByPhase[phaseId] ?? null;
}
