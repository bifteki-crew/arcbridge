import { z } from "zod";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, textResult, safeParseJson } from "../helpers.js";
import type { SymbolRow } from "../db-types.js";

interface DepRow {
  symbol_id: string;
  symbol_name: string;
  kind: string;
  file_path: string;
}

export function registerGetSymbol(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "arcbridge_get_symbol",
    "Get detailed information about a specific TypeScript symbol including its source code, type signature, and relationships.",
    {
      target_dir: z
        .string()
        .describe("Absolute path to the project directory"),
      symbol_id: z
        .string()
        .describe(
          "Symbol ID (e.g. 'src/utils.ts::formatName#function')",
        ),
      include_source: z
        .boolean()
        .default(true)
        .describe("Include source code snippet (default: true)"),
    },
    async (params) => {
      const db = ensureDb(ctx, params.target_dir);
      if (!db) return notInitialized();

      const symbol = db
        .prepare("SELECT * FROM symbols WHERE id = ?")
        .get(params.symbol_id) as SymbolRow | undefined;

      if (!symbol) {
        return textResult(
          `Symbol not found: \`${params.symbol_id}\`\n\nUse \`arcbridge_search_symbols\` to find symbols by name.`,
        );
      }

      const lines: string[] = [
        `# ${symbol.qualified_name}`,
        "",
        `| Field | Value |`,
        `|-------|-------|`,
        `| **Kind** | ${symbol.kind} |`,
        `| **File** | \`${symbol.file_path}:${symbol.start_line}\` |`,
        `| **Exported** | ${symbol.is_exported ? "yes" : "no"} |`,
        `| **Async** | ${symbol.is_async ? "yes" : "no"} |`,
        `| **Service** | ${symbol.service} |`,
      ];

      if (symbol.signature) {
        lines.push(`| **Signature** | \`${symbol.signature}\` |`);
      }
      if (symbol.return_type) {
        lines.push(`| **Return type** | \`${symbol.return_type}\` |`);
      }

      lines.push("");

      if (symbol.doc_comment) {
        lines.push("## Documentation", "", symbol.doc_comment, "");
      }

      // Source code snippet
      if (params.include_source) {
        const absPath = join(params.target_dir, symbol.file_path);
        if (existsSync(absPath)) {
          try {
            const content = readFileSync(absPath, "utf-8");
            const fileLines = content.split("\n");

            const contextBefore = 2;
            const startIdx = Math.max(0, symbol.start_line - 1 - contextBefore);
            const endIdx = Math.min(fileLines.length, symbol.end_line);

            const snippet = fileLines
              .slice(startIdx, endIdx)
              .map((line, i) => {
                const lineNum = startIdx + i + 1;
                const marker =
                  lineNum >= symbol.start_line && lineNum <= symbol.end_line
                    ? ">"
                    : " ";
                return `${marker} ${String(lineNum).padStart(4)} | ${line}`;
              })
              .join("\n");

            lines.push("## Source", "", "```typescript", snippet, "```", "");
          } catch {
            // File read failed — skip source
          }
        }
      }

      // Dependencies (callers and callees) — if any exist
      const callees = db
        .prepare(
          `SELECT d.target_symbol as symbol_id, s.name as symbol_name, d.kind, s.file_path
           FROM dependencies d
           JOIN symbols s ON s.id = d.target_symbol
           WHERE d.source_symbol = ?
           ORDER BY d.kind, s.name`,
        )
        .all(params.symbol_id) as DepRow[];

      const callers = db
        .prepare(
          `SELECT d.source_symbol as symbol_id, s.name as symbol_name, d.kind, s.file_path
           FROM dependencies d
           JOIN symbols s ON s.id = d.source_symbol
           WHERE d.target_symbol = ?
           ORDER BY d.kind, s.name`,
        )
        .all(params.symbol_id) as DepRow[];

      if (callees.length > 0) {
        lines.push("## Dependencies (this symbol uses)", "");
        for (const dep of callees) {
          lines.push(`- **${dep.kind}** → \`${dep.symbol_name}\` (\`${dep.file_path}\`)`);
        }
        lines.push("");
      }

      if (callers.length > 0) {
        lines.push("## Dependents (uses this symbol)", "");
        for (const dep of callers) {
          lines.push(`- **${dep.kind}** ← \`${dep.symbol_name}\` (\`${dep.file_path}\`)`);
        }
        lines.push("");
      }

      // Find which building block this symbol belongs to
      const blocks = db
        .prepare("SELECT id, name, code_paths FROM building_blocks")
        .all() as { id: string; name: string; code_paths: string }[];

      for (const block of blocks) {
        const codePaths = safeParseJson<string[]>(block.code_paths, []);
        for (const cp of codePaths) {
          const prefix = cp.replace(/\*\*?\/?\*?$/, "");
          if (symbol.file_path.startsWith(prefix)) {
            lines.push(`## Building Block`, "", `Part of **${block.name}** (\`${block.id}\`)`, "");
            break;
          }
        }
      }

      return textResult(lines.join("\n"));
    },
  );
}
