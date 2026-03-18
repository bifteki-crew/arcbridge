import type { InitProjectInput, TemplateOutput } from "../types.js";
import { detectProjectLayout } from "./detect-layout.js";

interface AdrResult extends TemplateOutput {
  filename: string;
}

export function firstAdrTemplate(input: InitProjectInput): AdrResult {
  const now = new Date().toISOString().split("T")[0]!;

  if (input.template === "dotnet-webapi") {
    return dotnetAdr(input, now);
  }

  return nextjsAdr(input, now);
}

function nextjsAdr(input: InitProjectInput, date: string): AdrResult {
  const { appPrefix } = detectProjectLayout(input.projectRoot);

  return {
    filename: "001-nextjs-app-router.md",
    frontmatter: {
      id: "001-nextjs-app-router",
      title: "Use Next.js App Router",
      status: "accepted",
      date,
      affected_blocks: ["app-shell"],
      affected_files: [`${appPrefix}/`],
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

function dotnetAdr(input: InitProjectInput, date: string): AdrResult {
  return {
    filename: "001-aspnet-core-webapi.md",
    frontmatter: {
      id: "001-aspnet-core-webapi",
      title: "Use ASP.NET Core Web API",
      status: "accepted",
      date,
      affected_blocks: ["api-host", "controllers"],
      affected_files: ["Program.cs", "Controllers/"],
      quality_scenarios: [],
    },
    body: `# ADR-001: Use ASP.NET Core Web API

## Context

${input.name} needs a performant, cross-platform web API framework with strong dependency injection, middleware pipeline, and ecosystem support.

## Decision

Use ASP.NET Core with the minimal hosting model (top-level Program.cs) as the API framework. Support both controller-based and minimal API endpoints.

## Consequences

- **Positive:** High performance with Kestrel, mature ecosystem
- **Positive:** Built-in DI container, configuration, and middleware pipeline
- **Positive:** Strong typing and compile-time safety with C#
- **Positive:** OpenAPI/Swagger generation out of the box
- **Negative:** Steeper learning curve for the DI and middleware patterns
- **Negative:** Larger memory footprint compared to minimal frameworks
`,
  };
}
