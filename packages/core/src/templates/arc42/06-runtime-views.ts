import type { InitProjectInput, TemplateOutput } from "../types.js";

export function runtimeViewsTemplate(input: InitProjectInput): TemplateOutput {
  return {
    frontmatter: {
      section: "runtime-views",
      schema_version: 1,
    },
    body: `# Runtime View

## Key Runtime Scenarios

### Page Load Flow

\`\`\`
Browser → Next.js Server → Layout (server) → Page (server/client)
                         → API Routes (if needed)
                         → External Services (if needed)
\`\`\`

*Document your key runtime scenarios here. Each scenario should show the interaction between building blocks for an important use case of ${input.name}.*
`,
  };
}
