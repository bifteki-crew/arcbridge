import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type Database from "better-sqlite3";
import {
  loadRole,
  loadRoles,
  detectDrift,
  resolveRef,
  getChangedFiles,
  type ChangedFile,
  type DriftEntry,
} from "@archlens/core";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, textResult, safeParseJson, normalizeCodePath } from "../helpers.js";

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
  priority: string;
  status: string;
}

interface PhaseRow {
  id: string;
  name: string;
  status: string;
}

interface TaskRow {
  id: string;
  title: string;
  status: string;
  phase_id: string;
}

interface RoleDef {
  name: string;
  qualityFocus: string[];
}

const SCOPE_VALUES = ["last-commit", "current-phase", "full-project"] as const;

export function registerRunRoleCheck(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "archlens_run_role_check",
    "Run a role-specific architectural analysis: resolves the role and executes relevant checks (drift, quality scenarios, boundaries, changed files) based on the role's focus areas.",
    {
      target_dir: z
        .string()
        .describe("Absolute path to the project directory"),
      role: z
        .string()
        .describe(
          "Role ID to run checks for (e.g., 'security-reviewer', 'quality-guardian', 'architect', 'phase-manager', 'code-reviewer')",
        ),
      scope: z
        .enum(SCOPE_VALUES)
        .default("current-phase")
        .describe(
          "Scope of analysis: 'last-commit' (recent changes), 'current-phase' (since phase start), 'full-project' (everything)",
        ),
    },
    async (params) => {
      const db = ensureDb(ctx, params.target_dir);
      if (!db) return notInitialized();

      const projectRoot = ctx.projectRoot ?? params.target_dir;

      // Resolve role: file-first, then built-in
      const fileResult = loadRole(projectRoot, params.role);
      const role = fileResult.role ?? null;
      const roleDef: RoleDef | null = role
        ? { name: role.name, qualityFocus: role.quality_focus }
        : getBuiltInRoleDef(params.role);

      if (!roleDef) {
        const builtInIds = [
          "architect", "implementer", "security-reviewer",
          "quality-guardian", "phase-manager", "onboarding", "code-reviewer",
        ];
        const fileRoles = loadRoles(projectRoot);
        const fileIds = fileRoles.roles.map((r) => r.role_id);
        const availableIds = [...new Set([...fileIds, ...builtInIds])].sort();
        return textResult(
          `Unknown role: \`${params.role}\`. Available roles: ${availableIds.map((r) => `\`${r}\``).join(", ")}`,
        );
      }

      const lines: string[] = [
        `# Role Check: ${roleDef.name}`,
        "",
        `**Scope:** ${params.scope}`,
        "",
      ];

      // Get changed files for scoped checks
      const changedFiles = getChangedFilesForScope(db, projectRoot, params.scope);
      if (changedFiles && changedFiles.length > 0) {
        lines.push(`**Changed files:** ${changedFiles.length}`, "");
      }

      // Dispatch to role-specific checks
      switch (params.role) {
        case "security-reviewer":
          runSecurityReviewerCheck(db, lines, changedFiles);
          break;
        case "quality-guardian":
          runQualityGuardianCheck(db, lines);
          break;
        case "architect":
          runArchitectCheck(db, lines);
          break;
        case "phase-manager":
          runPhaseManagerCheck(db, projectRoot, lines);
          break;
        case "code-reviewer":
          runCodeReviewerCheck(db, lines, changedFiles);
          break;
        default:
          runCustomRoleCheck(db, lines, roleDef);
          break;
      }

      return textResult(lines.join("\n"));
    },
  );
}

// ---------------------------------------------------------------------------
// Scope resolution
// ---------------------------------------------------------------------------

