export interface InitProjectInput {
  name: string;
  template: "nextjs-app-router" | "react-vite" | "api-service";
  features: string[];
  quality_priorities: string[];
  platforms: string[];
  projectRoot?: string;
}

export interface TemplateOutput {
  frontmatter: Record<string, unknown>;
  body: string;
}
