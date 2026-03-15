import type { InitProjectInput } from "../types.js";
import type { QualityScenariosFile } from "../../schemas/quality-scenarios.js";

type ScenarioList = QualityScenariosFile["scenarios"];

// ─── Shared scenarios (all templates) ───────────────────────────────────────

const SHARED_SCENARIOS: Record<string, ScenarioList> = {
  security: [
    {
      id: "SEC-01",
      name: "Auth on all API routes",
      category: "security",
      priority: "must",
      scenario:
        "An unauthenticated request hits any API route that requires auth",
      expected: "Returns 401 Unauthorized without leaking data",
      linked_code: [],
      linked_tests: [],
      linked_blocks: [],
      verification: "automatic",
      status: "untested",
    },
    {
      id: "SEC-03",
      name: "Input validation on mutations",
      category: "security",
      priority: "must",
      scenario: "A malformed or malicious payload is sent to any mutation endpoint",
      expected: "Input is validated and rejected with a descriptive error",
      linked_code: [],
      linked_tests: [],
      linked_blocks: [],
      verification: "automatic",
      status: "untested",
    },
  ],
  performance: [
    {
      id: "PERF-02",
      name: "API responses under 200ms",
      category: "performance",
      priority: "should",
      scenario: "Any API endpoint is called under normal load",
      expected: "p95 response time is under 200ms",
      linked_code: [],
      linked_tests: [],
      linked_blocks: [],
      verification: "automatic",
      status: "untested",
    },
  ],
  reliability: [
    {
      id: "REL-01",
      name: "Graceful error handling",
      category: "reliability",
      priority: "should",
      scenario: "An external service returns an error or times out",
      expected: "User sees a meaningful error message, app remains functional",
      linked_code: [],
      linked_tests: [],
      linked_blocks: [],
      verification: "automatic",
      status: "untested",
    },
  ],
  maintainability: [
    {
      id: "MAINT-01",
      name: "No circular dependencies",
      category: "maintainability",
      priority: "must",
      scenario: "Dependency graph is analyzed",
      expected: "No circular import chains exist",
      linked_code: [],
      linked_tests: [],
      linked_blocks: [],
      verification: "automatic",
      status: "untested",
    },
    {
      id: "MAINT-02",
      name: "Test coverage on business logic",
      category: "maintainability",
      priority: "should",
      scenario: "Test coverage report is generated",
      expected: "Business logic modules have >80% line coverage",
      linked_code: [],
      linked_tests: [],
      linked_blocks: [],
      verification: "automatic",
      status: "untested",
    },
  ],
};

// ─── Frontend-specific scenarios (nextjs, react-vite) ───────────────────────

const FRONTEND_SCENARIOS: Record<string, ScenarioList> = {
  security: [
    {
      id: "SEC-02",
      name: "No secrets in client bundles",
      category: "security",
      priority: "must",
      scenario: "Client-side JavaScript bundle is analyzed",
      expected:
        "No API keys, tokens, or secrets are found in client-side code",
      linked_code: [],
      linked_tests: [],
      linked_blocks: [],
      verification: "automatic",
      status: "untested",
    },
  ],
  performance: [
    {
      id: "PERF-01",
      name: "Initial page load under 3s",
      category: "performance",
      priority: "should",
      scenario: "User loads the landing page on a 3G connection",
      expected: "Largest Contentful Paint (LCP) is under 3 seconds",
      linked_code: [],
      linked_tests: [],
      linked_blocks: [],
      verification: "semi-automatic",
      status: "untested",
    },
  ],
  accessibility: [
    {
      id: "A11Y-01",
      name: "WCAG 2.1 AA compliance",
      category: "accessibility",
      priority: "should",
      scenario: "All pages are audited with axe-core",
      expected: "No critical or serious accessibility violations",
      linked_code: [],
      linked_tests: [],
      linked_blocks: [],
      verification: "semi-automatic",
      status: "untested",
    },
    {
      id: "A11Y-02",
      name: "Keyboard navigation",
      category: "accessibility",
      priority: "should",
      scenario: "User navigates the entire application using only keyboard",
      expected: "All interactive elements are reachable and operable via keyboard",
      linked_code: [],
      linked_tests: [],
      linked_blocks: [],
      verification: "manual",
      status: "untested",
    },
  ],
};

// ─── .NET-specific scenarios ────────────────────────────────────────────────

