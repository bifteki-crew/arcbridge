import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { ensureDb, NOT_INITIALIZED } from "../helpers.js";

interface BlockRow {
  id: string;
  name: string;
  level: number;
  parent_id: string | null;
  description: string | null;
  responsibility: string;
  code_paths: string;
  interfaces: string;
  service: string;
  last_synced: string | null;
}

interface ChildRow {
  id: string;
  name: string;
  responsibility: string;
}

interface ScenarioRow {
  id: string;
  name: string;
  category: string;
  priority: string;
  status: string;
  scenario: string;
  expected: string;
}

interface AdrRow {
  id: string;
  title: string;
  status: string;
  date: string;
}

interface TaskRow {
  id: string;
  title: string;
  status: string;
  phase_id: string;
}

export function registerGetBuildingBlock(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "archlens_get_building_block",
    "Get detailed information about a single building block: its arc42 description, code modules, interfaces, quality scenarios, ADRs, and tasks.",
    {
      target_dir: z
        .string()
        .describe("Absolute path to the project directory"),
      block_id: z
        .string()
        .describe("Building block ID (e.g., 'auth-module')"),
    },
    async (params) => {
      const db = ensureDb(ctx, params.target_dir);
      if (!db) return NOT_INITIALIZED;

      const block = db
        .prepare("SELECT * FROM building_blocks WHERE id = ?")
        .get(params.block_id) as BlockRow | undefined;

      if (!block) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Building block '${params.block_id}' not found. Use \`archlens_get_building_blocks\` to see all blocks.`,
            },
          ],
        };
      }

      const codePaths = JSON.parse(block.code_paths) as string[];
      const interfaces = JSON.parse(block.interfaces) as string[];

      const lines: string[] = [
        `# ${block.name} (\`${block.id}\`)`,
        "",
        `**Responsibility:** ${block.responsibility}`,
        `**Level:** ${block.level}`,
        `**Service:** ${block.service}`,
      ];

      if (block.parent_id) {
        lines.push(`**Parent:** \`${block.parent_id}\``);
      }

      if (block.last_synced) {
        lines.push(`**Last synced:** ${block.last_synced}`);
      }

      // Code paths
      lines.push("", "## Code Paths", "");
      if (codePaths.length > 0) {
        for (const p of codePaths) {
          lines.push(`- \`${p}\``);
        }
      } else {
        lines.push("*No code paths mapped yet.*");
      }

      // Interfaces
      if (interfaces.length > 0) {
        lines.push("", "## Interfaces", "");
        for (const i of interfaces) {
          lines.push(`- \`${i}\``);
        }
      }

      // Child blocks
      const children = db
        .prepare(
          "SELECT id, name, responsibility FROM building_blocks WHERE parent_id = ?",
        )
        .all(params.block_id) as ChildRow[];

      if (children.length > 0) {
        lines.push("", "## Sub-blocks", "");
        for (const child of children) {
          lines.push(`- **${child.name}** (\`${child.id}\`): ${child.responsibility}`);
        }
      }

      // Quality scenarios (linked via JSON array in linked_blocks)
      const scenarios = db
        .prepare(
          "SELECT id, name, category, priority, status, scenario, expected FROM quality_scenarios WHERE linked_blocks LIKE ?",
        )
        .all(`%"${block.id}"%`) as ScenarioRow[];

      if (scenarios.length > 0) {
        lines.push("", "## Quality Scenarios", "");
        for (const s of scenarios) {
          lines.push(
            `### ${s.id}: ${s.name} [${s.category}]`,
            `- **Priority:** ${s.priority}`,
            `- **Status:** ${s.status}`,
            `- **Scenario:** ${s.scenario}`,
            `- **Expected:** ${s.expected}`,
            "",
          );
        }
      }

      // ADRs affecting this block
      const adrs = db
        .prepare(
          "SELECT id, title, status, date FROM adrs WHERE affected_blocks LIKE ?",
        )
        .all(`%"${block.id}"%`) as AdrRow[];

      if (adrs.length > 0) {
        lines.push("", "## Related ADRs", "");
        for (const adr of adrs) {
          lines.push(`- **${adr.id}:** ${adr.title} (${adr.status}, ${adr.date})`);
        }
      }

      // Tasks assigned to this block
      const tasks = db
        .prepare(
          "SELECT id, title, status, phase_id FROM tasks WHERE building_block = ?",
        )
        .all(params.block_id) as TaskRow[];

      if (tasks.length > 0) {
        lines.push("", "## Tasks", "");
        for (const task of tasks) {
          const check =
            task.status === "done"
              ? "[x]"
              : task.status === "in-progress"
                ? "[>]"
                : "[ ]";
          lines.push(`- ${check} ${task.id}: ${task.title} (${task.status})`);
        }
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );
}
