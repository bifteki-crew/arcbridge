import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  resolveRef,
  getChangedFiles,
  detectDrift,
  type ChangedFile,
} from "@arcbridge/core";
import type { Database } from "@arcbridge/core";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, textResult, safeParseJson, normalizeCodePath } from "../helpers.js";

interface BlockRow {
  id: string;
  name: string;
  code_paths: string;
  interfaces: string;
}

interface RouteRow {
  route_path: string;
  kind: string;
  has_auth: number;
}


export function registerGetPracticeReview(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "arcbridge_get_practice_review",
    "Structured, practice-aware review of recent code changes across 5 dimensions: Architecture, Security, Testing, Documentation, and Complexity.",
    {
      target_dir: z
        .string()
        .describe("Absolute path to the project directory"),
      since: z
        .string()
        .default("last-commit")
        .describe("Reference point: 'last-commit', 'last-session', or 'last-phase'"),
    },
    async (params) => {
      const db = ensureDb(ctx, params.target_dir);
      if (!db) return notInitialized();

      const projectRoot = ctx.projectRoot ?? params.target_dir;
      const ref = resolveRef(projectRoot, params.since, db);
      const changedFiles = getChangedFiles(projectRoot, ref.sha);

      if (changedFiles.length === 0) {
        return textResult(
          `# Practice Review\n\nNo changes detected since ${ref.label}. Nothing to review.`,
        );
      }

      const lines: string[] = [
        "# Practice Review",
        "",
        `**Since:** ${ref.label}`,
        `**Files changed:** ${changedFiles.length}`,
        "",
      ];

      const findings: Finding[] = [];

      // Run all 5 dimensions
      reviewArchitecture(db, changedFiles, findings);
      reviewSecurity(db, changedFiles, findings);
      reviewTesting(db, changedFiles, findings);
      reviewDocumentation(db, changedFiles, findings);
      reviewComplexity(db, changedFiles, findings);

      if (findings.length === 0) {
        lines.push("All checks passed. No issues found across the 5 practice dimensions.");
        return textResult(lines.join("\n"));
      }

      // Group by dimension
      const byDimension = new Map<string, Finding[]>();
      for (const f of findings) {
        const existing = byDimension.get(f.dimension) ?? [];
        existing.push(f);
        byDimension.set(f.dimension, existing);
      }

      const dimensionIcons: Record<string, string> = {
        Architecture: "1",
        Security: "2",
        Testing: "3",
        Documentation: "4",
        Complexity: "5",
      };

      // Summary
      const errors = findings.filter((f) => f.severity === "error").length;
      const warnings = findings.filter((f) => f.severity === "warning").length;
      const infos = findings.filter((f) => f.severity === "info").length;
      lines.push(
        `**${errors}** errors, **${warnings}** warnings, **${infos}** info`,
        "",
      );

      for (const dim of ["Architecture", "Security", "Testing", "Documentation", "Complexity"]) {
        const items = byDimension.get(dim);
        const num = dimensionIcons[dim] ?? "?";
        if (!items || items.length === 0) {
          lines.push(`## ${num}. ${dim} ✓`, "", `No issues found.`, "");
          continue;
        }

        lines.push(`## ${num}. ${dim} (${items.length} findings)`, "");
        for (const item of items) {
          const icon = item.severity === "error" ? "ERROR" : item.severity === "warning" ? "WARN" : "INFO";
          lines.push(`- [${icon}] ${item.description}`);
          if (item.action) {
            lines.push(`  → **Action:** ${item.action}`);
          }
        }
        lines.push("");
      }

      return textResult(lines.join("\n"));
    },
  );
}

interface Finding {
  dimension: string;
  severity: "error" | "warning" | "info";
  description: string;
  action: string | null;
}

// --- Dimension 1: Architecture ---

