import type { InitProjectInput, TemplateOutput } from "../types.js";

export function solutionStrategyTemplate(input: InitProjectInput): TemplateOutput {
  return {
    frontmatter: {
      section: "solution-strategy",
      schema_version: 1,
    },
    body: `# Solution Strategy

Document the fundamental decisions and solution approaches that drive the architecture of ${input.name}. This section explains *why* the architecture looks the way it does — connecting quality goals to technical decisions.

## Technology Decisions

| Decision | Rationale | Quality Goal |
|----------|-----------|-------------|
| *e.g., Use TypeScript* | *Type safety reduces runtime errors* | *Reliability, Maintainability* |
| *e.g., Use SQLite for local storage* | *Zero-config, no external service dependency* | *Maintainability* |

## Architecture Approach

*Describe the high-level architecture pattern and why it was chosen.*

- *e.g., Layered architecture with clear module boundaries (enforced by ArcBridge building blocks)*
- *e.g., YAML as source of truth, DB as queryable cache — enables version control and human readability*

## Quality Goal Strategies

| Quality Goal | Strategy |
|-------------|----------|
${input.quality_priorities.map((q) => `| ${q} | *How will you achieve ${q}?* |`).join("\n")}

## Decomposition Approach

*How is the system broken down into building blocks? What principles guide the decomposition?*

- *e.g., Feature-based: each major feature is a building block with clear interfaces*
- *e.g., Layer-based: presentation, business logic, data access*
`,
  };
}
