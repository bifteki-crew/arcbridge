export interface InitProjectInput {
  name: string;
  template: "nextjs-app-router" | "react-vite" | "api-service" | "dotnet-webapi" | "unity-game" | "angular-app";
  features: string[];
  quality_priorities: string[];
  platforms: string[];
  projectRoot?: string;
  /** For multi-project .NET solutions: services discovered from .sln */
  dotnetServices?: Array<{ name: string; path: string }>;
}

export interface TemplateOutput {
  frontmatter: Record<string, unknown>;
  body: string;
}
