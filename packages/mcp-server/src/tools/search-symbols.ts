import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, textResult, escapeLike, type ToolResult } from "../helpers.js";
import type { SymbolRow } from "../db-types.js";

/** Single source of truth for symbol kinds — the zod enum in query-symbols
 *  derives from this, as does the SymbolKindFilter type. */
export const SYMBOL_KINDS = [
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

export type SymbolKindFilter = (typeof SYMBOL_KINDS)[number];

export interface SearchSymbolsParams {
  target_dir: string;
  query?: string;
  service?: string;
  kind?: SymbolKindFilter;
  file_path?: string;
  is_exported?: boolean;
  building_block?: string;
  limit: number;
}

/** Search mode of arcbridge_query_symbols. */
export async function handleSearchSymbols(
  ctx: ServerContext,
  params: SearchSymbolsParams,
): Promise<ToolResult> {
  const db = ensureDb(ctx, params.target_dir);
  if (!db) return notInitialized();

  const conditions: string[] = [];
  const queryParams: (string | number)[] = [];

  if (params.service) {
    conditions.push("s.service = ?");
    queryParams.push(params.service);
  }

  if (params.query) {
    conditions.push("s.name LIKE ? ESCAPE '\\'");
    queryParams.push(`%${escapeLike(params.query)}%`);
  }

  if (params.kind) {
    conditions.push("s.kind = ?");
    queryParams.push(params.kind);
  }

  if (params.file_path) {
    conditions.push("s.file_path LIKE ? ESCAPE '\\'");
    queryParams.push(`${escapeLike(params.file_path)}%`);
  }

  if (params.is_exported !== undefined) {
    conditions.push("s.is_exported = ?");
    queryParams.push(params.is_exported ? 1 : 0);
  }

  // Building block filter: match symbol file_path against block code_paths
  if (params.building_block) {
    const block = db
      .prepare("SELECT code_paths FROM building_blocks WHERE id = ?")
      .get(params.building_block) as { code_paths: string } | undefined;

    if (block) {
      try {
        const codePaths = JSON.parse(block.code_paths) as string[];
        if (codePaths.length > 0) {
          const pathConditions = codePaths.map(() => "s.file_path LIKE ? ESCAPE '\\'");
          conditions.push(`(${pathConditions.join(" OR ")})`);
          for (const cp of codePaths) {
            // Convert glob-like paths to LIKE prefix: "src/lib/auth/" → "src/lib/auth/%"
            const prefix = cp.replace(/\*\*?\/?\*?$/, "");
            queryParams.push(`${escapeLike(prefix)}%`);
          }
        }
      } catch {
        // Ignore malformed code_paths
      }
    }
  }

  let query =
    "SELECT s.id, s.name, s.qualified_name, s.kind, s.file_path, s.start_line, s.signature, s.return_type, s.is_exported, s.is_async, s.doc_comment FROM symbols s";

  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }

  query += " ORDER BY s.name LIMIT ?";
  queryParams.push(params.limit);

  const rows = db.prepare(query).all(...queryParams) as SymbolRow[];

  if (rows.length === 0) {
    return textResult("No symbols found matching the search criteria.");
  }

  const lines: string[] = [
    `# Symbol Search Results (${rows.length}${rows.length === params.limit ? "+" : ""})`,
    "",
  ];

  for (const s of rows) {
    const flags = [
      s.is_exported ? "exported" : "internal",
      s.is_async ? "async" : "",
    ]
      .filter(Boolean)
      .join(", ");

    lines.push(
      `## \`${s.qualified_name}\` (${s.kind})`,
      "",
      `- **ID:** \`${s.id}\``,
      `- **Location:** \`${s.file_path}:${s.start_line}\``,
      `- **Flags:** ${flags}`,
    );

    if (s.signature) {
      lines.push(`- **Signature:** \`${s.signature}\``);
    }
    if (s.return_type) {
      lines.push(`- **Returns:** \`${s.return_type}\``);
    }
    if (s.doc_comment) {
      lines.push(`- **Docs:** ${s.doc_comment}`);
    }

    lines.push("");
  }

  return textResult(lines.join("\n"));
}
