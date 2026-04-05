import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, textResult } from "../helpers.js";
import { loadRole, loadRoles } from "@arcbridge/core";
import type { BlockRow, ScenarioRow, PhaseRow, TaskRow } from "../db-types.js";

export function registerActivateRole(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "arcbridge_activate_role",
    "Activate an agent role: loads the role's system prompt, required tools, quality focus, and pre-loaded architectural context.",
    {
      target_dir: z
        .string()
        .describe("Absolute path to the project directory"),
      role: z
        .string()
        .describe(
          "Role ID to activate (e.g., 'architect', 'implementer', 'security-reviewer')",
        ),
      building_block: z
        .string()
        .optional()
        .describe("Focus on a specific building block (for implementer/code-reviewer roles)"),
    },
    async (params) => {
      const db = ensureDb(ctx, params.target_dir);
      if (!db) return notInitialized();

      const lines: string[] = [];

      // Try loading role from .arcbridge/agents/ files first, fall back to built-in definitions
      const fileResult = loadRole(params.target_dir, params.role);
      const role = fileResult.role ?? null;
      const roleDef = role
        ? {
            name: role.name,
            description: role.description,
            requiredTools: role.required_tools,
            deniedTools: role.denied_tools,
            readOnly: role.read_only,
            qualityFocus: role.quality_focus,
            systemPrompt: role.system_prompt,
            modelPreferences: role.model_preferences,
          }
        : getRoleDefinition(params.role);

      if (!roleDef) {
        // Merge file-loaded and built-in role IDs
        const builtInIds = ["architect", "implementer", "security-reviewer", "quality-guardian", "phase-manager", "onboarding", "code-reviewer"];
        const fileRoles = loadRoles(params.target_dir);
        const fileIds = fileRoles.roles.map((r) => r.role_id);
        const availableIds = [...new Set([...fileIds, ...builtInIds])].sort();
        return textResult(
          `Unknown role: \`${params.role}\`. Available roles: ${availableIds.map((r) => `\`${r}\``).join(", ")}`,
        );
      }

      const source = role ? "file" : "built-in";
      lines.push(
        `# Role Activated: ${roleDef.name}`,
        "",
        roleDef.description,
        "",
      );

      if (source === "file") {
        lines.push(`*Loaded from .arcbridge/agents/${params.role}.md*`, "");
      }

      // Tools section
      lines.push("## Required Tools", "");
      for (const tool of roleDef.requiredTools) {
        lines.push(`- \`${tool}\``);
      }
      lines.push("");

      if (roleDef.deniedTools.length > 0) {
        lines.push("## Denied Tools", "");
        for (const tool of roleDef.deniedTools) {
          lines.push(`- \`${tool}\``);
        }
        lines.push("");
      }

      if (roleDef.readOnly) {
        lines.push("**Access:** Read-only", "");
      }

      if (roleDef.qualityFocus.length > 0) {
        lines.push(
          "## Quality Focus",
          "",
          roleDef.qualityFocus.map((q) => `- ${q}`).join("\n"),
          "",
        );
      }

      // Model preferences (only from file-loaded roles)
      if (roleDef.modelPreferences) {
        const mp = roleDef.modelPreferences;
        lines.push("## Model Preferences", "");
        lines.push(`- **Reasoning depth:** ${mp.reasoning_depth}`);
        lines.push(`- **Speed priority:** ${mp.speed_priority}`);
        if (mp.suggested_models) {
          const models = Object.entries(mp.suggested_models)
            .filter(([, v]) => v)
            .map(([k, v]) => `${k}: ${v}`);
          if (models.length > 0) {
            lines.push(`- **Suggested models:** ${models.join(", ")}`);
          }
        }
        lines.push("");
      }

      // Load contextual data based on role
      lines.push("## Pre-loaded Context", "");

      // All roles get building block summary
      const blocks = db
        .prepare("SELECT id, name, responsibility FROM building_blocks")
        .all() as BlockRow[];

      if (blocks.length > 0) {
        lines.push("### Building Blocks", "");
        for (const b of blocks) {
          lines.push(`- **${b.name}** (\`${b.id}\`): ${b.responsibility}`);
        }
        lines.push("");
      }

      // Role-specific context loading
      if (roleDef.qualityFocus.length > 0) {
        // Load quality scenarios filtered by role's focus categories
        const allScenarios = db
          .prepare(
            "SELECT id, name, category, priority, status FROM quality_scenarios ORDER BY priority, category",
          )
          .all() as ScenarioRow[];

        const focused = allScenarios.filter(
          (s) => roleDef.qualityFocus.includes(s.category) || s.priority === "must",
        );

        if (focused.length > 0) {
          lines.push("### Relevant Quality Scenarios", "");
          for (const s of focused) {
            const statusIcon = s.status === "passing" ? "PASS" : s.status === "failing" ? "FAIL" : "?";
            lines.push(
              `- [${statusIcon}] **${s.id}: ${s.name}** [${s.category}] (${s.priority})`,
            );
          }
          lines.push("");
        }
      }

      // Phase Manager & Onboarding get phase overview
      if (["phase-manager", "onboarding", "architect"].includes(params.role)) {
        const phases = db
          .prepare("SELECT id, name, status FROM phases ORDER BY id")
          .all() as PhaseRow[];

        if (phases.length > 0) {
          lines.push("### Phase Plan", "");
          for (const p of phases) {
            const icon =
              p.status === "complete"
                ? "[x]"
                : p.status === "in-progress"
                  ? "[>]"
                  : "[ ]";
            lines.push(`- ${icon} ${p.name} (${p.status})`);
          }
          lines.push("");
        }
      }

      // Implementer & Code Reviewer get focused block context
      if (
        ["implementer", "code-reviewer"].includes(params.role) &&
        params.building_block
      ) {
        const blockDetail = db
          .prepare("SELECT id, name, responsibility FROM building_blocks WHERE id = ?")
          .get(params.building_block) as BlockRow | undefined;

        if (!blockDetail) {
          lines.push(
            `### Warning: Unknown Building Block`,
            "",
            `Building block \`${params.building_block}\` not found. Use \`arcbridge_get_building_blocks\` to see available blocks.`,
            "",
          );
        } else {
          lines.push(
            `### Focus Block: ${blockDetail.name}`,
            "",
            `**Responsibility:** ${blockDetail.responsibility}`,
            "",
          );

          // Get active tasks for this block
          const blockTasks = db
            .prepare(
              "SELECT id, title, status FROM tasks WHERE building_block = ? AND status IN ('todo', 'in-progress')",
            )
            .all(params.building_block) as TaskRow[];

          if (blockTasks.length > 0) {
            lines.push("### Active Tasks", "");
            for (const t of blockTasks) {
              lines.push(`- [${t.status}] ${t.id}: ${t.title}`);
            }
            lines.push("");
          }
        }
      }

      // Phase Manager gets current tasks
      if (params.role === "phase-manager") {
        const currentPhase = db
          .prepare(
            "SELECT id, name FROM phases WHERE status = 'in-progress' LIMIT 1",
          )
          .get() as { id: string; name: string } | undefined;

        if (currentPhase) {
          const phaseTasks = db
            .prepare("SELECT id, title, status FROM tasks WHERE phase_id = ?")
            .all(currentPhase.id) as TaskRow[];

          const done = phaseTasks.filter((t) => t.status === "done").length;
          lines.push(
            `### Current Phase: ${currentPhase.name} (${done}/${phaseTasks.length} tasks done)`,
            "",
          );
          for (const t of phaseTasks) {
            const icon =
              t.status === "done"
                ? "[x]"
                : t.status === "in-progress"
                  ? "[>]"
                  : t.status === "blocked"
                    ? "[!]"
                    : "[ ]";
            lines.push(`- ${icon} ${t.id}: ${t.title}`);
          }
          lines.push("");
        }
      }

      // System prompt
      lines.push("## Instructions", "", roleDef.systemPrompt, "");

      return textResult(lines.join("\n"));
    },
  );
}

