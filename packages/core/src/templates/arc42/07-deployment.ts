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

${input.template === "angular-app" ? `| Platform | Description | Notes |
|----------|-------------|-------|
| Vercel / Netlify | Static hosting | For SSG or prerendered apps |
| Firebase Hosting | Google Cloud | Integrated with Angular Fire |
| Docker | Container-based | For self-hosted environments |
| Cloud Run / App Engine | Google Cloud PaaS | For SSR with Angular Universal |` : input.template === "dotnet-webapi" ? `| Platform | Description | Notes |
|----------|-------------|-------|
| Azure App Service | Managed PaaS for .NET | Recommended for ASP.NET Core |
| Docker / Kubernetes | Container-based | For self-hosted or multi-cloud |
| AWS ECS / Fargate | Container orchestration | For AWS environments |` : input.template === "unity-game" ? `| Platform | Description | Notes |
|----------|-------------|-------|
| Steam | PC distribution | Recommended for indie games |
| Apple App Store | iOS distribution | Requires Xcode build |
| Google Play | Android distribution | For mobile games |
| WebGL | Browser-based | For quick prototypes and web distribution |
| Console | PlayStation, Xbox, Switch | Requires platform-specific SDKs |` : `| Platform | Description | Notes |
|----------|-------------|-------|
| Vercel | Recommended for Next.js | Zero-config deployment |
| Docker | Container-based | For self-hosted environments |`}

## Environment Configuration

| Variable | Description | Required |
|----------|-------------|----------|
| \`${input.template === "dotnet-webapi" ? "ASPNETCORE_ENVIRONMENT" : input.template === "unity-game" ? "UNITY_TARGET_PLATFORM" : input.template === "angular-app" ? "NG_ENV" : "NODE_ENV"}\` | ${input.template === "unity-game" ? "Build target platform" : "Runtime environment"} | Yes |
| *Add your environment variables here* | | |
`,
  };
}
