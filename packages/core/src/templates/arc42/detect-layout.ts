import { existsSync } from "node:fs";
import { join } from "node:path";

export interface ProjectLayout {
  /** Prefix for general source files: "src/" or "" */
  srcPrefix: string;
  /** Prefix for Next.js app router files: "src/app" or "app" */
  appPrefix: string;
}

/**
 * Detect the project's directory layout from actual filesystem structure.
 * Used by arc42 templates to generate consistent code_paths.
 *
 * Detection priority:
 * 1. src/app exists → srcPrefix="src/", appPrefix="src/app"
 * 2. app/ exists at root → srcPrefix="", appPrefix="app"
 * 3. src/ exists (no app/) → srcPrefix="src/", appPrefix="src/app" (convention)
 * 4. No projectRoot → srcPrefix="src/", appPrefix="src/app" (default for new projects)
 * 5. Empty project (no src/, no app/) → srcPrefix="", appPrefix="app" (Next.js default without src)
 */
export function detectProjectLayout(projectRoot?: string): ProjectLayout {
  if (!projectRoot) {
    // New project or template preview — default to src/ convention
    return { srcPrefix: "src/", appPrefix: "src/app" };
  }

  const hasSrcApp = existsSync(join(projectRoot, "src", "app"));
  if (hasSrcApp) {
    return { srcPrefix: "src/", appPrefix: "src/app" };
  }

  const hasRootApp = existsSync(join(projectRoot, "app"));
  if (hasRootApp) {
    return { srcPrefix: "", appPrefix: "app" };
  }

  const hasSrc = existsSync(join(projectRoot, "src"));
  if (hasSrc) {
    return { srcPrefix: "src/", appPrefix: "src/app" };
  }

  // Empty project without src/ — use Next.js default (app/ at root)
  return { srcPrefix: "", appPrefix: "app" };
}
