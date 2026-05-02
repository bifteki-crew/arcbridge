import type { PhasesFile, TaskFile } from "../../schemas/phases.js";
import type { InitProjectInput } from "../types.js";

export function phasePlanTemplate(_input: InitProjectInput): PhasesFile {
  const phases = [
    {
      id: "phase-0-setup",
      name: "Monorepo Setup",
      phase_number: 0,
      status: "planned" as const,
      description:
        "Initialize monorepo structure, scaffold Next.js frontend and .NET API backend, configure shared tooling",
      gate_requirements: [
        "Monorepo structure with frontend/ and api/ directories",
        "Next.js app builds and runs at localhost:3000",
        ".NET API builds and runs with health check at /health",
        "Shared dev scripts (start, build, test) work from root",
      ],
    },
    {
      id: "phase-1-api-foundation",
      name: "API Foundation",
      phase_number: 1,
      status: "planned" as const,
      description:
        "Build .NET API controllers, services, authentication middleware, and database access layer",
      gate_requirements: [
        "Auth middleware protects API endpoints",
        "Global exception handler returns ProblemDetails",
        "Database access layer configured with migrations",
        "OpenAPI/Swagger documentation generated",
        "Quality scenarios SEC-01, SEC-02 verified",
      ],
    },
    {
      id: "phase-2-frontend-foundation",
      name: "Frontend Foundation",
      phase_number: 2,
      status: "planned" as const,
      description:
        "Build Next.js layouts, reusable components, API client layer, and authentication UI",
      gate_requirements: [
        "App shell with layout and navigation working",
        "API client layer communicates with .NET backend",
        "Auth UI (login, register, protected routes) functional",
        "Component library with consistent styling",
        "Quality scenarios A11Y-01, PERF-01 verified",
      ],
    },
    {
      id: "phase-3-feature-integration",
      name: "Feature Integration",
      phase_number: 3,
      status: "planned" as const,
      description:
        "Implement end-to-end features across frontend and backend, API contract synchronization, and shared types",
      gate_requirements: [
        "At least one full CRUD feature works end-to-end",
        "API contracts validated between frontend and backend",
        "Shared type definitions keep frontend and API in sync",
        "Integration tests cover cross-service workflows",
      ],
    },
    {
      id: "phase-4-production",
      name: "Production Readiness",
      phase_number: 4,
      status: "planned" as const,
      description:
        "CI/CD pipeline, deployment configuration, monitoring, and performance optimization",
      gate_requirements: [
        "CI pipeline builds and tests both services",
        "Docker Compose or equivalent runs the full stack",
        "Rate limiting and CORS configured for production",
        "All quality scenarios passing",
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
          id: "task-0.1-monorepo-structure",
          title: "Set up monorepo structure with frontend and api directories",
          status: "todo",
          building_block: "frontend-shell",
          quality_scenarios: [],
          acceptance_criteria: [
            "Root package.json with workspace scripts",
            "frontend/ directory with Next.js app (App Router)",
            "api/ directory with ASP.NET Core Web API project",
            "Shared .editorconfig and linting configuration",
          ],
        },
        {
          id: "task-0.2-frontend-scaffold",
          title: "Scaffold Next.js frontend with App Router",
          status: "todo",
          building_block: "frontend-shell",
          quality_scenarios: ["MAINT-01"],
          acceptance_criteria: [
            "Next.js app created with TypeScript and App Router",
            "Root layout with metadata and font configuration",
            "Landing page renders at localhost:3000",
            "ESLint and Prettier configured",
          ],
        },
        {
          id: "task-0.3-api-scaffold",
          title: "Scaffold .NET API with health check",
          status: "todo",
          building_block: "api-controllers",
          quality_scenarios: [],
          acceptance_criteria: [
            "ASP.NET Core Web API project created",
            "Health check endpoint responds at /health",
            "DI container configured with core services",
            "Logging and configuration in place",
          ],
        },
        {
          id: "task-0.4-shared-tooling",
          title: "Configure shared development tooling and scripts",
          status: "todo",
          building_block: "shared-contracts",
          quality_scenarios: ["MAINT-02"],
          acceptance_criteria: [
            "Root-level scripts to start, build, and test both services",
            "Shared TypeScript types or OpenAPI contract directory",
            "Testing infrastructure for both frontend and backend",
            "Git hooks for linting and formatting",
          ],
        },
      ],
    },
    "phase-1-api-foundation": {
      schema_version: 1,
      phase_id: "phase-1-api-foundation",
      tasks: [
        {
          id: "task-1.1-api-auth",
          title: "Implement API authentication and authorization",
          status: "todo",
          building_block: "api-services",
          quality_scenarios: ["SEC-01", "SEC-02"],
          acceptance_criteria: [
            "JWT bearer auth configured in .NET API",
            "Authorization policies defined for role-based access",
            "Auth middleware applied to protected endpoints",
            "Token validation and refresh logic implemented",
          ],
        },
        {
          id: "task-1.2-api-controllers",
          title: "Build core API controllers and endpoints",
          status: "todo",
          building_block: "api-controllers",
          quality_scenarios: ["SEC-03"],
          acceptance_criteria: [
            "RESTful controllers for core resources",
            "Input validation via FluentValidation or data annotations",
            "Consistent response format with ProblemDetails for errors",
            "OpenAPI/Swagger documentation generated and accessible",
          ],
        },
        {
          id: "task-1.3-api-services",
          title: "Implement business logic and service layer",
          status: "todo",
          building_block: "api-services",
          quality_scenarios: ["MAINT-01"],
          acceptance_criteria: [
            "Service classes encapsulate business logic",
            "Repository pattern for data access",
            "EF Core or Dapper configured with migrations",
            "Unit tests cover service layer logic",
          ],
        },
        {
          id: "task-1.4-api-middleware",
          title: "Configure middleware pipeline and error handling",
          status: "todo",
          building_block: "api-controllers",
          quality_scenarios: ["REL-01"],
          acceptance_criteria: [
            "Global exception handler returns RFC 7807 ProblemDetails",
            "Request/response logging with correlation IDs",
            "CORS policy configured for frontend origin",
            "No stack traces leaked in production",
          ],
        },
      ],
    },
    "phase-2-frontend-foundation": {
      schema_version: 1,
      phase_id: "phase-2-frontend-foundation",
      tasks: [
        {
          id: "task-2.1-frontend-layout",
          title: "Build app shell with layouts and navigation",
          status: "todo",
          building_block: "frontend-shell",
          quality_scenarios: ["A11Y-01"],
          acceptance_criteria: [
            "Root layout with header, sidebar, and main content area",
            "Navigation component with active state indicators",
            "Responsive layout that works on mobile and desktop",
            "Loading and error boundary components",
          ],
        },
        {
          id: "task-2.2-frontend-components",
          title: "Create reusable UI component library",
          status: "todo",
          building_block: "frontend-components",
          quality_scenarios: ["A11Y-02"],
          acceptance_criteria: [
            "Button, Input, Card, Modal, and Table components",
            "Consistent styling with design tokens or Tailwind",
            "All components meet WCAG 2.1 AA accessibility",
            "Component documentation or Storybook setup",
          ],
        },
        {
          id: "task-2.3-api-client",
          title: "Build API client layer for backend communication",
          status: "todo",
          building_block: "shared-contracts",
          quality_scenarios: ["REL-01"],
          acceptance_criteria: [
            "Typed API client generated from OpenAPI spec or manually defined",
            "Error handling with user-friendly messages",
            "Auth token injection in request headers",
            "Request/response interceptors for logging and retry",
          ],
        },
        {
          id: "task-2.4-frontend-auth",
          title: "Implement frontend authentication UI and flow",
          status: "todo",
          building_block: "frontend-shell",
          quality_scenarios: ["SEC-01"],
          acceptance_criteria: [
            "Login and registration pages",
            "Protected route middleware or layout",
            "Token storage and refresh handling",
            "Auth state management (context or store)",
          ],
        },
      ],
    },
    "phase-3-feature-integration": {
      schema_version: 1,
      phase_id: "phase-3-feature-integration",
      tasks: [
        {
          id: "task-3.1-e2e-feature",
          title: "Implement first end-to-end CRUD feature",
          status: "todo",
          building_block: "api-controllers",
          quality_scenarios: ["PERF-02"],
          acceptance_criteria: [
            "Full CRUD operations from frontend through API to database",
            "Optimistic UI updates where appropriate",
            "Server-side validation reflected in frontend forms",
            "List, detail, create, edit, and delete views working",
          ],
        },
        {
          id: "task-3.2-contract-sync",
          title: "Set up API contract synchronization",
          status: "todo",
          building_block: "shared-contracts",
          quality_scenarios: ["MAINT-01"],
          acceptance_criteria: [
            "OpenAPI spec or shared type definitions in contracts directory",
            "Frontend types generated from or validated against API contract",
            "CI check prevents contract drift between frontend and backend",
            "Documentation for updating contracts when API changes",
          ],
        },
        {
          id: "task-3.3-integration-tests",
          title: "Write cross-service integration tests",
          status: "todo",
          building_block: "shared-contracts",
          quality_scenarios: ["MAINT-02"],
          acceptance_criteria: [
            "Integration tests exercise frontend-to-API workflows",
            "Test environment starts both services",
            "Auth flow tested end-to-end",
            "Error scenarios covered (API down, validation failures)",
          ],
        },
      ],
    },
    "phase-4-production": {
      schema_version: 1,
      phase_id: "phase-4-production",
      tasks: [
        {
          id: "task-4.1-ci-cd",
          title: "Set up CI/CD pipeline for both services",
          status: "todo",
          quality_scenarios: ["MAINT-02"],
          acceptance_criteria: [
            "CI builds and tests both frontend and API",
            "Lint, type-check, and test steps for each service",
            "Build artifacts produced for deployment",
            "Pipeline fails fast on errors",
          ],
        },
        {
          id: "task-4.2-deployment",
          title: "Configure deployment for full stack",
          status: "todo",
          quality_scenarios: ["REL-01"],
          acceptance_criteria: [
            "Docker Compose for local full-stack development",
            "Dockerfiles for frontend and API",
            "Environment-specific configuration (dev, staging, prod)",
            "Database migration runs as part of deployment",
          ],
        },
        {
          id: "task-4.3-monitoring",
          title: "Add monitoring, logging, and rate limiting",
          status: "todo",
          building_block: "api-services",
          quality_scenarios: ["PERF-02", "SEC-04"],
          acceptance_criteria: [
            "Structured logging in API with Serilog or similar",
            "Frontend error tracking (Sentry or similar)",
            "Rate limiting configured on API endpoints",
            "Health check dashboard or monitoring alerts",
          ],
        },
        {
          id: "task-4.4-performance",
          title: "Optimize performance across the stack",
          status: "todo",
          building_block: "frontend-shell",
          quality_scenarios: ["PERF-01", "PERF-03"],
          acceptance_criteria: [
            "Frontend bundle size optimized (code splitting, tree shaking)",
            "API response times meet p95 < 200ms target",
            "Database queries optimized with proper indexing",
            "Static assets cached with appropriate headers",
          ],
        },
      ],
    },
  };

  return tasksByPhase[phaseId] ?? null;
}
