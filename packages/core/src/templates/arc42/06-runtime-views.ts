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
    case "unity-game":
      return `\`\`\`
Input System → Player Controller → Gameplay Systems
                                 → Physics / Collision
GameManager → State Machine → Active Game Systems
                            → UI Framework
                            → Audio System
Unity Engine → Update Loop → Render Pipeline
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

### ${input.template === "unity-game" ? "Game Loop" : "Request Flow"}

${runtimeDiagram(input.template)}

*Document your key runtime scenarios here. Each scenario should show the interaction between building blocks for an important use case of ${input.name}.*
`,
  };
}
