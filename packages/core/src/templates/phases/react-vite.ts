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
        {
          id: "task-1.3-api-client",
          title: "Set up API client layer",
          status: "todo",
          building_block: "api-client",
          quality_scenarios: [],
          acceptance_criteria: [
            "API client module created with typed request/response interfaces",
            "Base URL and auth token handling configured",
            "Error handling standardized (network errors, API errors, validation errors)",
            "Request/response types match the backend API contract",
            "Document the API contract approach in an ADR (e.g., OpenAPI-generated types vs. manual types)",
          ],
        },
        {
          id: "task-1.4-document-decisions",
          title: "Document architectural decisions as ADRs",
          status: "todo",
          quality_scenarios: [],
          acceptance_criteria: [
            "ADR for each significant technology or pattern choice made in this phase",
            "ADRs include context, decision, and consequences",
            "ADRs linked to affected building blocks and code paths",
          ],
        },
      ],
    },
    "phase-2-features": {
      schema_version: 1,
      phase_id: "phase-2-features",
      tasks: [
        {
          id: "task-2.1-core-feature",
          title: "Implement primary feature",
          status: "todo",
          quality_scenarios: ["PERF-01"],
          acceptance_criteria: [
            "Core user flow works end-to-end",
            "Unit and component tests written",
            "Meets performance budgets",
          ],
        },
        {
          id: "task-2.2-state-management",
          title: "Set up state management for complex data",
          status: "todo",
          quality_scenarios: ["MAINT-01"],
          acceptance_criteria: [
            "State management pattern established",
            "Data fetching/caching strategy implemented",
            "Loading and error states handled",
          ],
        },
        {
          id: "task-2.3-integration-tests",
          title: "Write integration tests for core flows",
          status: "todo",
          quality_scenarios: ["MAINT-02"],
          acceptance_criteria: [
            "Happy path tested for each core feature",
            "Error scenarios tested",
            "Test coverage meets threshold",
          ],
        },
        {
          id: "task-2.4-document-decisions",
          title: "Document Phase 2 architectural decisions",
          status: "todo",
          quality_scenarios: [],
          acceptance_criteria: [
            "ADRs for state management and data fetching choices",
            "Building blocks updated with new code paths",
          ],
        },
      ],
    },
    "phase-3-polish": {
      schema_version: 1,
      phase_id: "phase-3-polish",
      tasks: [
        {
          id: "task-3.1-error-handling",
          title: "Implement comprehensive error handling",
          status: "todo",
          quality_scenarios: ["SEC-01"],
          acceptance_criteria: [
            "Error boundaries at route level",
            "User-friendly error messages",
            "Error logging configured",
          ],
        },
        {
          id: "task-3.2-accessibility",
          title: "Accessibility audit and fixes",
          status: "todo",
          quality_scenarios: ["A11Y-01", "A11Y-02"],
          acceptance_criteria: [
            "Keyboard navigation works for all interactive elements",
            "Screen reader compatible (ARIA labels, roles)",
            "WCAG 2.1 AA compliance verified",
          ],
        },
        {
          id: "task-3.3-performance",
          title: "Performance optimization",
          status: "todo",
          quality_scenarios: ["PERF-01"],
          acceptance_criteria: [
            "Bundle size optimized (code splitting, tree shaking)",
            "Lighthouse performance score >= 90",
            "No unnecessary re-renders in hot paths",
          ],
        },
        {
          id: "task-3.4-deployment",
          title: "Configure production build and deployment",
          status: "todo",
          quality_scenarios: [],
          acceptance_criteria: [
            "Production build configuration verified",
            "Deployment pipeline configured",
            "Environment variables documented",
          ],
        },
      ],
    },
  };

  return tasksByPhase[phaseId] ?? null;
}
