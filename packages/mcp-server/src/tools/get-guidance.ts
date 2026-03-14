import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, textResult, safeParseJson, escapeLike, normalizeCodePath } from "../helpers.js";

interface BlockRow {
  id: string;
  name: string;
  responsibility: string;
  code_paths: string;
  interfaces: string;
}

interface ScenarioRow {
  id: string;
  name: string;
  category: string;
  scenario: string;
  expected: string;
  priority: string;
}

interface SymbolRow {
  name: string;
  kind: string;
  file_path: string;
}

interface TaskRow {
  id: string;
  title: string;
  status: string;
  building_block: string | null;
}

interface DriftRow {
  kind: string;
  description: string;
}

export function registerGetGuidance(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "arcbridge_get_guidance",
    "Get context-aware architectural guidance for a code change. Surfaces relevant quality scenarios, patterns, constraints, and questions to consider.",
    {
      target_dir: z
        .string()
        .describe("Absolute path to the project directory"),
      file_path: z
        .string()
        .optional()
        .describe("File path you're working on (to determine building block and context)"),
      action: z
        .enum([
          "adding-component",
          "adding-api-route",
          "adding-hook",
          "modifying-auth",
          "new-dependency",
          "refactoring",
          "general",
        ])
        .default("general")
        .describe("Type of change you're making"),
    },
    async (params) => {
      const db = ensureDb(ctx, params.target_dir);
      if (!db) return notInitialized();

      const lines: string[] = ["# Architectural Guidance", ""];

      // 1. Determine which building block this file belongs to
      let matchedBlock: BlockRow | null = null;
      if (params.file_path) {
        const blocks = db
          .prepare("SELECT id, name, responsibility, code_paths, interfaces FROM building_blocks")
          .all() as BlockRow[];

        for (const block of blocks) {
          const paths = safeParseJson<string[]>(block.code_paths, []);
          for (const cp of paths) {
            const prefix = normalizeCodePath(cp);
            if (params.file_path.startsWith(prefix) || params.file_path === prefix) {
              matchedBlock = block;
              break;
            }
          }
          if (matchedBlock) break;
        }

        if (matchedBlock) {
          lines.push(
            `## Building Block: ${matchedBlock.name} (\`${matchedBlock.id}\`)`,
            "",
            `**Responsibility:** ${matchedBlock.responsibility}`,
            "",
          );

          const interfaces = safeParseJson<string[]>(matchedBlock.interfaces, []);
          if (interfaces.length > 0) {
            lines.push(
              `**Declared interfaces:** ${interfaces.join(", ")}`,
              "",
            );
          }
        } else {
          lines.push(
            "## Warning: Unmapped File",
            "",
            `\`${params.file_path}\` is not mapped to any building block. Consider updating \`.arcbridge/arc42/05-building-blocks.md\` to include this path.`,
            "",
          );
        }

        // 2. Show existing patterns in this block/file area
        const existingSymbols = db
          .prepare(
            "SELECT name, kind, file_path FROM symbols WHERE file_path LIKE ? ESCAPE '\\' ORDER BY kind, name LIMIT 20",
          )
          .all(`${escapeLike(params.file_path.replace(/\/[^/]+$/, "/"))}%`) as SymbolRow[];

        if (existingSymbols.length > 0) {
          const byKind = new Map<string, string[]>();
          for (const s of existingSymbols) {
            const existing = byKind.get(s.kind) ?? [];
            existing.push(s.name);
            byKind.set(s.kind, existing);
          }

          lines.push("## Existing Patterns Nearby", "");
          for (const [kind, names] of byKind) {
            lines.push(`- **${kind}s:** ${names.join(", ")}`);
          }
          lines.push("");
        }
      }

      // 3. Relevant quality scenarios
      const scenarios = db
        .prepare(
          "SELECT id, name, category, scenario, expected, priority FROM quality_scenarios ORDER BY priority, category",
        )
        .all() as ScenarioRow[];

      const relevantScenarios = filterRelevantScenarios(
        scenarios,
        params.action,
        matchedBlock?.id ?? null,
      );

      if (relevantScenarios.length > 0) {
        lines.push("## Relevant Quality Scenarios", "");
        for (const s of relevantScenarios) {
          lines.push(
            `### ${s.id}: ${s.name} [${s.category}] (${s.priority})`,
            "",
            `**Scenario:** ${s.scenario}`,
            `**Expected:** ${s.expected}`,
            "",
          );
        }
      }

      // 4. Active tasks in this block
      if (matchedBlock) {
        const tasks = db
          .prepare(
            "SELECT id, title, status, building_block FROM tasks WHERE building_block = ? AND status IN ('todo', 'in-progress')",
          )
          .all(matchedBlock.id) as TaskRow[];

        if (tasks.length > 0) {
          lines.push("## Active Tasks in This Block", "");
          for (const t of tasks) {
            lines.push(`- [${t.status}] ${t.id}: ${t.title}`);
          }
          lines.push("");
        }
      }

      // 5. Unresolved drift in this area
      const driftEntries = params.file_path
        ? (db
            .prepare(
              "SELECT kind, description FROM drift_log WHERE resolution IS NULL AND (affected_file = ? OR affected_block = ?)",
            )
            .all(params.file_path, matchedBlock?.id ?? "") as DriftRow[])
        : (db
            .prepare(
              "SELECT kind, description FROM drift_log WHERE resolution IS NULL LIMIT 5",
            )
            .all() as DriftRow[]);

      if (driftEntries.length > 0) {
        lines.push("## Unresolved Drift", "");
        for (const d of driftEntries) {
          lines.push(`- [${d.kind}] ${d.description}`);
        }
        lines.push("");
      }

      // 6. Action-specific guidance
      const actionGuidance = getActionGuidance(params.action);
      if (actionGuidance) {
        lines.push("## Guidance", "", actionGuidance, "");
      }

      return textResult(lines.join("\n"));
    },
  );
}

