import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  resolveRef,
  getChangedFiles,
  getHeadSha,
  setSyncCommit,
  type ChangedFile,
} from "@archlens/core";
import type Database from "better-sqlite3";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, textResult, safeParseJson, normalizeCodePath } from "../helpers.js";

interface BlockRow {
  id: string;
  name: string;
  code_paths: string;
  interfaces: string;
  description: string | null;
}

interface SymbolRow {
  name: string;
  kind: string;
  file_path: string;
  is_exported: number;
}

export function registerProposeArc42Update(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "archlens_propose_arc42_update",
    "Analyze code changes since a reference point and generate specific, actionable proposals for updating arc42 documentation.",
    {
      target_dir: z
        .string()
        .describe("Absolute path to the project directory"),
      changes_since: z
        .string()
        .default("last-sync")
        .describe("Reference point: 'last-commit', 'last-sync', 'last-phase', or a git ref"),
      update_sync_point: z
        .boolean()
        .default(false)
        .describe("Update the stored sync commit to HEAD after generating proposals"),
    },
    async (params) => {
      const db = ensureDb(ctx, params.target_dir);
      if (!db) return notInitialized();

      const projectRoot = ctx.projectRoot ?? params.target_dir;
      const ref = resolveRef(projectRoot, params.changes_since, db);
      const changedFiles = getChangedFiles(projectRoot, ref.sha);

      if (changedFiles.length === 0) {
        return textResult(
          `# Arc42 Update Proposals\n\nNo code changes detected since ${ref.label}. Documentation is up to date.`,
        );
      }

      const blocks = db
        .prepare("SELECT id, name, code_paths, interfaces, description FROM building_blocks")
        .all() as BlockRow[];

      const proposals = generateProposals(db, blocks, changedFiles, projectRoot);

      const lines: string[] = [
        `# Arc42 Update Proposals`,
        "",
        `**Changes since:** ${ref.label}`,
        `**Files changed:** ${changedFiles.length}`,
        `**Proposals:** ${proposals.length}`,
        "",
      ];

      if (proposals.length === 0) {
        lines.push(
          "No documentation updates needed — all changes are within documented building blocks and don't introduce new patterns.",
        );
      } else {
        // Group proposals by target section
        const bySection = new Map<string, Proposal[]>();
        for (const p of proposals) {
          const existing = bySection.get(p.section) ?? [];
          existing.push(p);
          bySection.set(p.section, existing);
        }

        for (const [section, items] of bySection) {
          lines.push(`## ${section}`, "");
          for (const item of items) {
            lines.push(`### ${item.title}`, "");
            lines.push(item.description, "");
            if (item.suggestedChange) {
              lines.push("**Suggested change:**", "", item.suggestedChange, "");
            }
          }
        }
      }

      // Update sync point if requested
      if (params.update_sync_point) {
        const headSha = getHeadSha(projectRoot);
        if (headSha) {
          setSyncCommit(db, "last_sync_commit", headSha);
          lines.push("---", `*Sync point updated to ${headSha.slice(0, 7)}.*`, "");
        }
      }

      return textResult(lines.join("\n"));
    },
  );
}

interface Proposal {
  section: string;
  title: string;
  description: string;
  suggestedChange: string | null;
}

