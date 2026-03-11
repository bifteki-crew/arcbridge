import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, textResult, safeParseJson, escapeLike } from "../helpers.js";

interface RouteRow {
  id: string;
  route_path: string;
  kind: string;
  http_methods: string;
  has_auth: number;
  parent_layout: string | null;
  service: string;
}

export function registerGetRouteMap(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "archlens_get_route_map",
    "Get the Next.js route map: all pages, layouts, API routes, and their hierarchy.",
    {
      target_dir: z
        .string()
        .describe("Absolute path to the project directory"),
      kind: z
        .enum(["page", "layout", "loading", "error", "not-found", "api-route", "middleware"])
        .optional()
        .describe("Filter by route kind"),
      route_prefix: z
        .string()
        .optional()
        .describe("Filter by route path prefix (e.g. '/dashboard')"),
    },
    async (params) => {
      const db = ensureDb(ctx, params.target_dir);
      if (!db) return notInitialized();

      let query = "SELECT * FROM routes";
      const conditions: string[] = [];
      const queryParams: (string | number)[] = [];

      if (params.kind) {
        conditions.push("kind = ?");
        queryParams.push(params.kind);
      }
      if (params.route_prefix) {
        conditions.push("route_path LIKE ? ESCAPE '\\'");
        queryParams.push(`${escapeLike(params.route_prefix)}%`);
      }

      if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
      }
      query += " ORDER BY route_path, kind";

      const routes = db.prepare(query).all(...queryParams) as RouteRow[];

      if (routes.length === 0) {
        return textResult("No routes found. Run `archlens_reindex` to analyze the Next.js app/ directory.");
      }

      const lines: string[] = [
        `# Route Map (${routes.length} routes)`,
        "",
      ];

      // Group by route path
      const byPath = new Map<string, RouteRow[]>();
      for (const r of routes) {
        const existing = byPath.get(r.route_path) ?? [];
        existing.push(r);
        byPath.set(r.route_path, existing);
      }

      for (const [path, routeGroup] of byPath) {
        lines.push(`## \`${path}\``);
        lines.push("");

        for (const r of routeGroup) {
          const parts: string[] = [`- **${r.kind}**`];

          const methods = safeParseJson<string[]>(r.http_methods, []);
          if (methods.length > 0) {
            parts.push(`Methods: ${methods.join(", ")}`);
          }

          if (r.has_auth) {
            parts.push("(auth)");
          }

          if (r.parent_layout) {
            parts.push(`Layout: \`${r.parent_layout}\``);
          }

          lines.push(parts.join(" | "));
        }
        lines.push("");
      }

      // Summary
      const pages = routes.filter((r) => r.kind === "page").length;
      const layouts = routes.filter((r) => r.kind === "layout").length;
      const apiRoutes = routes.filter((r) => r.kind === "api-route").length;
      const loadingStates = routes.filter((r) => r.kind === "loading").length;

      lines.push(
        "## Summary",
        "",
        `- **Pages:** ${pages}`,
        `- **Layouts:** ${layouts}`,
        `- **API routes:** ${apiRoutes}`,
        `- **Loading states:** ${loadingStates}`,
        "",
      );

      return textResult(lines.join("\n"));
    },
  );
}
