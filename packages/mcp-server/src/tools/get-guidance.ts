import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { loadConfig } from "@arcbridge/core";
import { ensureDb, notInitialized, textResult, safeParseJson, escapeLike, normalizeCodePath } from "../helpers.js";
import type { BlockRow, ScenarioRow, SymbolRow, TaskRow } from "../db-types.js";

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

      // 5. Relevant ADRs
      const adrRows = db
        .prepare("SELECT id, title, status, decision, affected_blocks, affected_files FROM adrs")
        .all() as Array<{ id: string; title: string; status: string; decision: string; affected_blocks: string; affected_files: string }>;

      const relevantAdrs = adrRows.filter((adr) => {
        if (params.file_path) {
          const affectedFiles = safeParseJson<string[]>(adr.affected_files, []);
          if (affectedFiles.some((f) => params.file_path!.includes(f) || f.includes(params.file_path!))) return true;
        }
        if (matchedBlock) {
          const affectedBlocks = safeParseJson<string[]>(adr.affected_blocks, []);
          if (affectedBlocks.includes(matchedBlock.id)) return true;
        }
        return false;
      });

      if (relevantAdrs.length > 0) {
        lines.push("## Relevant ADRs", "");
        for (const adr of relevantAdrs) {
          lines.push(`### ${adr.id}: ${adr.title} [${adr.status}]`, "");
          lines.push(`**Decision:** ${adr.decision}`, "");
        }
      }

      // 6. Unresolved drift in this area
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

      // 7. Action-specific guidance (template-aware)
      const projectRoot = ctx.projectRoot ?? params.target_dir;
      const { config: projConfig, error: configError } = loadConfig(projectRoot);
      // If config is invalid, fall back to shared guidance only (no template assumptions)
      const projectType = configError ? "unknown" : (projConfig?.project_type ?? "nextjs-app-router");
      const actionGuidance = getActionGuidance(params.action, projectType);
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
  _blockId: string | null,
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

const FRONTEND_GUIDANCE: Record<string, string> = {
  "adding-component":
    "- Follow existing component patterns in this directory\n- Add props interface alongside the component\n- Consider server vs. client: does this need interactivity (`'use client'`)?\n- Check accessibility: keyboard navigation, ARIA labels, screen reader support\n- **Arc42:** If this introduces a new UI pattern, document it in `08-crosscutting.md`",
  "adding-api-route":
    "- Ensure authentication middleware covers this route\n- Validate all input with zod or equivalent\n- Follow existing error response patterns\n- Consider rate limiting for public endpoints\n- **Arc42:** Update `03-context.md` if this exposes a new external integration",
  "adding-hook":
    "- Follow the `use` prefix convention\n- Keep hooks focused — one responsibility per hook\n- Consider memoization for expensive computations\n- Document the hook's return type",
  "modifying-auth":
    "- Check all API routes still have auth coverage after changes\n- Verify no secrets leak to client components\n- Test edge cases: expired tokens, revoked sessions, role changes\n- **Arc42:** Update `08-crosscutting.md` with the auth pattern",
  "new-dependency":
    "- Document the dependency rationale in an ADR\n- Check bundle size impact (client-side deps)\n- Verify no known CVEs\n- **Arc42:** If this introduces a new external system, update `03-context.md`",
};

const DOTNET_GUIDANCE: Record<string, string> = {
  "adding-component":
    "- Follow the existing service/repository pattern\n- Register the new class in DI (Program.cs or extension method)\n- Add an interface if the component needs to be mockable\n- **Arc42:** Update `05-building-blocks.md` if this is a new architectural layer",
  "adding-api-route":
    "- Use `[HttpGet]`, `[HttpPost]`, etc. attributes for controller routes, or `MapGet`/`MapPost` for minimal APIs\n- Apply `[Authorize]` for protected endpoints\n- Validate input with data annotations or FluentValidation\n- Follow existing error response patterns (ProblemDetails)\n- **Arc42:** Update `03-context.md` if this exposes new external integrations; update `06-runtime-views.md` for key workflows",
  "adding-hook":
    "- .NET equivalent: create a middleware, filter, or hosted service\n- Register in the DI container\n- Follow the single responsibility principle",
  "modifying-auth":
    "- Check `[Authorize]` coverage on all controllers/endpoints\n- Verify JWT validation, claims, and policy configuration\n- Test edge cases: expired tokens, revoked sessions, role changes\n- **Arc42:** Update `08-crosscutting.md` with the auth pattern",
  "new-dependency":
    "- Document the NuGet package rationale in an ADR\n- Check for known vulnerabilities with `dotnet list package --vulnerable`\n- Verify license compatibility\n- **Arc42:** If this introduces a new external system, update `03-context.md`",
};

const API_GUIDANCE: Record<string, string> = {
  "adding-component":
    "- Follow existing module/service patterns\n- Add TypeScript interfaces for public APIs\n- Register in the dependency injection or module system\n- **Arc42:** Update `05-building-blocks.md` if this is a new architectural layer",
  "adding-api-route":
    "- Ensure authentication middleware covers this route\n- Validate all input with zod or equivalent\n- Follow existing error response patterns\n- Consider rate limiting for public endpoints\n- **Arc42:** Update `03-context.md` if this exposes a new external integration",
  "adding-hook":
    "- Use middleware for cross-cutting concerns\n- Keep middleware focused — one responsibility per middleware\n- Document the middleware's purpose and order",
  "modifying-auth":
    "- Check all routes still have auth coverage\n- Verify token validation and session handling\n- Test edge cases: expired tokens, revoked sessions\n- **Arc42:** Update `08-crosscutting.md` with the auth pattern",
  "new-dependency":
    "- Document the dependency rationale in an ADR\n- Verify no known CVEs\n- Ensure license compatibility\n- **Arc42:** If this introduces a new external system, update `03-context.md`",
};

const SHARED_GUIDANCE: Record<string, string> = {
  "refactoring":
    "- Ensure no cross-block boundary violations are introduced\n- Maintain existing public API contracts\n- Run tests before and after to verify behavior preservation\n- If the refactoring changes architectural patterns, update or create an ADR\n- **Arc42:** Update `05-building-blocks.md` if module structure changed; update `08-crosscutting.md` if patterns changed",
  "general":
    "- Check `arcbridge_get_relevant_adrs` for existing decisions that may constrain this change\n- If you're choosing between approaches, document the decision in an ADR\n- **Arc42:** Consider which documentation sections may need updating (check `.arcbridge/arc42/`)",
};

function getActionGuidance(action: string, projectType: string): string | null {
  // Shared guidance applies to all project types
  if (SHARED_GUIDANCE[action]) return SHARED_GUIDANCE[action];

  // Type-specific guidance
  switch (projectType) {
    case "dotnet-webapi":
      return DOTNET_GUIDANCE[action] ?? null;
    case "api-service":
      return API_GUIDANCE[action] ?? null;
    case "react-vite":
    case "nextjs-app-router":
      return FRONTEND_GUIDANCE[action] ?? null;
    default:
      return null; // Unknown project types only get shared guidance
  }
}
