import type { InitProjectInput, TemplateOutput } from "../types.js";

export function introductionTemplate(input: InitProjectInput): TemplateOutput {
  return {
    frontmatter: {
      section: "introduction",
      schema_version: 1,
    },
    body: `# Introduction and Goals

## Requirements Overview

${input.name} is a ${input.template === "nextjs-app-router" ? "Next.js application using the App Router" : input.template === "dotnet-webapi" ? "ASP.NET Core Web API" : "web application"}.

### Key Features

${input.features.length > 0 ? input.features.map((f) => `- ${f}`).join("\n") : "- *Define your key features here*"}

## Quality Goals

| Priority | Goal | Description |
|----------|------|-------------|
${input.quality_priorities.map((q, i) => `| ${i + 1} | ${q} | *Describe what ${q} means for this project* |`).join("\n")}

## Stakeholders

| Role | Description | Expectations |
|------|-------------|--------------|
| Developer | Primary developer | Efficient development workflow with AI assistance |
| End User | Application user | *Define user expectations* |
`,
  };
}
