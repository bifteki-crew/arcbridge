import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, safeParseJson, escapeLike } from "../helpers.js";

interface AdrRow {
  id: string;
  title: string;
  status: string;
  date: string;
  context: string | null;
  decision: string | null;
  consequences: string | null;
  affected_blocks: string;
  affected_files: string;
  quality_scenarios: string;
}

export function registerGetRelevantAdrs(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "archlens_get_relevant_adrs",
    "Get architectural decision records (ADRs) relevant to a specific file path or building block.",
    {
      target_dir: z
        .string()
        .describe("Absolute path to the project directory"),
      file_path: z
        .string()
        .optional()
        .describe("File path to find relevant ADRs for"),
      building_block: z
        .string()
        .optional()
        .describe("Building block ID to find relevant ADRs for"),
    },
    async (params) => {
      const db = ensureDb(ctx, params.target_dir);
      if (!db) return notInitialized();

      if (!params.file_path && !params.building_block) {
        // Return all ADRs
        const adrs = db
          .prepare(
            "SELECT id, title, status, date, context, decision, consequences, affected_blocks, affected_files, quality_scenarios FROM adrs ORDER BY id",
          )
          .all() as AdrRow[];

        return formatAdrs(adrs, "All ADRs");
      }

      const adrs: AdrRow[] = [];
      const seen = new Set<string>();

      // Search by building block
      if (params.building_block) {
        const blockAdrs = db
          .prepare(
            "SELECT id, title, status, date, context, decision, consequences, affected_blocks, affected_files, quality_scenarios FROM adrs WHERE affected_blocks LIKE ? ESCAPE '\\'",
          )
          .all(`%"${escapeLike(params.building_block)}"%`) as AdrRow[];

        for (const adr of blockAdrs) {
          if (!seen.has(adr.id)) {
            adrs.push(adr);
            seen.add(adr.id);
          }
        }
      }

      // Search by file path
      if (params.file_path) {
        const fileAdrs = db
          .prepare(
            "SELECT id, title, status, date, context, decision, consequences, affected_blocks, affected_files, quality_scenarios FROM adrs WHERE affected_files LIKE ? ESCAPE '\\'",
          )
          .all(`%${escapeLike(params.file_path)}%`) as AdrRow[];

        for (const adr of fileAdrs) {
          if (!seen.has(adr.id)) {
            adrs.push(adr);
            seen.add(adr.id);
          }
        }
      }

      const scope = [
        params.file_path ? `file: ${params.file_path}` : "",
        params.building_block ? `block: ${params.building_block}` : "",
      ]
        .filter(Boolean)
        .join(", ");

      return formatAdrs(adrs, `ADRs for ${scope}`);
    },
  );
}

function formatAdrs(adrs: AdrRow[], title: string) {
  if (adrs.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: `No ADRs found for the specified scope.`,
        },
      ],
    };
  }

  const lines: string[] = [`# ${title}`, ""];

  for (const adr of adrs) {
    const affectedBlocks = safeParseJson<string[]>(adr.affected_blocks, []);
    const affectedFiles = safeParseJson<string[]>(adr.affected_files, []);

    lines.push(
      `## ${adr.id}: ${adr.title}`,
      "",
      `**Status:** ${adr.status} | **Date:** ${adr.date}`,
    );

    if (affectedBlocks.length > 0) {
      lines.push(
        `**Affected blocks:** ${affectedBlocks.map((b) => `\`${b}\``).join(", ")}`,
      );
    }
    if (affectedFiles.length > 0) {
      lines.push(
        `**Affected files:** ${affectedFiles.map((f) => `\`${f}\``).join(", ")}`,
      );
    }

    if (adr.decision) {
      lines.push("", adr.decision);
    }

    lines.push("");
  }

  return {
    content: [{ type: "text" as const, text: lines.join("\n") }],
  };
}
