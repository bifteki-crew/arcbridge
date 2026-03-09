export interface InitProjectInput {
  name: string;
  template: "nextjs-app-router";
  features: string[];
  quality_priorities: string[];
  platforms: string[];
}

export interface TemplateOutput {
  frontmatter: Record<string, unknown>;
  body: string;
}
