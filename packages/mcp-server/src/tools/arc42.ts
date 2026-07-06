import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { textResult } from "../helpers.js";
import { handleProposeArc42Update } from "./propose-arc42-update.js";
import { handleArc42Section, VALID_SECTIONS } from "./update-arc42-section.js";

/**
 * Consolidated arc42 documentation access (replaces arcbridge_propose_arc42_update
 * and arcbridge_update_arc42_section in 0.10.0).
 */
export function registerArc42(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "arcbridge_arc42",
    "Work with the arc42 documentation. `action: read` returns a section's markdown; `action: update` replaces a section's body (frontmatter preserved) — both require `section`. `action: propose` analyzes git changes since a reference point and suggests doc updates (building blocks, ADRs, sections). Building blocks and quality scenarios have dedicated tools.",
    {
      target_dir: z.string().describe("Absolute path to the project directory"),
      action: z.enum(["read", "update", "propose"]).describe("What to do"),
      section: z
        .enum(VALID_SECTIONS)
        .optional()
        .describe("read/update (required): arc42 section to access"),
      content: z
        .string()
        .optional()
        .describe("update (required): new markdown body for the section (frontmatter is preserved)"),
      changes_since: z
        .string()
        .default("last-sync")
        .describe("propose: reference point — 'last-commit', 'last-sync', 'last-phase', or a git ref"),
      update_sync_point: z
        .boolean()
        .default(false)
        .describe("propose: update the stored sync commit to HEAD after generating proposals"),
    },
    async (params) => {
      switch (params.action) {
        case "propose":
          return handleProposeArc42Update(ctx, {
            target_dir: params.target_dir,
            changes_since: params.changes_since,
            update_sync_point: params.update_sync_point,
          });
        case "read": {
          if (!params.section) return textResult("`action: read` requires `section`.");
          return handleArc42Section(ctx, {
            target_dir: params.target_dir,
            section: params.section,
          });
        }
        case "update": {
          if (!params.section || params.content === undefined) {
            return textResult("`action: update` requires `section` and `content`.");
          }
          return handleArc42Section(ctx, {
            target_dir: params.target_dir,
            section: params.section,
            content: params.content,
          });
        }
      }
    },
  );
}
