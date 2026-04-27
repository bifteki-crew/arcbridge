import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { indexProject, refreshFromDocs } from "@arcbridge/core";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, textResult } from "../helpers.js";
import { autoRecord } from "../auto-record.js";

export function registerReindex(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "arcbridge_reindex",
    "Re-index the project: refreshes architecture docs from arc42/YAML files, then reindexes code symbols (TypeScript, C#/.NET; Python and Go are experimental). This is the first step of the sync pipeline — use it to pick up manual doc edits and code changes.",
    {
      target_dir: z
        .string()
        .describe("Absolute path to the project directory"),
      tsconfig_path: z
        .string()
        .optional()
        .describe("Override tsconfig.json path (default: auto-detect). Only used for TypeScript projects."),
      service: z
        .string()
        .optional()
        .describe("Service name for monorepo projects (default: 'main')"),
      language: z
        .enum(["typescript", "csharp", "python", "go", "auto"])
        .optional()
        .describe("Project language. 'auto' detects from project files (default: 'auto')"),
    },
    async (params) => {
      const start = Date.now();
      const db = ensureDb(ctx, params.target_dir);
      if (!db) return notInitialized();

      try {
        // Refresh architecture docs into DB first (picks up manual edits)
        const docWarnings = refreshFromDocs(db, params.target_dir);

        const result = await indexProject(db, {
          projectRoot: params.target_dir,
          tsconfigPath: params.tsconfig_path,
          service: params.service,
          language: params.language,
        });

        const lines = [
          "# Reindex Complete",
          "",
          "## Architecture Docs",
          `- **Refreshed from docs:** building blocks, phases, tasks, quality scenarios, ADRs`,
          ...(docWarnings.length > 0 ? [`- **Warnings:** ${docWarnings.join("; ")}`] : []),
          "",
          "## Code Symbols",
          `- **Files processed:** ${result.filesProcessed}`,
          `- **Files skipped (unchanged):** ${result.filesSkipped}`,
          `- **Files removed:** ${result.filesRemoved}`,
          `- **Symbols indexed:** ${result.symbolsIndexed}`,
          `- **Dependencies indexed:** ${result.dependenciesIndexed}`,
          `- **Components analyzed:** ${result.componentsAnalyzed}`,
          `- **Routes analyzed:** ${result.routesAnalyzed}`,
          `- **Duration:** ${result.durationMs}ms`,
        ];

        autoRecord(db, params.target_dir, {
          toolName: "arcbridge_reindex",
          action: `${result.symbolsIndexed} symbols, ${result.filesProcessed} files`,
          durationMs: Date.now() - start,
        });

        return textResult(lines.join("\n"));
      } catch (err) {
        const message =
          err instanceof Error ? err.message : String(err);
        return textResult(`Indexing failed: ${message}`);
      }
    },
  );
}
