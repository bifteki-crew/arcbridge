import { existsSync } from "node:fs";
import { join } from "node:path";

export interface ProjectLayout {
  /** Prefix for general source files: "src/" or "" */
  srcPrefix: string;
  /** Prefix for Next.js app router files. Only meaningful for nextjs-app-router template. */
  appPrefix: string;
  /** Entrypoint files for the project (template-dependent) */
  entrypoints: string[];
}

/**
 * Detect the project's directory layout from actual filesystem structure and template.
 * Used by arc42 templates to generate consistent code_paths.
 *
 * srcPrefix detection:
 * 1. src/ exists → "src/"
 * 2. No src/ but projectRoot provided → "" (root-level layout)
 * 3. No projectRoot → "src/" (default convention for new projects)
 *
 * appPrefix is only relevant for nextjs-app-router. For other templates
 * it defaults to srcPrefix + "app" but should not be used for building blocks.
 */
export function detectProjectLayout(
  projectRoot?: string,
  template?: string,
): ProjectLayout {
  const srcPrefix = detectSrcPrefix(projectRoot);
  const appPrefix = detectAppPrefix(projectRoot, srcPrefix);

  // Template-specific entrypoints
  const entrypoints = getEntrypoints(template ?? "nextjs-app-router", srcPrefix, appPrefix);

  return { srcPrefix, appPrefix, entrypoints };
}

function detectSrcPrefix(projectRoot?: string): string {
  if (!projectRoot) return "src/";

  if (existsSync(join(projectRoot, "src"))) return "src/";

  // Empty or root-level project — default to src/ convention
  // (frameworks like Next.js, Vite, CRA scaffold src/ by default)
  return "src/";
}

function detectAppPrefix(projectRoot: string | undefined, srcPrefix: string): string {
  if (!projectRoot) return `${srcPrefix}app`;

  // Check actual directories for Next.js app router
  if (existsSync(join(projectRoot, "src", "app"))) return "src/app";
  if (existsSync(join(projectRoot, "app"))) return "app";

  // Default follows srcPrefix
  return `${srcPrefix}app`;
}

function getEntrypoints(template: string, srcPrefix: string, appPrefix: string): string[] {
  switch (template) {
    case "nextjs-app-router":
      return [`${appPrefix}/layout.tsx`, `${appPrefix}/page.tsx`];
    case "react-vite":
      return [`${srcPrefix}main.tsx`, `${srcPrefix}App.tsx`];
    case "api-service":
      return [`${srcPrefix}index.ts`, `${srcPrefix}app.ts`, `${srcPrefix}server.ts`];
    default:
      return [`${srcPrefix}index.ts`];
  }
}