function reviewArchitecture(
  db: Database,
  changedFiles: ChangedFile[],
  findings: Finding[],
): void {
  const blocks = db
    .prepare("SELECT id, name, code_paths, interfaces FROM building_blocks")
    .all() as BlockRow[];

  if (blocks.length === 0) return;

  // Check for cross-boundary dependencies in changed files
  const changedPaths = new Set(
    changedFiles.filter((f) => f.status !== "deleted").map((f) => f.path),
  );

  // Map changed files to blocks
  const changedByBlock = new Map<string, string[]>();
  const unmapped: string[] = [];

  for (const path of changedPaths) {
    let matched = false;
    for (const block of blocks) {
      const paths = safeParseJson<string[]>(block.code_paths, []);
      for (const cp of paths) {
        const prefix = normalizeCodePath(cp);
        if (path.startsWith(prefix)) {
          const existing = changedByBlock.get(block.id) ?? [];
          existing.push(path);
          changedByBlock.set(block.id, existing);
          matched = true;
          break;
        }
      }
      if (matched) break;
    }
    if (!matched) unmapped.push(path);
  }

  // Flag unmapped files
  if (unmapped.length > 0) {
    findings.push({
      dimension: "Architecture",
      severity: "warning",
      description: `${unmapped.length} changed file(s) not mapped to any building block: ${unmapped.slice(0, 3).map((f) => `\`${f}\``).join(", ")}${unmapped.length > 3 ? ` and ${unmapped.length - 3} more` : ""}`,
      action: "Map these files to building blocks in `.arcbridge/arc42/05-building-blocks.md`",
    });
  }

  // Check cross-block deps from changed files
  for (const [blockId, files] of changedByBlock) {
    const block = blocks.find((b) => b.id === blockId);
    if (!block) continue;

    const declaredInterfaces = new Set(safeParseJson<string[]>(block.interfaces, []));

    for (const filePath of files) {
      // Find outgoing deps from this file to other blocks
      const outgoing = db
        .prepare(
          `SELECT DISTINCT st.file_path as target_file
           FROM dependencies d
           JOIN symbols ss ON d.source_symbol = ss.id
           JOIN symbols st ON d.target_symbol = st.id
           WHERE ss.file_path = ?
             AND d.kind IN ('imports', 'calls', 'renders')`,
        )
        .all(filePath) as { target_file: string }[];

      for (const { target_file } of outgoing) {
        // Find which block the target belongs to
        for (const targetBlock of blocks) {
          if (targetBlock.id === blockId) continue;
          const tPaths = safeParseJson<string[]>(targetBlock.code_paths, []);
          for (const cp of tPaths) {
            const prefix = normalizeCodePath(cp);
            if (target_file.startsWith(prefix) && !declaredInterfaces.has(targetBlock.id)) {
              findings.push({
                dimension: "Architecture",
                severity: "error",
                description: `\`${filePath}\` in block \`${block.name}\` depends on block \`${targetBlock.name}\` without declaring it as an interface.`,
                action: `Add \`${targetBlock.id}\` to the interfaces of block \`${blockId}\``,
              });
              break;
            }
          }
        }
      }
    }
  }
}

// --- Dimension 2: Security ---

