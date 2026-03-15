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
        "Initialize API service, configure TypeScript, set up database and middleware",
      gate_requirements: [
        "Project builds successfully",
        "Server starts and responds to health check",
        "Linting and formatting configured",
      ],
    },
    {
      id: "phase-1-foundation",
      name: "Foundation",
      phase_number: 1,
      status: "planned" as const,
      description: "Core middleware, authentication, error handling, and database layer",
      gate_requirements: [
        "Auth middleware protects routes",
        "Error handler returns consistent responses",
        "Database migrations run successfully",
        "Quality scenarios SEC-01, SEC-02 verified",
      ],
    },
    {
      id: "phase-2-features",
      name: "Core API",
      phase_number: 2,
      status: "planned" as const,
      description: "Implement the primary API endpoints and business logic",
      gate_requirements: [
        "All CRUD endpoints for core resources work",
        "Input validation on all endpoints",
        "API documentation generated",
        "Test coverage meets thresholds",
      ],
    },
    {
      id: "phase-3-production",
      name: "Production Readiness",
      phase_number: 3,
      status: "planned" as const,
      description:
        "Rate limiting, logging, monitoring, performance optimization, deployment",
      gate_requirements: [
        "All quality scenarios passing",
        "Rate limiting configured",
        "Structured logging in place",
        "Production deployment successful",
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
          id: "task-0.1-init-api",
          title: "Initialize API project",
          status: "todo",
          building_block: "api-core",
          quality_scenarios: [],
          acceptance_criteria: [
            "Express/Fastify/Hono server created with TypeScript",
            "TypeScript configured in strict mode",
            "Health check endpoint responds at /health",
          ],
        },
        {
          id: "task-0.2-database",
          title: "Set up database layer",
          status: "todo",
          building_block: "data-access",
          quality_scenarios: [],
          acceptance_criteria: [
            "Database connection configured",
            "Migration system in place",
            "Connection pooling configured",
          ],
        },
        {
          id: "task-0.3-tooling",
          title: "Configure development tooling",
          status: "todo",
          quality_scenarios: ["MAINT-01"],
          acceptance_criteria: [
            "ESLint configured with recommended rules",
            "Prettier configured for consistent formatting",
            "Hot reload configured for development",
          ],
        },
        {
          id: "task-0.4-testing",
          title: "Set up testing infrastructure",
          status: "todo",
          quality_scenarios: ["MAINT-02"],
          acceptance_criteria: [
            "Vitest configured for unit tests",
            "Supertest configured for API integration tests",
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
          id: "task-1.1-auth",
          title: "Implement authentication middleware",
          status: "todo",
          building_block: "api-core",
          quality_scenarios: ["SEC-01", "SEC-02"],
          acceptance_criteria: [
            "JWT or session-based auth configured",
            "Protected route middleware working",
            "Auth tests cover happy path and edge cases",
          ],
        },
        {
          id: "task-1.2-error-handling",
          title: "Set up global error handling",
          status: "todo",
          building_block: "api-core",
          quality_scenarios: ["REL-01"],
          acceptance_criteria: [
            "Consistent error response format",
            "Unhandled errors caught and logged",
            "No stack traces leaked in production",
          ],
        },
        {
          id: "task-1.3-validation",
          title: "Set up input validation",
          status: "todo",
          building_block: "api-core",
          quality_scenarios: ["SEC-03"],
          acceptance_criteria: [
            "Request body validation with Zod or similar",
            "Query parameter validation",
            "Descriptive validation error messages",
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
  };

  return tasksByPhase[phaseId] ?? null;
}