function generateProposals(
  db: Database.Database,
  blocks: BlockRow[],
  changedFiles: ChangedFile[],
  _projectRoot: string,
): Proposal[] {
  const proposals: Proposal[] = [];

  // Build file → block mapping
  const fileToBlock = new Map<string, BlockRow>();
  const unmappedFiles: ChangedFile[] = [];

  for (const cf of changedFiles) {
    if (cf.status === "deleted") continue;
    let matched = false;
    for (const block of blocks) {
      const paths = safeParseJson<string[]>(block.code_paths, []);
      for (const cp of paths) {
        const prefix = normalizeCodePath(cp);
        if (cf.path.startsWith(prefix) || cf.path === prefix) {
          fileToBlock.set(cf.path, block);
          matched = true;
          break;
        }
      }
      if (matched) break;
    }
    if (!matched) {
      unmappedFiles.push(cf);
    }
  }

  // 1. New files not mapped to any building block
  if (unmappedFiles.length > 0) {
    // Group by directory to suggest block assignments
    const byDir = new Map<string, ChangedFile[]>();
    for (const f of unmappedFiles) {
      const dir = f.path.replace(/\/[^/]+$/, "/");
      const existing = byDir.get(dir) ?? [];
      existing.push(f);
      byDir.set(dir, existing);
    }

    for (const [dir, files] of byDir) {
      const fileList = files.map((f) => `\`${f.path}\``).join(", ");
      proposals.push({
        section: "05 Building Block View",
        title: `Unmapped files in \`${dir}\``,
        description: `${files.length} file(s) in \`${dir}\` are not covered by any building block: ${fileList}`,
        suggestedChange: `Add \`${dir}\` to an existing building block's \`code_paths\`, or create a new building block for this directory.`,
      });
    }
  }

  // 2. New exported symbols in changed files that could be interfaces
  const addedOrModified = changedFiles.filter(
    (f) => f.status === "added" || f.status === "modified",
  );

  for (const cf of addedOrModified) {
    const block = fileToBlock.get(cf.path);
    if (!block) continue;

    // Find new exported symbols in this file
    const symbols = db
      .prepare(
        "SELECT name, kind, is_exported FROM symbols WHERE file_path = ? AND is_exported = 1",
      )
      .all(cf.path) as SymbolRow[];

    if (symbols.length === 0) continue;

    // Check if there are cross-block consumers of these symbols
    for (const sym of symbols) {
      const consumers = findCrossBlockConsumers(
        db,
        `${cf.path}::${sym.name}#${sym.kind}`,
        block.id,
        blocks,
      );

      if (consumers.length > 0) {
        const consumerNames = consumers.map((c) => `\`${c}\``).join(", ");
        proposals.push({
          section: "05 Building Block View",
          title: `New cross-block interface: \`${sym.name}\``,
          description: `Exported ${sym.kind} \`${sym.name}\` in block \`${block.name}\` is consumed by blocks: ${consumerNames}. This should be documented as an interface.`,
          suggestedChange: `Add \`${sym.name}\` to the interfaces section of building block \`${block.id}\` in \`.archlens/arc42/05-building-blocks.md\`.`,
        });
      }
    }
  }

  // 3. Deleted files that were in building blocks
  const deletedFiles = changedFiles.filter((f) => f.status === "deleted");
  for (const cf of deletedFiles) {
    for (const block of blocks) {
      const paths = safeParseJson<string[]>(block.code_paths, []);
      for (const cp of paths) {
        const prefix = normalizeCodePath(cp);
        if (cf.path.startsWith(prefix)) {
          // Check if this was the only file under that code_path
          const remaining = db
            .prepare("SELECT 1 FROM symbols WHERE file_path LIKE ? LIMIT 1")
            .get(`${prefix}%`) as unknown | undefined;

          if (!remaining) {
            proposals.push({
              section: "05 Building Block View",
              title: `Empty code path in \`${block.name}\``,
              description: `All files under \`${cp}\` in block \`${block.name}\` (${block.id}) have been deleted. The code_path no longer matches any code.`,
              suggestedChange: `Remove \`${cp}\` from building block \`${block.id}\`, or update it to reflect the new file structure.`,
            });
          }
          break;
        }
      }
    }
  }

  // 4. Check for new route files (might need architecture section updates)
  const routeFiles = addedOrModified.filter(
    (f) => f.path.includes("/app/") && /\/(page|layout|route)\.(ts|tsx|js|jsx)$/.test(f.path),
  );

  if (routeFiles.length > 0) {
    const routeList = routeFiles.map((f) => `\`${f.path}\``).join(", ");
    proposals.push({
      section: "06 Runtime View",
      title: "New route files detected",
      description: `${routeFiles.length} route file(s) were added or modified: ${routeList}. Consider updating the runtime view to reflect new user flows.`,
      suggestedChange: null,
    });
  }

  return proposals;
}

/**
 * Find building blocks that consume a symbol from a different block.
 */
function findCrossBlockConsumers(
  db: Database.Database,
  symbolId: string,
  sourceBlockId: string,
  blocks: BlockRow[],
): string[] {
  const consumers = db
    .prepare(
      `SELECT DISTINCT s.file_path
       FROM dependencies d
       JOIN symbols s ON d.source_symbol = s.id
       WHERE d.target_symbol = ?
         AND d.kind IN ('imports', 'calls', 'renders')`,
    )
    .all(symbolId) as { file_path: string }[];

  const consumerBlocks = new Set<string>();

  for (const { file_path } of consumers) {
    for (const block of blocks) {
      if (block.id === sourceBlockId) continue;
      const paths = safeParseJson<string[]>(block.code_paths, []);
      for (const cp of paths) {
        const prefix = normalizeCodePath(cp);
        if (file_path.startsWith(prefix)) {
          consumerBlocks.add(block.name);
          break;
        }
      }
    }
  }

  return [...consumerBlocks];
}
