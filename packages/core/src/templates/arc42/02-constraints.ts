import type { InitProjectInput, TemplateOutput } from "../types.js";

export function constraintsTemplate(input: InitProjectInput): TemplateOutput {
  return {
    frontmatter: {
      section: "constraints",
      schema_version: 1,
    },
    body: `# Architecture Constraints

Document the constraints that shape architectural decisions for ${input.name}. Constraints are non-negotiable requirements from the environment — they are not chosen, they are given.

## Technical Constraints

| Constraint | Description |
|-----------|-------------|
| *e.g., Must run on Node.js 22+* | *Explain why this constraint exists* |
| *e.g., No native dependencies* | *Required for CI/CD compatibility* |

## Organizational Constraints

| Constraint | Description |
|-----------|-------------|
| *e.g., Team of 1-2 developers* | *Impacts architecture complexity budget* |
| *e.g., Must ship MVP in 4 weeks* | *Impacts scope and technology choices* |

## Legal / Compliance Constraints

| Constraint | Description |
|-----------|-------------|
| *e.g., GDPR compliance required* | *Impacts data storage and processing* |
| *e.g., MIT-compatible dependencies only* | *Impacts library selection* |
`,
  };
}
