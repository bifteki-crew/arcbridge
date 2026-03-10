import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, textResult, safeParseJson } from "../helpers.js";

interface ComponentRow {
  symbol_id: string;
  name: string;
  file_path: string;
  is_client: number;
  is_server_action: number;
  has_state: number;
  context_providers: string;
  context_consumers: string;
  props_type: string | null;
  is_exported: number;
}

interface RenderEdge {
  source_name: string;
  source_file: string;
  target_name: string;
  target_file: string;
}

export function registerGetComponentGraph(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "archlens_get_component_graph",
    "Get the React component graph: component hierarchy, props, state, context usage, and server/client boundaries.",
    {
      target_dir: z
        .string()
        .describe("Absolute path to the project directory"),
      file_path: z
        .string()
        .optional()
        .describe("Filter to components in a specific file or directory prefix"),
      client_only: z
        .boolean()
        .optional()
        .describe("Only show client components ('use client')"),
      with_state: z
        .boolean()
        .optional()
        .describe("Only show components that use state (useState/useReducer)"),
    },
    async (params) => {
      const db = ensureDb(ctx, params.target_dir);
      if (!db) return notInitialized();

      let query = `
        SELECT
          c.symbol_id, s.name, s.file_path,
          c.is_client, c.is_server_action, c.has_state,
          c.context_providers, c.context_consumers, c.props_type,
          s.is_exported
        FROM components c
        JOIN symbols s ON c.symbol_id = s.id
      `;
      const conditions: string[] = [];
      const queryParams: (string | number)[] = [];

      if (params.file_path) {
        conditions.push("s.file_path LIKE ?");
        queryParams.push(`${params.file_path}%`);
      }
      if (params.client_only) {
        conditions.push("c.is_client = 1");
      }
      if (params.with_state) {
        conditions.push("c.has_state = 1");
      }

      if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
      }
      query += " ORDER BY s.file_path, s.name";

      const components = db.prepare(query).all(...queryParams) as ComponentRow[];

      if (components.length === 0) {
        return textResult("No components found. Run `archlens_reindex` to analyze React components.");
      }

      // Get render edges between components
      const renderEdges = db
        .prepare(
          `SELECT
            ss.name as source_name, ss.file_path as source_file,
            st.name as target_name, st.file_path as target_file
          FROM dependencies d
          JOIN symbols ss ON d.source_symbol = ss.id
          JOIN symbols st ON d.target_symbol = st.id
          WHERE d.kind = 'renders'
            AND d.source_symbol IN (SELECT symbol_id FROM components)
            AND d.target_symbol IN (SELECT symbol_id FROM components)`,
        )
        .all() as RenderEdge[];

      const lines: string[] = [
        `# Component Graph (${components.length} components)`,
        "",
      ];

      // Group by file
      const byFile = new Map<string, ComponentRow[]>();
      for (const c of components) {
        const existing = byFile.get(c.file_path) ?? [];
        existing.push(c);
        byFile.set(c.file_path, existing);
      }

      for (const [file, comps] of byFile) {
        lines.push(`## \`${file}\``, "");
        for (const c of comps) {
          const badges: string[] = [];
          if (c.is_client) badges.push("client");
          if (c.is_server_action) badges.push("server-action");
          if (c.has_state) badges.push("stateful");
          if (!c.is_exported) badges.push("internal");

          const badgeStr = badges.length > 0 ? ` [${badges.join(", ")}]` : "";
          lines.push(`### ${c.name}${badgeStr}`, "");

          if (c.props_type) {
            lines.push(`- **Props:** \`${c.props_type}\``);
          }

          const providers = safeParseJson<string[]>(c.context_providers, []);
          if (providers.length > 0) {
            lines.push(`- **Provides context:** ${providers.join(", ")}`);
          }

          const consumers = safeParseJson<string[]>(c.context_consumers, []);
          if (consumers.length > 0) {
            lines.push(`- **Consumes context:** ${consumers.join(", ")}`);
          }

          // Children (renders)
          const children = renderEdges
            .filter((e) => e.source_name === c.name && e.source_file === file)
            .map((e) => e.target_name);
          if (children.length > 0) {
            lines.push(`- **Renders:** ${children.join(", ")}`);
          }

          // Parents (rendered by)
          const parents = renderEdges
            .filter((e) => e.target_name === c.name && e.target_file === file)
            .map((e) => e.source_name);
          if (parents.length > 0) {
            lines.push(`- **Rendered by:** ${parents.join(", ")}`);
          }

          lines.push("");
        }
      }

      // Summary
      const clientCount = components.filter((c) => c.is_client).length;
      const statefulCount = components.filter((c) => c.has_state).length;
      lines.push(
        "## Summary",
        "",
        `- **Total components:** ${components.length}`,
        `- **Client components:** ${clientCount}`,
        `- **Stateful components:** ${statefulCount}`,
        `- **Render edges:** ${renderEdges.length}`,
        "",
      );

      return textResult(lines.join("\n"));
    },
  );
}
