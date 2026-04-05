import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, safeParseJson } from "../helpers.js";
import type { BlockRow } from "../db-types.js";

interface ScenarioLinkRow {
  id: string;
  name: string;
  category: string;
  status: string;
}

export function registerGetBuildingBlocks(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "arcbridge_get_building_blocks",
    "Get all architecture building blocks with their code mappings, responsibilities, and linked quality scenarios.",
    {
      target_dir: z
        .string()
        .describe("Absolute path to the project directory"),
    },
    async (params) => {
      const db = ensureDb(ctx, params.target_dir);
      if (!db) return notInitialized();

      const blocks = db
        .prepare(
          "SELECT id, name, level, parent_id, responsibility, code_paths, interfaces, service, last_synced FROM building_blocks ORDER BY level, name",
        )
        .all() as BlockRow[];

      if (blocks.length === 0) {
        return {
          content: [
            { type: "text" as const, text: "No building blocks defined yet." },
          ],
        };
      }

      const lines: string[] = ["# Building Blocks", ""];

      for (const block of blocks) {
        const indent = "  ".repeat(block.level - 1);
        const codePaths = safeParseJson<string[]>(block.code_paths, []);
        const interfaces = safeParseJson<string[]>(block.interfaces, []);

        lines.push(`${indent}## ${block.name} (\`${block.id}\`)`);
        lines.push("");
        lines.push(`${indent}**Responsibility:** ${block.responsibility}`);
        lines.push(`${indent}**Service:** ${block.service}`);

        if (codePaths.length > 0) {
          lines.push(
            `${indent}**Code:** ${codePaths.map((p) => `\`${p}\``).join(", ")}`,
          );
        }

        if (interfaces.length > 0) {
          lines.push(
            `${indent}**Interfaces:** ${interfaces.map((i) => `\`${i}\``).join(", ")}`,
          );
        }

        if (block.parent_id) {
          lines.push(`${indent}**Parent:** \`${block.parent_id}\``);
        }

        // Linked quality scenarios
        const scenarios = db
          .prepare(
            "SELECT id, name, category, status FROM quality_scenarios WHERE linked_blocks LIKE ?",
          )
          .all(`%"${block.id}"%`) as ScenarioLinkRow[];

        if (scenarios.length > 0) {
          lines.push(`${indent}**Quality Scenarios:**`);
          for (const s of scenarios) {
            lines.push(
              `${indent}- ${s.id}: ${s.name} [${s.category}] (${s.status})`,
            );
          }
        }

        lines.push("");
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );
}