function getChangedFilesForScope(
  db: Database.Database,
  projectRoot: string,
  scope: (typeof SCOPE_VALUES)[number],
): ChangedFile[] | null {
  if (scope === "full-project") return null;

  const since = scope === "last-commit" ? "last-commit" : "last-phase";
  const ref = resolveRef(projectRoot, since, db);
  try {
    return getChangedFiles(projectRoot, ref.sha);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Built-in role definitions (subset needed for this tool)
// ---------------------------------------------------------------------------

function getBuiltInRoleDef(roleId: string): RoleDef | null {
  const defs: Record<string, RoleDef> = {
    architect: { name: "Architect", qualityFocus: ["maintainability", "reliability", "security", "performance"] },
    implementer: { name: "Implementer", qualityFocus: ["maintainability", "performance"] },
    "security-reviewer": { name: "Security Reviewer", qualityFocus: ["security"] },
    "quality-guardian": { name: "Quality Guardian", qualityFocus: ["security", "performance", "accessibility", "reliability", "maintainability"] },
    "phase-manager": { name: "Phase Manager", qualityFocus: [] },
    onboarding: { name: "Onboarding Guide", qualityFocus: [] },
    "code-reviewer": { name: "Code Reviewer", qualityFocus: ["maintainability", "reliability"] },
  };
  return defs[roleId] ?? null;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function appendDriftSection(db: Database.Database, lines: string[]): void {
  const entries = detectDrift(db);

  lines.push("## Drift Check", "");

  if (entries.length === 0) {
    lines.push("No architecture drift detected.", "");
    return;
  }

  const errors = entries.filter((e) => e.severity === "error").length;
  const warnings = entries.filter((e) => e.severity === "warning").length;
  const infos = entries.filter((e) => e.severity === "info").length;
  lines.push(`**${errors}** errors, **${warnings}** warnings, **${infos}** info`, "");

  const byKind = groupBy(entries, (e) => e.kind);
  const kindLabels: Record<string, string> = {
    undocumented_module: "Undocumented Modules",
    missing_module: "Missing Modules",
    dependency_violation: "Dependency Violations",
    stale_adr: "Stale ADR References",
    unlinked_test: "Unlinked Tests",
  };

  const severityIcon: Record<string, string> = {
    error: "ERROR",
    warning: "WARN",
    info: "INFO",
  };

  for (const [kind, items] of byKind) {
    lines.push(`### ${kindLabels[kind] ?? kind}`, "");
    for (const item of items) {
      const icon = severityIcon[item.severity] ?? item.severity;
      lines.push(`- [${icon}] ${item.description}`);
    }
    lines.push("");
  }
}

function appendQualityScenarios(
  db: Database.Database,
  lines: string[],
  categoryFilter?: string[],
): void {
  const allScenarios = db
    .prepare(
      "SELECT id, name, category, priority, status FROM quality_scenarios ORDER BY priority, category",
    )
    .all() as ScenarioRow[];

  const scenarios = categoryFilter
    ? allScenarios.filter(
        (s) => categoryFilter.includes(s.category) || s.priority === "must",
      )
    : allScenarios;

  const title = categoryFilter
    ? "## Quality Scenarios (Filtered)"
    : "## Quality Scenarios";
  lines.push(title, "");

  if (scenarios.length === 0) {
    lines.push("No matching quality scenarios found.", "");
    return;
  }

  const passing = scenarios.filter((s) => s.status === "passing").length;
  const failing = scenarios.filter((s) => s.status === "failing").length;
  const untested = scenarios.filter(
    (s) => s.status === "untested" || s.status === "partial",
  ).length;
  lines.push(
    `**Total:** ${scenarios.length} | **Passing:** ${passing} | **Failing:** ${failing} | **Untested/Partial:** ${untested}`,
    "",
  );

  for (const s of scenarios) {
    const icon =
      s.status === "passing"
        ? "PASS"
        : s.status === "failing"
          ? "FAIL"
          : "?";
    lines.push(
      `- [${icon}] **${s.id}: ${s.name}** [${s.category}] (${s.priority})`,
    );
  }
  lines.push("");
}

function appendChangedFilesList(
  lines: string[],
  changedFiles: ChangedFile[] | null,
): void {
  if (!changedFiles || changedFiles.length === 0) return;

  lines.push("## Changed Files", "");
  const limit = 30;
  const display = changedFiles.slice(0, limit);
  for (const f of display) {
    const tag = f.status === "added" ? "A" : f.status === "deleted" ? "D" : "M";
    lines.push(`- [${tag}] \`${f.path}\``);
  }
  if (changedFiles.length > limit) {
    lines.push(`- ... and ${changedFiles.length - limit} more`);
  }
  lines.push("");
}

function appendBuildingBlocks(
  db: Database.Database,
  lines: string[],
): void {
  const blocks = db
    .prepare("SELECT id, name, responsibility FROM building_blocks")
    .all() as BlockRow[];

  lines.push("## Building Blocks", "");

  if (blocks.length === 0) {
    lines.push("No building blocks defined.", "");
    return;
  }

  for (const b of blocks) {
    lines.push(`- **${b.name}** (\`${b.id}\`): ${b.responsibility}`);
  }
  lines.push("");
}

function mapFilesToBlocks(
  db: Database.Database,
  changedFiles: ChangedFile[],
): { mapped: Map<string, string[]>; unmapped: string[] } {
  const blocks = db
    .prepare("SELECT id, name, code_paths FROM building_blocks")
    .all() as BlockRow[];

  const mapped = new Map<string, string[]>();
  const unmapped: string[] = [];
  const changedPaths = changedFiles
    .filter((f) => f.status !== "deleted")
    .map((f) => f.path);

  for (const path of changedPaths) {
    let matched = false;
    for (const block of blocks) {
      const paths = safeParseJson<string[]>(block.code_paths, []);
      for (const cp of paths) {
        const prefix = normalizeCodePath(cp);
        if (path.startsWith(prefix)) {
          const existing = mapped.get(block.id) ?? [];
          existing.push(path);
          mapped.set(block.id, existing);
          matched = true;
          break;
        }
      }
      if (matched) break;
    }
    if (!matched) unmapped.push(path);
  }

  return { mapped, unmapped };
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const existing = map.get(key) ?? [];
    existing.push(item);
    map.set(key, existing);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Role-specific check implementations
// ---------------------------------------------------------------------------

function runSecurityReviewerCheck(
  db: Database.Database,
  lines: string[],
  changedFiles: ChangedFile[] | null,
): void {
  // Security quality scenarios
  appendQualityScenarios(db, lines, ["security"]);

  // Drift check
  appendDriftSection(db, lines);

  // Boundary analysis summary
  const clientComponents = db
    .prepare(
      `SELECT COUNT(*) as count FROM components WHERE is_client = 1`,
    )
    .get() as { count: number };
  const serverActions = db
    .prepare(
      `SELECT COUNT(*) as count FROM components WHERE is_server_action = 1`,
    )
    .get() as { count: number };
  const crossBoundary = db
    .prepare(
      `SELECT COUNT(*) as count
       FROM dependencies d
       JOIN components cs ON d.source_symbol = cs.symbol_id
       JOIN components ct ON d.target_symbol = ct.symbol_id
       WHERE cs.is_client != ct.is_client
         AND d.kind IN ('imports', 'calls', 'renders')`,
    )
    .get() as { count: number };

  lines.push("## Boundary Summary", "");
  lines.push(`- **Client components:** ${clientComponents.count}`);
  lines.push(`- **Server actions:** ${serverActions.count}`);
  lines.push(`- **Cross-boundary edges:** ${crossBoundary.count}`);
  lines.push("");

  // Unauthenticated API routes
  const unauthRoutes = db
    .prepare(
      `SELECT route_path FROM routes WHERE kind = 'api-route' AND has_auth = 0`,
    )
    .all() as { route_path: string }[];

  if (unauthRoutes.length > 0) {
    lines.push("## Unauthenticated API Routes", "");
    for (const r of unauthRoutes) {
      lines.push(`- \`${r.route_path}\``);
    }
    lines.push("");
  }

  // Changed files
  appendChangedFilesList(lines, changedFiles);
}

function runQualityGuardianCheck(
  db: Database.Database,
  lines: string[],
): void {
  // All quality scenarios (no filter)
  appendQualityScenarios(db, lines);

  // Drift check
  appendDriftSection(db, lines);

  // Scenario verification status summary
  const scenarios = db
    .prepare(
      `SELECT verification, status, COUNT(*) as count
       FROM quality_scenarios
       GROUP BY verification, status`,
    )
    .all() as { verification: string; status: string; count: number }[];

  if (scenarios.length > 0) {
    lines.push("## Verification Coverage", "");
    for (const s of scenarios) {
      lines.push(
        `- **${s.verification}** / ${s.status}: ${s.count} scenario(s)`,
      );
    }
    lines.push("");
  }
}

function runArchitectCheck(
  db: Database.Database,
  lines: string[],
): void {
  // Building blocks overview
  appendBuildingBlocks(db, lines);

  // Drift check (which includes dependency violations)
  appendDriftSection(db, lines);

  // Dependency violations specifically highlighted
  const blocks = db
    .prepare("SELECT id, name, code_paths, interfaces FROM building_blocks")
    .all() as BlockRow[];

  if (blocks.length > 1) {
    const violations: string[] = [];

    for (const block of blocks) {
      const declaredInterfaces = new Set(
        safeParseJson<string[]>(block.interfaces, []),
      );
      const codePaths = safeParseJson<string[]>(block.code_paths, []);

      for (const cp of codePaths) {
        const prefix = normalizeCodePath(cp);
        // Find outgoing cross-block deps from files in this block
        const outgoing = db
          .prepare(
            `SELECT DISTINCT st.file_path as target_file
             FROM dependencies d
             JOIN symbols ss ON d.source_symbol = ss.id
             JOIN symbols st ON d.target_symbol = st.id
             WHERE ss.file_path LIKE ? || '%'
               AND d.kind IN ('imports', 'calls', 'renders')`,
          )
          .all(prefix) as { target_file: string }[];

        for (const { target_file } of outgoing) {
          for (const targetBlock of blocks) {
            if (targetBlock.id === block.id) continue;
            const tPaths = safeParseJson<string[]>(targetBlock.code_paths, []);
            for (const tp of tPaths) {
              const tPrefix = normalizeCodePath(tp);
              if (
                target_file.startsWith(tPrefix) &&
                !declaredInterfaces.has(targetBlock.id)
              ) {
                violations.push(
                  `Block \`${block.name}\` depends on \`${targetBlock.name}\` (undeclared interface)`,
                );
              }
            }
          }
        }
      }
    }

    const unique = [...new Set(violations)];
    if (unique.length > 0) {
      lines.push("## Undeclared Cross-Block Dependencies", "");
      for (const v of unique) {
        lines.push(`- [ERROR] ${v}`);
      }
      lines.push("");
    }
  }
}

function runPhaseManagerCheck(
  db: Database.Database,
  projectRoot: string,
  lines: string[],
): void {
  // Current phase tasks
  const currentPhase = db
    .prepare(
      "SELECT id, name, status FROM phases WHERE status = 'in-progress' LIMIT 1",
    )
    .get() as PhaseRow | undefined;

  if (currentPhase) {
    const tasks = db
      .prepare("SELECT id, title, status, phase_id FROM tasks WHERE phase_id = ?")
      .all(currentPhase.id) as TaskRow[];

    const done = tasks.filter((t) => t.status === "done").length;
    const inProgress = tasks.filter((t) => t.status === "in-progress").length;
    const todo = tasks.filter((t) => t.status === "todo").length;
    const blocked = tasks.filter((t) => t.status === "blocked").length;

    lines.push(
      `## Current Phase: ${currentPhase.name}`,
      "",
      `**Progress:** ${done}/${tasks.length} done, ${inProgress} in-progress, ${todo} todo, ${blocked} blocked`,
      "",
    );

    for (const t of tasks) {
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
  } else {
    lines.push("## Phase Status", "", "No phase currently in progress.", "");
  }

  // Drift check
  appendDriftSection(db, lines);

  // Quality gate status
  lines.push("## Quality Gate Status", "");

  const mustScenarios = db
    .prepare(
      "SELECT id, name, status FROM quality_scenarios WHERE priority = 'must'",
    )
    .all() as ScenarioRow[];

  if (mustScenarios.length === 0) {
    lines.push("No must-have quality scenarios defined.", "");
  } else {
    const passing = mustScenarios.filter((s) => s.status === "passing").length;
    const failing = mustScenarios.filter((s) => s.status === "failing").length;
    const gateOk = failing === 0;
    lines.push(
      `**Must-have scenarios:** ${passing}/${mustScenarios.length} passing`,
      `**Gate status:** ${gateOk ? "READY" : "BLOCKED"}`,
      "",
    );
    if (failing > 0) {
      for (const s of mustScenarios.filter((s) => s.status !== "passing")) {
        lines.push(`- [FAIL] ${s.id}: ${s.name} (${s.status})`);
      }
      lines.push("");
    }
  }

  // Changed files since last sync
  const ref = resolveRef(projectRoot, "last-sync", db);
  try {
    const changedFiles = getChangedFiles(projectRoot, ref.sha);
    if (changedFiles.length > 0) {
      lines.push(`## Changes Since Last Sync (${ref.label})`, "");
      appendChangedFilesList(lines, changedFiles);
    }
  } catch {
    // git not available or ref invalid — skip
  }
}

function runCodeReviewerCheck(
  db: Database.Database,
  lines: string[],
  changedFiles: ChangedFile[] | null,
): void {
  if (!changedFiles || changedFiles.length === 0) {
    lines.push(
      "## Changed Files",
      "",
      "No changed files in the selected scope. Use a different scope or specify 'full-project'.",
      "",
    );
    return;
  }

  // Changed files
  appendChangedFilesList(lines, changedFiles);

  // Map to building blocks
  const { mapped, unmapped } = mapFilesToBlocks(db, changedFiles);

  const blocks = db
    .prepare("SELECT id, name, responsibility FROM building_blocks")
    .all() as BlockRow[];

  if (mapped.size > 0) {
    lines.push("## Affected Building Blocks", "");
    for (const [blockId, files] of mapped) {
      const block = blocks.find((b) => b.id === blockId);
      const name = block ? block.name : blockId;
      const resp = block ? block.responsibility : "";
      lines.push(`### ${name} (\`${blockId}\`)`, "");
      if (resp) lines.push(`**Responsibility:** ${resp}`, "");
      lines.push(`**Changed files:** ${files.length}`, "");
      for (const f of files.slice(0, 10)) {
        lines.push(`- \`${f}\``);
      }
      if (files.length > 10) {
        lines.push(`- ... and ${files.length - 10} more`);
      }
      lines.push("");
    }
  }

  if (unmapped.length > 0) {
    lines.push("## Unmapped Files", "");
    lines.push(
      `${unmapped.length} file(s) not mapped to any building block:`,
      "",
    );
    for (const f of unmapped.slice(0, 10)) {
      lines.push(`- \`${f}\``);
    }
    if (unmapped.length > 10) {
      lines.push(`- ... and ${unmapped.length - 10} more`);
    }
    lines.push("");
  }
}

function runCustomRoleCheck(
  db: Database.Database,
  lines: string[],
  roleDef: RoleDef,
): void {
  // Quality scenarios matching quality_focus
  if (roleDef.qualityFocus.length > 0) {
    appendQualityScenarios(db, lines, roleDef.qualityFocus);
  } else {
    appendQualityScenarios(db, lines);
  }

  // Drift check
  appendDriftSection(db, lines);
}
