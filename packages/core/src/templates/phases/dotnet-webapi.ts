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
        "Initialize ASP.NET Core project, configure DI, set up database and middleware pipeline",
      gate_requirements: [
        "Project builds and runs successfully",
        "Health check endpoint responds at /health",
        "DI container configured with core services",
        "Logging and configuration in place",
      ],
    },
    {
      id: "phase-1-foundation",
      name: "Foundation",
      phase_number: 1,
      status: "planned" as const,
      description:
        "Authentication, authorization, error handling, database access, and input validation",
      gate_requirements: [
        "Auth middleware protects endpoints",
        "Global exception handler returns ProblemDetails",
        "EF Core / Dapper data access layer works",
        "Quality scenarios SEC-01, SEC-02 verified",
      ],
    },
    {
      id: "phase-2-features",
      name: "Core API",
      phase_number: 2,
      status: "planned" as const,
      description:
        "Implement the primary API endpoints, business logic, and domain models",
      gate_requirements: [
        "All CRUD endpoints for core resources work",
        "Input validation via FluentValidation or data annotations",
        "OpenAPI/Swagger documentation generated",
        "Integration test coverage meets thresholds",
      ],
    },
    {
      id: "phase-3-production",
      name: "Production Readiness",
      phase_number: 3,
      status: "planned" as const,
      description:
        "Rate limiting, health checks, structured logging, performance optimization, deployment",
      gate_requirements: [
        "All quality scenarios passing",
        "Rate limiting configured",
        "Structured logging with Serilog or similar",
        "Docker containerization ready",
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
          id: "task-0.1-init-project",
          title: "Initialize ASP.NET Core Web API project",
          status: "todo",
          building_block: "api-host",
          quality_scenarios: [],
          acceptance_criteria: [
            "dotnet new webapi project created",
            "Program.cs configured with minimal hosting model",
            "Health check endpoint responds at /health",
          ],
        },
        {
          id: "task-0.2-di-setup",
          title: "Configure dependency injection",
          status: "todo",
          building_block: "api-host",
          quality_scenarios: ["MAINT-01"],
          acceptance_criteria: [
            "Service registration organized by feature/layer",
            "Extension methods for service groups (AddApplicationServices, AddInfrastructure)",
            "Configuration bound to strongly-typed options classes",
          ],
        },
        {
          id: "task-0.3-database",
          title: "Set up database and data access",
          status: "todo",
          building_block: "data-access",
          quality_scenarios: [],
          acceptance_criteria: [
            "EF Core or Dapper configured",
            "Database migrations in place",
            "Connection string managed via configuration",
          ],
        },
        {
          id: "task-0.4-testing",
          title: "Set up testing infrastructure",
          status: "todo",
          quality_scenarios: ["MAINT-02"],
          acceptance_criteria: [
            "xUnit or NUnit test project created",
            "WebApplicationFactory configured for integration tests",
            "Test database setup (in-memory or test container)",
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
          title: "Implement authentication and authorization",
          status: "todo",
          building_block: "auth-module",
          quality_scenarios: ["SEC-01", "SEC-02"],
          acceptance_criteria: [
            "JWT bearer or cookie auth configured",
            "Authorization policies defined",
            "Auth middleware applied to protected endpoints",
            "Auth tests cover happy path and edge cases",
          ],
        },
        {
          id: "task-1.2-error-handling",
          title: "Set up global exception handling",
          status: "todo",
          building_block: "api-host",
          quality_scenarios: ["REL-01"],
          acceptance_criteria: [
            "Exception handler middleware returns RFC 7807 ProblemDetails",
            "Unhandled exceptions logged with correlation ID",
            "No stack traces leaked in production",
          ],
        },
        {
          id: "task-1.3-validation",
          title: "Set up input validation",
          status: "todo",
          building_block: "api-host",
          quality_scenarios: ["SEC-03"],
          acceptance_criteria: [
            "FluentValidation or data annotations configured",
            "Validation filter returns 400 with details",
            "Descriptive validation error messages",
          ],
        },
        {
          id: "task-1.4-middleware",
          title: "Configure middleware pipeline",
          status: "todo",
          building_block: "middleware",
          quality_scenarios: [],
          acceptance_criteria: [
            "CORS policy configured",
            "Request/response logging middleware",
            "Middleware order documented",
          ],
        },
      ],
    },
  };

  return tasksByPhase[phaseId] ?? null;
}