function filterRelevantScenarios(
  scenarios: ScenarioRow[],
  action: string,
  blockId: string | null,
): ScenarioRow[] {
  const categoryMap: Record<string, string[]> = {
    "adding-component": ["accessibility", "performance", "maintainability"],
    "adding-api-route": ["security", "performance", "reliability"],
    "adding-hook": ["maintainability", "performance"],
    "modifying-auth": ["security", "reliability"],
    "new-dependency": ["maintainability", "performance", "security"],
    "refactoring": ["maintainability", "reliability"],
    "general": [],
  };

  const relevantCategories = categoryMap[action] ?? [];

  if (relevantCategories.length === 0) {
    // For "general", return must-have scenarios only
    return scenarios.filter((s) => s.priority === "must");
  }

  return scenarios.filter((s) => relevantCategories.includes(s.category));
}

function getActionGuidance(action: string): string | null {
  const guidance: Record<string, string> = {
    "adding-component":
      "- Follow existing component patterns in this directory\n- Add props interface alongside the component\n- Consider server vs. client: does this need interactivity (`'use client'`)?\n- Check accessibility: keyboard navigation, ARIA labels, screen reader support",
    "adding-api-route":
      "- Ensure authentication middleware covers this route\n- Validate all input with zod or equivalent\n- Follow existing error response patterns\n- Consider rate limiting for public endpoints",
    "adding-hook":
      "- Follow the `use` prefix convention\n- Keep hooks focused — one responsibility per hook\n- Consider memoization for expensive computations\n- Document the hook's return type",
    "modifying-auth":
      "- Check all API routes still have auth coverage after changes\n- Verify no secrets leak to client components\n- Test edge cases: expired tokens, revoked sessions, role changes\n- Update security quality scenarios if behavior changes",
    "new-dependency":
      "- Document the dependency rationale in an ADR\n- Check bundle size impact (client-side deps)\n- Verify the dependency doesn't introduce known CVEs\n- Ensure the dependency's license is compatible",
    "refactoring":
      "- Ensure no cross-block boundary violations are introduced\n- Maintain existing public API contracts\n- Run tests before and after to verify behavior preservation\n- Check that no quality scenarios regress",
  };

  return guidance[action] ?? null;
}