function reviewSecurity(
  db: Database,
  changedFiles: ChangedFile[],
  findings: Finding[],
): void {
  const changedPaths = changedFiles
    .filter((f) => f.status !== "deleted")
    .map((f) => f.path);

  // Check for new API routes without auth
  const routeFiles = changedPaths.filter(
    (p) => /\/(route)\.(ts|tsx|js|jsx)$/.test(p),
  );

  for (const routePath of routeFiles) {
    // Extract the route path from file path
    const appMatch = routePath.match(/app\/(.+)\/route\./);
    if (!appMatch) continue;

    const urlPath = "/" + appMatch[1]
      .replace(/\([^)]+\)\//g, "")
      .replace(/\[\.{3}(\w+)\]/g, "*$1")
      .replace(/\[(\w+)\]/g, ":$1");

    const route = db
      .prepare("SELECT route_path, has_auth FROM routes WHERE route_path = ? AND kind = 'api-route'")
      .get(urlPath) as RouteRow | undefined;

    if (route && !route.has_auth) {
      findings.push({
        dimension: "Security",
        severity: "warning",
        description: `API route \`${route.route_path}\` does not have auth middleware detected.`,
        action: "Verify this route has authentication. Add auth middleware or mark as intentionally public.",
      });
    }
  }

  // Check for env/secret files in changes
  const sensitivePatterns = [/\.env/, /secrets?\./, /credentials/, /\.pem$/, /\.key$/];
  for (const path of changedPaths) {
    if (sensitivePatterns.some((p) => p.test(path))) {
      findings.push({
        dimension: "Security",
        severity: "error",
        description: `Potentially sensitive file changed: \`${path}\``,
        action: "Ensure this file is in .gitignore and not committed to version control.",
      });
    }
  }

  // Check for client components importing server-only patterns
  const clientFiles = changedPaths.filter((p) => p.endsWith(".tsx") || p.endsWith(".ts"));
  for (const filePath of clientFiles) {
    const comp = db
      .prepare(
        `SELECT s.name, c.is_client
         FROM components c
         JOIN symbols s ON c.symbol_id = s.id
         WHERE s.file_path = ? AND c.is_client = 1`,
      )
      .all(filePath) as { name: string; is_client: number }[];

    if (comp.length === 0) continue;

    // Check if client component imports from server-action files
    const serverImports = db
      .prepare(
        `SELECT DISTINCT st.file_path
         FROM dependencies d
         JOIN symbols ss ON d.source_symbol = ss.id
         JOIN symbols st ON d.target_symbol = st.id
         JOIN components ct ON d.target_symbol = ct.symbol_id
         WHERE ss.file_path = ?
           AND ct.is_server_action = 1
           AND d.kind = 'imports'`,
      )
      .all(filePath) as { file_path: string }[];

    for (const imp of serverImports) {
      findings.push({
        dimension: "Security",
        severity: "warning",
        description: `Client component in \`${filePath}\` imports from server action file \`${imp.file_path}\`. Verify no server secrets are exposed.`,
        action: null,
      });
    }
  }
}

// --- Dimension 3: Testing ---

function reviewTesting(
  db: Database,
  changedFiles: ChangedFile[],
  findings: Finding[],
): void {
  const changedPaths = changedFiles
    .filter((f) => f.status !== "deleted")
    .map((f) => f.path);

  const testFilePattern = /\.(test|spec)\.(ts|tsx|js|jsx)$/;
  const codeFiles = changedPaths.filter((p) => !testFilePattern.test(p) && /\.(ts|tsx|js|jsx)$/.test(p));
  const testFiles = changedPaths.filter((p) => testFilePattern.test(p));

  // Code files changed without corresponding test files
  if (codeFiles.length > 0 && testFiles.length === 0) {
    findings.push({
      dimension: "Testing",
      severity: "info",
      description: `${codeFiles.length} code file(s) changed but no test files were modified.`,
      action: "Consider whether existing tests still cover the changed behavior.",
    });
  }

  // Check quality scenarios at risk
  const scenarios = db
    .prepare(
      "SELECT id, name, linked_code, linked_blocks, status FROM quality_scenarios WHERE priority IN ('must', 'should')",
    )
    .all() as { id: string; name: string; linked_code: string; linked_blocks: string; status: string }[];

  for (const scenario of scenarios) {
    const linkedCode = safeParseJson<string[]>(scenario.linked_code, []);
    const linkedBlocks = safeParseJson<string[]>(scenario.linked_blocks, []);

    // Check if changed files overlap with linked code
    const affectedByCode = linkedCode.some((lc) =>
      changedPaths.some((cp) => cp.startsWith(lc) || cp === lc),
    );

    // Check if changed files are in linked building blocks
    let affectedByBlock = false;
    if (linkedBlocks.length > 0) {
      const blocks = db
        .prepare("SELECT id, code_paths FROM building_blocks")
        .all() as { id: string; code_paths: string }[];

      for (const blockId of linkedBlocks) {
        const block = blocks.find((b) => b.id === blockId);
        if (!block) continue;
        const paths = safeParseJson<string[]>(block.code_paths, []);
        for (const cp of paths) {
          const prefix = normalizeCodePath(cp);
          if (changedPaths.some((p) => p.startsWith(prefix))) {
            affectedByBlock = true;
            break;
          }
        }
        if (affectedByBlock) break;
      }
    }

    if (affectedByCode || affectedByBlock) {
      const severity = scenario.status === "passing" ? "warning" : "error";
      findings.push({
        dimension: "Testing",
        severity,
        description: `Quality scenario \`${scenario.id}: ${scenario.name}\` may be affected by these changes (status: ${scenario.status}).`,
        action: "Re-run tests for this quality scenario to verify it still passes.",
      });
    }
  }
}

