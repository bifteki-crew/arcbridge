import type { InitProjectInput, TemplateOutput } from "../types.js";

export function firstAdrTemplate(input: InitProjectInput): TemplateOutput {
  const now = new Date().toISOString().split("T")[0]!;

  return {
    frontmatter: {
      id: "001-nextjs-app-router",
      title: "Use Next.js App Router",
      status: "accepted",
      date: now,
      affected_blocks: ["app-shell"],
      affected_files: ["app/"],
      quality_scenarios: [],
    },
    body: `# ADR-001: Use Next.js App Router

## Context

${input.name} needs a modern React framework that supports server-side rendering, static generation, and API routes.

## Decision

Use Next.js with the App Router (introduced in Next.js 13+) as the application framework.

## Consequences

- **Positive:** Server Components by default reduce client-side JavaScript
- **Positive:** File-based routing with layouts, loading states, and error boundaries
- **Positive:** Built-in API routes for backend logic
- **Negative:** App Router has a learning curve compared to Pages Router
- **Negative:** Some libraries may not yet fully support Server Components
`,
  };
}
