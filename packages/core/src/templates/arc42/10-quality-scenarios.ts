import type { InitProjectInput } from "../types.js";
import type { QualityScenariosFile } from "../../schemas/quality-scenarios.js";

const SCENARIO_LIBRARY: Record<string, QualityScenariosFile["scenarios"]> = {
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
    (q) => SCENARIO_LIBRARY[q] ?? [],
  );

  return {
    schema_version: 1,
    last_updated: now,
    quality_goals: goals,
    scenarios,
  };
}
