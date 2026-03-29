import type { InitProjectInput, TemplateOutput } from "../types.js";

function techStack(template: string): string {
  switch (template) {
    case "dotnet-webapi":
      return `- **Framework:** ASP.NET Core
- **Language:** C#
- **Runtime:** .NET`;
    case "react-vite":
      return `- **Framework:** React (Vite)
- **Language:** TypeScript
- **Runtime:** Node.js`;
    case "api-service":
      return `- **Framework:** Express / Fastify
- **Language:** TypeScript
- **Runtime:** Node.js`;
    case "unity-game":
      return `- **Engine:** Unity
- **Language:** C#
- **Runtime:** Mono / IL2CPP`;
    default:
      return `- **Framework:** Next.js (App Router)
- **Language:** TypeScript
- **Runtime:** Node.js`;
  }
}

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

${techStack(input.template)}
`,
  };
}
