import type { InitProjectInput, TemplateOutput } from "../types.js";

function runtimeDiagram(template: string): string {
  switch (template) {
    case "dotnet-webapi":
      return `\`\`\`
Client → Kestrel → Middleware Pipeline → Controller / Endpoint
                                       → Services (DI)
                                       → Database / External APIs
\`\`\``;
    case "api-service":
      return `\`\`\`
Client → HTTP Server → Middleware → Route Handler
                                  → Services
                                  → Database / External APIs
\`\`\``;
    default:
      return `\`\`\`
Browser → Next.js Server → Layout (server) → Page (server/client)
                         → API Routes (if needed)
                         → External Services (if needed)
\`\`\``;
  }
}

export function runtimeViewsTemplate(input: InitProjectInput): TemplateOutput {
  return {
    frontmatter: {
      section: "runtime-views",
      schema_version: 1,
    },
    body: `# Runtime View

## Key Runtime Scenarios

### Request Flow

${runtimeDiagram(input.template)}

*Document your key runtime scenarios here. Each scenario should show the interaction between building blocks for an important use case of ${input.name}.*
`,
  };
}