// --- Dimension 4: Documentation ---

function reviewDocumentation(
  db: Database,
  changedFiles: ChangedFile[],
  findings: Finding[],
): void {
  // Run drift detection and report any issues
  const driftEntries = detectDrift(db);

  if (driftEntries.length > 0) {
    const errors = driftEntries.filter((d) => d.severity === "error");
    const warnings = driftEntries.filter((d) => d.severity === "warning");

    if (errors.length > 0) {
      findings.push({
        dimension: "Documentation",
        severity: "error",
        description: `${errors.length} architecture drift error(s) detected (dependency violations, etc.).`,
        action: "Run `arcbridge_check_drift` for details and resolve violations.",
      });
    }

    if (warnings.length > 0) {
      findings.push({
        dimension: "Documentation",
        severity: "warning",
        description: `${warnings.length} documentation gap(s) found (undocumented modules, missing code paths, etc.).`,
        action: "Run `arcbridge_propose_arc42_update` to generate update proposals.",
      });
    }
  }

  // Check if arc42 files were changed
  const arc42Changes = changedFiles.filter((f) =>
    f.path.includes(".arcbridge/arc42/"),
  );
  if (arc42Changes.length > 0) {
    findings.push({
      dimension: "Documentation",
      severity: "info",
      description: `${arc42Changes.length} arc42 documentation file(s) were updated.`,
      action: "Run `arcbridge_reindex` to ensure the database reflects documentation changes.",
    });
  }
}

// --- Dimension 5: Complexity ---

function reviewComplexity(
  db: Database,
  changedFiles: ChangedFile[],
  findings: Finding[],
): void {
  const changedPaths = changedFiles
    .filter((f) => f.status !== "deleted")
    .map((f) => f.path);

  for (const filePath of changedPaths) {
    if (!/\.(ts|tsx|js|jsx)$/.test(filePath)) continue;

    // Count symbols per file as a rough complexity proxy
    const symbolCount = (
      db
        .prepare("SELECT COUNT(*) as count FROM symbols WHERE file_path = ?")
        .get(filePath) as { count: number }
    ).count;

    if (symbolCount > 30) {
      findings.push({
        dimension: "Complexity",
        severity: "warning",
        description: `\`${filePath}\` has ${symbolCount} symbols — consider splitting into smaller modules.`,
        action: null,
      });
    }

    // Count outgoing dependencies as coupling metric
    const depCount = (
      db
        .prepare(
          `SELECT COUNT(DISTINCT d.target_symbol) as count
           FROM dependencies d
           JOIN symbols s ON d.source_symbol = s.id
           WHERE s.file_path = ?`,
        )
        .get(filePath) as { count: number }
    ).count;

    if (depCount > 20) {
      findings.push({
        dimension: "Complexity",
        severity: "warning",
        description: `\`${filePath}\` has ${depCount} outgoing dependencies — high coupling detected.`,
        action: "Consider reducing dependencies or introducing an abstraction layer.",
      });
    }
  }
}
