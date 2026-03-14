import type { InitProjectInput, TemplateOutput } from "../types.js";

export function deploymentTemplate(input: InitProjectInput): TemplateOutput {
  return {
    frontmatter: {
      section: "deployment",
      schema_version: 1,
    },
    body: `# Deployment View

## Infrastructure

*Describe the deployment infrastructure for ${input.name}.*

### Deployment Options

${input.template === "dotnet-webapi" ? `| Platform | Description | Notes |
|----------|-------------|-------|
| Azure App Service | Managed PaaS for .NET | Recommended for ASP.NET Core |
| Docker / Kubernetes | Container-based | For self-hosted or multi-cloud |
| AWS ECS / Fargate | Container orchestration | For AWS environments |` : `| Platform | Description | Notes |
|----------|-------------|-------|
| Vercel | Recommended for Next.js | Zero-config deployment |
| Docker | Container-based | For self-hosted environments |`}

## Environment Configuration

| Variable | Description | Required |
|----------|-------------|----------|
| \`${input.template === "dotnet-webapi" ? "ASPNETCORE_ENVIRONMENT" : "NODE_ENV"}\` | Runtime environment | Yes |
| *Add your environment variables here* | | |
`,
  };
}
