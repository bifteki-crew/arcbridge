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

/**
 * Resolve the layout of a service that lives in a SUBDIRECTORY, returning paths
 * relative to the repo root (which is what building-block `code_paths` are).
 *
 * `detectProjectLayout` probes the repo root, so for a monorepo service it looks
 * in entirely the wrong place — `<root>/app` rather than `<root>/frontend/app`.
 * That is why the fullstack template used to hedge and declare BOTH variants of
 * every path. A hedge is permanently wrong: `missing_module` checks each
 * code_path independently (correctly — a block owning two real directories
 * should report when one disappears), so the unused variant produced a finding
 * nobody could ever resolve.
 *
 * One path is chosen instead. When the directory does not exist yet — `init` on
 * an empty repo genuinely cannot know — the framework's own default is used, and
 * a later disagreement surfaces as a matched pair (`missing_module` on the
 * declared path plus `undocumented_module` on the real one) that says exactly
 * what to change. Wrong-and-actionable beats hedged-and-permanent.
 */
export function detectServiceLayout(
  projectRoot: string | undefined,
  servicePath: string,
): { appDir: string; componentsDir: string } {
  const prefix = servicePath.replace(/\/+$/, "");
  const under = (rel: string): string => `${prefix}/${rel}`;

  if (!projectRoot) {
    return { appDir: under("app/"), componentsDir: under("src/components/") };
  }

  const serviceRoot = join(projectRoot, prefix);
  const appDir = existsSync(join(serviceRoot, "src", "app"))
    ? under("src/app/")
    : under("app/");
  const componentsDir = existsSync(join(serviceRoot, "components"))
    && !existsSync(join(serviceRoot, "src", "components"))
    ? under("components/")
    : under("src/components/");

  return { appDir, componentsDir };
}

function detectSrcPrefix(projectRoot?: string): string {
  // No projectRoot (template preview) — default to src/ convention
  if (!projectRoot) return "src/";

  // Actual project — check what exists
  if (existsSync(join(projectRoot, "src"))) return "src/";

  // No src/ directory — use root-level paths
  return "";
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
    case "unity-game":
      return ["Assets/Scripts/Core/GameManager.cs"];
    case "angular-app":
      return [`${srcPrefix}main.ts`, `${srcPrefix}app/app.component.ts`, `${srcPrefix}app/app.routes.ts`];
    default:
      return [`${srcPrefix}index.ts`];
  }
}