interface RoleDef {
  name: string;
  description: string;
  requiredTools: string[];
  deniedTools: string[];
  readOnly: boolean;
  qualityFocus: string[];
  systemPrompt: string;
  modelPreferences?: {
    reasoning_depth: string;
    speed_priority: string;
    suggested_models?: Record<string, string | undefined>;
  };
}

/**
 * Built-in fallback role definitions, used when .arcbridge/agents/{roleId}.md
 * doesn't exist (e.g., project not initialized or role file deleted).
 */
function getRoleDefinition(roleId: string): RoleDef | null {
  const roles: Record<string, RoleDef> = {
    architect: {
      name: "Architect",
      description:
        "Designs system structure, makes architectural decisions, and maintains the arc42 documentation",
      requiredTools: [
        "arcbridge_get_building_blocks",
        "arcbridge_get_quality_scenarios",
        "arcbridge_get_relevant_adrs",
        "arcbridge_search_symbols",
        "arcbridge_get_symbol",
        "arcbridge_get_dependency_graph",
        "arcbridge_get_component_graph",
        "arcbridge_get_route_map",
        "arcbridge_get_boundary_analysis",
        "arcbridge_propose_arc42_update",
        "arcbridge_check_drift",
        "arcbridge_get_open_questions",
      ],
      deniedTools: [],
      readOnly: false,
      qualityFocus: ["maintainability", "reliability", "security", "performance"],
      systemPrompt:
        "You are the Architect agent. Design building blocks, make ADRs, maintain arc42 docs, ensure code-to-architecture mapping, review quality scenarios, and detect drift. Think at the system level.",
    },
    implementer: {
      name: "Implementer",
      description:
        "Writes code within defined building block boundaries, follows existing patterns, and completes phase tasks",
      requiredTools: [
        "arcbridge_get_building_block",
        "arcbridge_get_current_tasks",
        "arcbridge_update_task",
        "arcbridge_search_symbols",
        "arcbridge_get_symbol",
        "arcbridge_get_guidance",
        "arcbridge_get_component_graph",
      ],
      deniedTools: ["arcbridge_propose_arc42_update"],
      readOnly: false,
      qualityFocus: ["maintainability", "performance"],
      systemPrompt:
        "You are the Implementer agent. Write code within your assigned building block boundaries. Follow existing patterns, check guidance before making changes, and update task status when complete.",
    },
    "security-reviewer": {
      name: "Security Reviewer",
      description:
        "Reviews code for security vulnerabilities, verifies security quality scenarios, and checks auth coverage",
      requiredTools: [
        "arcbridge_get_quality_scenarios",
        "arcbridge_get_building_blocks",
        "arcbridge_get_relevant_adrs",
        "arcbridge_search_symbols",
        "arcbridge_get_symbol",
        "arcbridge_get_route_map",
        "arcbridge_get_boundary_analysis",
        "arcbridge_get_practice_review",
      ],
      deniedTools: ["arcbridge_propose_arc42_update"],
      readOnly: true,
      qualityFocus: ["security"],
      systemPrompt:
        "You are the Security Reviewer agent. Review code for vulnerabilities, verify auth coverage on routes, check server/client boundary safety, and validate security quality scenarios.",
    },
    "quality-guardian": {
      name: "Quality Guardian",
      description:
        "Verifies quality scenarios are met, checks test coverage, and monitors performance budgets",
      requiredTools: [
        "arcbridge_get_quality_scenarios",
        "arcbridge_get_building_blocks",
        "arcbridge_search_symbols",
        "arcbridge_get_component_graph",
        "arcbridge_get_boundary_analysis",
      ],
      deniedTools: [],
      readOnly: true,
      qualityFocus: [
        "security",
        "performance",
        "accessibility",
        "reliability",
        "maintainability",
      ],
      systemPrompt:
        "You are the Quality Guardian agent. Verify all quality scenarios are met, check test coverage, monitor performance budgets, and flag regressions.",
    },
    "phase-manager": {
      name: "Phase Manager",
      description:
        "Manages phase transitions, enforces gates, triggers sync, and tracks task completion",
      requiredTools: [
        "arcbridge_get_phase_plan",
        "arcbridge_get_current_tasks",
        "arcbridge_update_task",
        "arcbridge_check_drift",
        "arcbridge_get_open_questions",
        "arcbridge_propose_arc42_update",
        "arcbridge_complete_phase",
      ],
      deniedTools: [],
      readOnly: false,
      qualityFocus: [],
      systemPrompt:
        "You are the Phase Manager agent. Track task completion, enforce phase gates, trigger architecture sync at boundaries, and manage phase transitions. Do not skip gates.",
    },
    onboarding: {
      name: "Onboarding Guide",
      description:
        "Helps new team members understand the project architecture, conventions, and current state",
      requiredTools: [
        "arcbridge_get_project_status",
        "arcbridge_get_building_blocks",
        "arcbridge_get_quality_scenarios",
        "arcbridge_get_phase_plan",
        "arcbridge_get_relevant_adrs",
        "arcbridge_get_component_graph",
        "arcbridge_get_route_map",
      ],
      deniedTools: [],
      readOnly: true,
      qualityFocus: [],
      systemPrompt:
        "You are the Onboarding Guide agent. Help new team members understand the project: architecture, conventions, current phase, and how to contribute. Be welcoming and thorough.",
    },
    "code-reviewer": {
      name: "Code Reviewer",
      description:
        "On-demand code review: checks correctness, patterns, edge cases, and simplicity",
      requiredTools: [
        "arcbridge_get_building_block",
        "arcbridge_get_quality_scenarios",
        "arcbridge_get_relevant_adrs",
        "arcbridge_get_current_tasks",
        "arcbridge_search_symbols",
        "arcbridge_get_symbol",
        "arcbridge_get_dependency_graph",
        "arcbridge_get_component_graph",
        "arcbridge_get_route_map",
        "arcbridge_get_practice_review",
        "arcbridge_get_boundary_analysis",
      ],
      deniedTools: [],
      readOnly: true,
      qualityFocus: ["maintainability", "reliability"],
      systemPrompt:
        "You are the Code Reviewer agent. Review for correctness, adherence to patterns, edge cases, simplicity, and alignment with quality scenarios. Be constructive and specific.",
    },
  };

  return roles[roleId] ?? null;
}
