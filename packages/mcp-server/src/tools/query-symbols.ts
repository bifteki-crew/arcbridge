import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { handleSearchSymbols, type SymbolKindFilter } from "./search-symbols.js";
import { handleGetSymbol } from "./get-symbol.js";

const SYMBOL_KINDS = [
  "function",
  "class",
  "type",
  "constant",
  "interface",
  "enum",
  "variable",
  "component",
  "hook",
  "context",
] as const;

/**
 * Consolidated symbol lookup (replaces arcbridge_search_symbols and
 * arcbridge_get_symbol in 0.10.0): pass `symbol_id` for the detail view,
 * otherwise the search filters apply.
 */
export function registerQuerySymbols(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "arcbridge_query_symbols",
    "Look up code symbols. Pass `symbol_id` for full detail on one symbol (signature, source snippet, callers/callees). Otherwise searches by name/kind/file path/building block and returns matching symbols with type signatures. Supports TypeScript and C# (Python/Go experimental).",
    {
      target_dir: z.string().describe("Absolute path to the project directory"),
      symbol_id: z
        .string()
        .optional()
        .describe("Detail mode: exact symbol ID (e.g. 'src/utils.ts::formatName#function'). When set, search filters are ignored."),
      include_source: z
        .boolean()
        .default(true)
        .describe("Detail mode: include a source code snippet"),
      query: z.string().optional().describe("Search mode: term to match against symbol names"),
      service: z
        .string()
        .optional()
        .describe("Search mode: filter by service name (multi-project solutions)"),
      kind: z.enum(SYMBOL_KINDS).optional().describe("Search mode: filter by symbol kind"),
      file_path: z.string().optional().describe("Search mode: filter by file path (prefix match)"),
      is_exported: z.boolean().optional().describe("Search mode: filter by export status"),
      building_block: z
        .string()
        .optional()
        .describe("Search mode: filter by building block ID (matches code_paths)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .default(50)
        .describe("Search mode: maximum results (default: 50)"),
    },
    async (params) => {
      if (params.symbol_id) {
        return handleGetSymbol(ctx, {
          target_dir: params.target_dir,
          symbol_id: params.symbol_id,
          include_source: params.include_source,
        });
      }
      return handleSearchSymbols(ctx, {
        target_dir: params.target_dir,
        query: params.query,
        service: params.service,
        kind: params.kind as SymbolKindFilter | undefined,
        file_path: params.file_path,
        is_exported: params.is_exported,
        building_block: params.building_block,
        limit: params.limit,
      });
    },
  );
}
