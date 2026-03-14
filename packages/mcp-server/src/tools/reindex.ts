import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { indexProject, refreshFromDocs } from "@arcbridge/core";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, textResult } from "../helpers.js";

export function registerReindex(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "arcbridge_reindex",
    "Re-index TypeScript symbols in the project. Incrementally processes only changed files.",
    {
      target_dir: z
        .string()
        .describe("Absolute path to the project directory"),
      tsconfig_path: z
        .string()
        .optional()
        .describe("Override tsconfig.json path (default: auto-detect)"),
      service: z
        .string()
        .optional()
        .describe("Service name for monorepo projects (default: 'main')"),
    },
    async (params) => {
      const db = ensureDb(ctx, params.target_dir);
      if (!db) return notInitialized();

      try {
        // Refresh architecture docs into DB first (picks up manual edits)
        const docWarnings = refreshFromDocs(db, params.target_dir);

        const result = indexProject(db, {
          projectRoot: params.target_dir,
          tsconfigPath: params.tsconfig_path,
          service: params.service,
        });

        const lines = [
          "# Indexing Complete",
          "",
          `- **Docs refreshed:** ${docWarnings.length === 0 ? "OK" : docWarnings.join(", ")}`,
          `- **Files processed:** ${result.filesProcessed}`,
          `- **Files skipped (unchanged):** ${result.filesSkipped}`,
          `- **Files removed:** ${result.filesRemoved}`,
          `- **Symbols indexed:** ${result.symbolsIndexed}`,
          `- **Dependencies indexed:** ${result.dependenciesIndexed}`,
          `- **Components analyzed:** ${result.componentsAnalyzed}`,
          `- **Routes analyzed:** ${result.routesAnalyzed}`,
          `- **Duration:** ${result.durationMs}ms`,
        ];

        return textResult(lines.join("\n"));
      } catch (err) {
        const message =
          err instanceof Error ? err.message : String(err);
        return textResult(`Indexing failed: ${message}`);
      }
    },
  );
}
