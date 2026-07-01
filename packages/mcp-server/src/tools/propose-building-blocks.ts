import { z } from "zod";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  loadConfig,
  indexConfiguredProject,
  proposeBuildingBlocks,
  proposalToBuildingBlocksMarkdown,
  refreshFromDocs,
  detectDrift,
  atomicWriteFileSync,
} from "@arcbridge/core";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, textResult } from "../helpers.js";

export function registerProposeBuildingBlocks(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "arcbridge_propose_building_blocks",
    "Reverse-engineer a building-block decomposition for an existing codebase. Indexes the code, clusters files by directory, and derives each block's dependencies (interfaces) from the real symbol graph. Use this to adopt ArcBridge on a brownfield project instead of hand-writing building blocks. Returns the proposed blocks with evidence (file counts, dependency edges, key exported symbols) so you can refine the auto-generated responsibilities. Set `apply` to write the proposal to the building-blocks doc (covers every indexed file → zero undocumented-module drift); then refine responsibilities and commit.",
    {
      target_dir: z.string().describe("Absolute path to the project directory"),
      service: z
        .string()
        .optional()
        .describe("Limit the proposal to one configured service. Omit to propose across the whole project (each service becomes a top-level block; a single-service project is subdivided by directory)."),
      max_blocks: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Maximum blocks when subdividing a single service by directory (default: 12). No effect in multi-service mode, where each service is one block — pass `service` to subdivide one."),
      apply: z
        .boolean()
        .optional()
        .describe("Write the proposal to .arcbridge/arc42/05-building-blocks.md and reload (default: false — only returns the proposal)."),
    },
    async (params) => {
      const db = ensureDb(ctx, params.target_dir);
      if (!db) return notInitialized();

      try {
        const config = loadConfig(params.target_dir);
        const { warnings } = await indexConfiguredProject(db, params.target_dir, {
          services: config.config?.services ?? [],
        });

        const proposal = proposeBuildingBlocks(db, {
          service: params.service,
          maxBlocks: params.max_blocks,
        });

            "No building blocks could be proposed — no indexed symbols were found. Ensure the project contains indexable source files and any required configuration (e.g. a tsconfig for TypeScript), or configure services, then try again.",
        }

        const lines: string[] = [
          "# Proposed Building Blocks",
          "",
          `From ${proposal.stats.files} files / ${proposal.stats.symbols} symbols / ${proposal.stats.edges} dependency edges across service(s): ${proposal.stats.services.join(", ")}.`,
          ...(warnings.length ? ["", `_Indexing notes: ${warnings.join("; ")}_`] : []),
          "",
        ];
        for (const b of proposal.blocks) {
          const deps = b.interfaces.length ? ` — depends on: ${b.interfaces.join(", ")}` : " — no internal dependencies";
          lines.push(
            `## \`${b.id}\` (${b.name}) — service: ${b.service}`,
            `- **Code paths:** \`${b.code_paths.map((p) => p || ".").join("`, `")}\`${deps}`,
            `- **Evidence:** ${b.evidence.fileCount} files; ${b.evidence.internalEdges} internal / ${b.evidence.inboundEdges} inbound / ${b.evidence.outboundEdges} outbound edges; confidence ${b.confidence}.`,
            ...(b.evidence.topSymbols.length ? [`- **Key exports:** ${b.evidence.topSymbols.join(", ")}`] : []),
            `- **Draft responsibility:** ${b.responsibility}`,
            "",
          );
        }
        if (proposal.unassigned.length) {
          lines.push(`_${proposal.unassigned.length} indexed file(s) are unassigned._`, "");
        }

        if (params.apply) {
          const blocksPath = join(params.target_dir, ".arcbridge", "arc42", "05-building-blocks.md");
          atomicWriteFileSync(
            blocksPath,
            proposalToBuildingBlocksMarkdown(proposal, new Date().toISOString()),
          );
          refreshFromDocs(db, params.target_dir);
          const undoc = detectDrift(db, {
            projectType: config.config?.project_type,
            ignorePaths: config.config?.drift?.ignore_paths,
          }).filter((e) => e.kind === "undocumented_module");
          lines.push(
            "---",
            `**Applied** to \`.arcbridge/arc42/05-building-blocks.md\`. ${undoc.length === 0 ? "Every indexed file is mapped (0 undocumented modules)." : `${undoc.length} file(s) still unmapped.`}`,
            "Next: refine the draft responsibilities (they're auto-generated), then commit `.arcbridge/`.",
          );
        } else {
          lines.push(
            "---",
            "Review the blocks above. Re-run with `apply: true` to write them to the building-blocks doc, then refine the auto-generated responsibilities.",
          );
        }

        return textResult(lines.join("\n"));
      } catch (err) {
        return textResult(`Proposal failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );
}
