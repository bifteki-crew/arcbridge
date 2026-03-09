import type { InitProjectInput, TemplateOutput } from "../types.js";

export function risksDebtTemplate(input: InitProjectInput): TemplateOutput {
  return {
    frontmatter: {
      section: "risks-debt",
      schema_version: 1,
    },
    body: `# Risks and Technical Debt

## Known Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| *Identify project risks* | *High/Medium/Low* | *High/Medium/Low* | *Describe mitigation* |

## Technical Debt

Track technical debt items for ${input.name} here. Each item should include:
- **Description**: What the debt is
- **Impact**: How it affects the system
- **Effort**: Estimated effort to resolve
- **Priority**: When it should be addressed
`,
  };
}