const DOTNET_SCENARIOS: Record<string, ScenarioList> = {
  security: [
    {
      id: "SEC-02",
      name: "No secrets in configuration or source",
      category: "security",
      priority: "must",
      scenario: "Source code and appsettings files are scanned",
      expected:
        "No connection strings, API keys, or secrets are hardcoded; all sensitive values come from environment variables or a secrets manager",
      linked_code: [],
      linked_tests: [],
      linked_blocks: [],
      verification: "automatic",
      status: "untested",
    },
    {
      id: "SEC-04",
      name: "CORS policy restricts origins",
      category: "security",
      priority: "should",
      scenario: "A cross-origin request is made from an untrusted domain",
      expected: "Request is rejected by CORS middleware; only explicitly allowed origins succeed",
      linked_code: [],
      linked_tests: [],
      linked_blocks: [],
      verification: "automatic",
      status: "untested",
    },
  ],
  performance: [
    {
      id: "PERF-01",
      name: "Startup time under 5s",
      category: "performance",
      priority: "should",
      scenario: "Application starts from cold (e.g., container restart or deployment)",
      expected: "Health check endpoint responds within 5 seconds of process start",
      linked_code: [],
      linked_tests: [],
      linked_blocks: [],
      verification: "semi-automatic",
      status: "untested",
    },
    {
      id: "PERF-03",
      name: "No excessive memory allocation",
      category: "performance",
      priority: "should",
      scenario: "API handles sustained load of 100 concurrent requests over 60 seconds",
      expected: "No Gen2 GC collections triggered; working set stays under configured limit",
      linked_code: [],
      linked_tests: [],
      linked_blocks: [],
      verification: "semi-automatic",
      status: "untested",
    },
    {
      id: "PERF-04",
      name: "Async all the way",
      category: "performance",
      priority: "must",
      scenario: "I/O-bound operations (database, HTTP calls, file access) are reviewed",
      expected: "All I/O operations use async/await; no sync-over-async or blocking calls on thread pool threads",
      linked_code: [],
      linked_tests: [],
      linked_blocks: [],
      verification: "semi-automatic",
      status: "untested",
    },
  ],
  reliability: [
    {
      id: "REL-02",
      name: "Health check covers dependencies",
      category: "reliability",
      priority: "should",
      scenario: "Orchestrator calls the /health endpoint",
      expected: "Returns degraded or unhealthy if database or critical external service is unreachable",
      linked_code: [],
      linked_tests: [],
      linked_blocks: [],
      verification: "automatic",
      status: "untested",
    },
    {
      id: "REL-03",
      name: "Structured logging with correlation",
      category: "reliability",
      priority: "should",
      scenario: "A request flows through multiple layers (controller → service → repository)",
      expected: "All log entries share a correlation ID; logs are structured JSON with severity, timestamp, and context",
      linked_code: [],
      linked_tests: [],
      linked_blocks: [],
      verification: "semi-automatic",
      status: "untested",
    },
  ],
  maintainability: [
    {
      id: "MAINT-03",
      name: "DI registration matches interfaces",
      category: "maintainability",
      priority: "should",
      scenario: "Dependency injection container is validated at startup",
      expected: "All constructor-injected interfaces have a registered implementation; no runtime resolution failures",
      linked_code: [],
      linked_tests: [],
      linked_blocks: [],
      verification: "automatic",
      status: "untested",
    },
  ],
};

// ─── API-only scenarios (api-service) ───────────────────────────────────────

const API_SCENARIOS: Record<string, ScenarioList> = {
  security: [
    {
      id: "SEC-02",
      name: "No secrets in environment or source",
      category: "security",
      priority: "must",
      scenario: "Source code and config files are scanned",
      expected:
        "No API keys, tokens, or secrets are hardcoded; all come from environment variables",
      linked_code: [],
      linked_tests: [],
      linked_blocks: [],
      verification: "automatic",
      status: "untested",
    },
  ],
};

// ─── Template → scenario set mapping ────────────────────────────────────────

const TEMPLATE_SCENARIOS: Record<string, Record<string, ScenarioList>> = {
  "nextjs-app-router": FRONTEND_SCENARIOS,
  "react-vite": FRONTEND_SCENARIOS,
  "api-service": API_SCENARIOS,
  "dotnet-webapi": DOTNET_SCENARIOS,
};

/**
 * Merge shared + template-specific scenarios for a given category.
 * Template-specific scenarios with the same ID override shared ones.
 */
function mergeScenarios(
  template: string,
  category: string,
): ScenarioList {
  const shared = SHARED_SCENARIOS[category] ?? [];
  const specific = (TEMPLATE_SCENARIOS[template] ?? {})[category] ?? [];

  // Template-specific scenarios override shared ones with the same ID
  const specificIds = new Set(specific.map((s) => s.id));
  const merged = shared.filter((s) => !specificIds.has(s.id));
  return [...merged, ...specific];
}

export function qualityScenariosTemplate(
  input: InitProjectInput,
): QualityScenariosFile {
  const now = new Date().toISOString();

  const goals = input.quality_priorities.map((q, i) => ({
    id: q as QualityScenariosFile["quality_goals"][number]["id"],
    priority: i + 1,
    description: `${q.charAt(0).toUpperCase() + q.slice(1)} is a priority for ${input.name}`,
  }));

  const scenarios = input.quality_priorities.flatMap(
    (q) => mergeScenarios(input.template, q),
  );

  return {
    schema_version: 1,
    last_updated: now,
    quality_goals: goals,
    scenarios,
  };
}
