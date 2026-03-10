import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, textResult } from "../helpers.js";

interface ComponentBoundaryRow {
  symbol_id: string;
  name: string;
  file_path: string;
  is_client: number;
  is_server_action: number;
  has_state: number;
}

interface CrossBoundaryEdge {
  source_name: string;
  source_file: string;
  source_is_client: number;
  target_name: string;
  target_file: string;
  target_is_client: number;
  kind: string;
}

export function registerGetBoundaryAnalysis(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "archlens_get_boundary_analysis",
    "Analyze server/client boundaries in a Next.js project. Identifies client components, server components, server actions, and potential boundary violations.",
    {
      target_dir: z
        .string()
        .describe("Absolute path to the project directory"),
    },
    async (params) => {
      const db = ensureDb(ctx, params.target_dir);
      if (!db) return notInitialized();

      // Get all components with boundary info
      const components = db
        .prepare(
          `SELECT c.symbol_id, s.name, s.file_path,
            c.is_client, c.is_server_action, c.has_state
          FROM components c
          JOIN symbols s ON c.symbol_id = s.id
          ORDER BY s.file_path`,
        )
        .all() as ComponentBoundaryRow[];

      if (components.length === 0) {
        return textResult("No components found. Run `archlens_reindex` to analyze server/client boundaries.");
      }

      // Find cross-boundary render edges (server component rendering client, etc.)
      const crossEdges = db
        .prepare(
          `SELECT
            ss.name as source_name, ss.file_path as source_file, cs.is_client as source_is_client,
            st.name as target_name, st.file_path as target_file, ct.is_client as target_is_client,
            d.kind
          FROM dependencies d
          JOIN symbols ss ON d.source_symbol = ss.id
          JOIN symbols st ON d.target_symbol = st.id
          LEFT JOIN components cs ON d.source_symbol = cs.symbol_id
          LEFT JOIN components ct ON d.target_symbol = ct.symbol_id
          WHERE d.kind IN ('renders', 'imports')
            AND (cs.symbol_id IS NOT NULL OR ct.symbol_id IS NOT NULL)`,
        )
        .all() as CrossBoundaryEdge[];

      const clientComponents = components.filter((c) => c.is_client);
      const serverComponents = components.filter((c) => !c.is_client && !c.is_server_action);
      const serverActions = components.filter((c) => c.is_server_action);

      const lines: string[] = [
        "# Server/Client Boundary Analysis",
        "",
        "## Overview",
        "",
        `- **Server components:** ${serverComponents.length}`,
        `- **Client components:** ${clientComponents.length}`,
        `- **Server actions:** ${serverActions.length}`,
        "",
      ];

      // Client components section
      if (clientComponents.length > 0) {
        lines.push("## Client Components (`'use client'`)", "");
        for (const c of clientComponents) {
          const badges: string[] = [];
          if (c.has_state) badges.push("stateful");
          const badgeStr = badges.length > 0 ? ` [${badges.join(", ")}]` : "";
          lines.push(`- \`${c.file_path}\` → **${c.name}**${badgeStr}`);
        }
        lines.push("");
      }

      // Server components section
      if (serverComponents.length > 0) {
        lines.push("## Server Components (default)", "");
        for (const c of serverComponents) {
          lines.push(`- \`${c.file_path}\` → **${c.name}**`);
        }
        lines.push("");
      }

      // Server actions section
      if (serverActions.length > 0) {
        lines.push("## Server Actions (`'use server'`)", "");
        for (const c of serverActions) {
          lines.push(`- \`${c.file_path}\` → **${c.name}**`);
        }
        lines.push("");
      }

      // Boundary crossings
      const boundaryViolations: string[] = [];
      const validCrossings: string[] = [];

      for (const edge of crossEdges) {
        if (edge.kind !== "renders") continue;

        const sourceIsClient = edge.source_is_client === 1;
        const targetIsClient = edge.target_is_client === 1;

        if (sourceIsClient === targetIsClient) continue; // same boundary, skip

        if (!sourceIsClient && targetIsClient) {
          // Server → client: valid boundary crossing
          validCrossings.push(
            `- **${edge.source_name}** (server) → **${edge.target_name}** (client)`,
          );
        } else if (sourceIsClient && !targetIsClient) {
          // Client → server: potential issue (client can't import server component directly)
          boundaryViolations.push(
            `- **${edge.source_name}** (client, \`${edge.source_file}\`) renders **${edge.target_name}** (server, \`${edge.target_file}\`)`,
          );
        }
      }

      if (validCrossings.length > 0) {
        lines.push("## Boundary Crossings (valid)", "");
        lines.push(...validCrossings, "");
      }

      if (boundaryViolations.length > 0) {
        lines.push("## Potential Boundary Violations", "");
        lines.push(
          "These client components appear to render server components, which is not allowed in Next.js App Router:",
          "",
          ...boundaryViolations,
          "",
        );
      } else {
        lines.push("## Boundary Check", "");
        lines.push("No boundary violations detected.", "");
      }

      return textResult(lines.join("\n"));
    },
  );
}
