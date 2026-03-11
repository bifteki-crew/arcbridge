import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type Database from "better-sqlite3";

export interface ExtractedRoute {
  id: string;
  routePath: string;
  kind: "page" | "layout" | "loading" | "error" | "not-found" | "api-route" | "middleware";
  httpMethods: string[];
  hasAuth: boolean;
  parentLayout: string | null;
  service: string;
}

/** Map from Next.js file convention name to route kind */
const FILE_KIND_MAP: Record<string, ExtractedRoute["kind"]> = {
  "page": "page",
  "layout": "layout",
  "loading": "loading",
  "error": "error",
  "not-found": "not-found",
  "route": "api-route",
};

const TS_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];

/**
 * Analyze the Next.js app/ directory and populate the routes table.
 */
export function analyzeRoutes(
  projectRoot: string,
  db: Database.Database,
  service: string = "main",
): number {
  const appDir = join(projectRoot, "app");
  if (!existsSync(appDir) || !statSync(appDir).isDirectory()) {
    return 0;
  }

  const routes: ExtractedRoute[] = [];
  const layoutStack: string[] = [];

  // Check for root middleware
  for (const ext of TS_EXTENSIONS) {
    const middlewarePath = join(projectRoot, `middleware${ext}`);
    if (existsSync(middlewarePath)) {
      routes.push({
        id: `route::middleware`,
        routePath: "/",
        kind: "middleware",
        httpMethods: [],
        hasAuth: false,
        parentLayout: null,
        service,
      });
      break;
    }
  }

  walkAppDir(appDir, "/", routes, layoutStack, service, projectRoot);

  // Write to database
  writeRoutes(db, routes);
  return routes.length;
}

function walkAppDir(
  dir: string,
  routePath: string,
  routes: ExtractedRoute[],
  layoutStack: string[],
  service: string,
  projectRoot: string,
): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  const currentLayout = layoutStack.length > 0
    ? layoutStack[layoutStack.length - 1]!
    : null;

  // Check for convention files in this directory
  for (const [convention, kind] of Object.entries(FILE_KIND_MAP)) {
    for (const ext of TS_EXTENSIONS) {
      const filePath = join(dir, `${convention}${ext}`);
      if (existsSync(filePath)) {
        const relPath = relative(projectRoot, dir);
        const routeId = `route::${relPath}/${convention}`;

        const route: ExtractedRoute = {
          id: routeId,
          routePath,
          kind,
          httpMethods: [],
          hasAuth: false,
          parentLayout: currentLayout,
          service,
        };

        // For API routes, extract HTTP methods
        if (kind === "api-route") {
          route.httpMethods = extractHttpMethods(filePath);
        }

        routes.push(route);

        // Track layout for children
        if (kind === "layout") {
          layoutStack.push(routeId);
        }

        break; // Only pick first matching extension
      }
    }
  }

  // Recurse into subdirectories
  for (const entry of entries.sort()) {
    const fullPath = join(dir, entry);
    try {
      if (!statSync(fullPath).isDirectory()) continue;
    } catch {
      continue;
    }
    // Skip hidden dirs, node_modules, and parallel route slots (@modal, @sidebar)
    if (entry.startsWith(".") || entry.startsWith("@") || entry === "node_modules") continue;

    const childPath = buildRoutePath(routePath, entry);
    walkAppDir(fullPath, childPath, routes, [...layoutStack], service, projectRoot);
  }
}

/**
 * Build the URL route path from a directory segment.
 * Handles: route groups (parentheses), dynamic segments [param], catch-all [...slug].
 */
function buildRoutePath(parentPath: string, segment: string): string {
  // Route groups: (auth) → no URL segment
  if (segment.startsWith("(") && segment.endsWith(")")) {
    return parentPath;
  }

  // Optional catch-all: [[...slug]] → *slug?
  const optionalCatchAll = segment.match(/^\[\[\.\.\.(.+)\]\]$/);
  if (optionalCatchAll) {
    const name = optionalCatchAll[1]!;
    return parentPath === "/" ? `/*${name}?` : `${parentPath}/*${name}?`;
  }

  // Dynamic segments: [param] → :param
  const dynamicMatch = segment.match(/^\[(.+)\]$/);
  if (dynamicMatch) {
    const param = dynamicMatch[1]!;
    // Catch-all: [...slug] → *slug
    if (param.startsWith("...")) {
      const slug = parentPath === "/" ? `/*${param.slice(3)}` : `${parentPath}/*${param.slice(3)}`;
      return slug;
    }
    return parentPath === "/" ? `/:${param}` : `${parentPath}/:${param}`;
  }

  return parentPath === "/" ? `/${segment}` : `${parentPath}/${segment}`;
}

/**
 * Extract HTTP method exports (GET, POST, PUT, DELETE, PATCH) from an API route file.
 */
function extractHttpMethods(filePath: string): string[] {
  const content = readFileSync(filePath, "utf-8");
  const methods: string[] = [];
  const httpMethods = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];

  for (const method of httpMethods) {
    // Match: export function GET, export async function GET, export const GET
    const pattern = new RegExp(
      `export\\s+(?:async\\s+)?(?:function|const)\\s+${method}\\b`,
    );
    if (pattern.test(content)) {
      methods.push(method);
    }
  }

  return methods;
}

function writeRoutes(
  db: Database.Database,
  routes: ExtractedRoute[],
): void {
  if (routes.length === 0) return;

  // Clear existing routes and re-insert
  db.prepare("DELETE FROM routes").run();

  const insert = db.prepare(`
    INSERT OR IGNORE INTO routes (
      id, route_path, kind, http_methods, has_auth, parent_layout, service
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const run = db.transaction(() => {
    for (const r of routes) {
      insert.run(
        r.id,
        r.routePath,
        r.kind,
        JSON.stringify(r.httpMethods),
        r.hasAuth ? 1 : 0,
        r.parentLayout,
        r.service,
      );
    }
  });

  run();
}
