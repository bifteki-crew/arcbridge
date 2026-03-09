import type { InitProjectInput, TemplateOutput } from "../types.js";

export function contextTemplate(input: InitProjectInput): TemplateOutput {
  return {
    frontmatter: {
      section: "context",
      schema_version: 1,
    },
    body: `# System Scope and Context

## Business Context

${input.name} interacts with the following external systems and actors:

| Neighbor | Description | Interface |
|----------|-------------|-----------|
| End User | Application user | Browser / HTTP |
| *External API* | *Describe external dependencies* | *REST / GraphQL* |

## Technical Context

\`\`\`
[Browser] --HTTP/HTTPS--> [${input.name}] --API--> [External Services]
\`\`\`

### Technology Stack

- **Framework:** Next.js (App Router)
- **Language:** TypeScript
- **Runtime:** Node.js
`,
  };
}
