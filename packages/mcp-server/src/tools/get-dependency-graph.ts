import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, textResult, escapeLike } from "../helpers.js";

interface DepEdge {
  source_id: string;
  source_name: string;
  source_file: string;
  target_id: string;
  target_name: string;
  target_file: string;
  kind: string;
}

export function registerGetDependencyGraph(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "arcbridge_get_dependency_graph",
    "Get the dependency graph for a module or file. Shows imports, calls, type usage, and inheritance relationships between symbols.",
    {
      target_dir: z
        .string()
        .describe("Absolute path to the project directory"),
      module: z
        .string()
        .describe(
          "Module path relative to project root (e.g. 'src/lib/auth')",
        ),
      direction: z
        .enum(["dependencies", "dependents", "both"])
        .default("both")
        .describe(
          "Graph direction: 'dependencies' (what this module uses), 'dependents' (what uses this module), or 'both'",
        ),
      depth: z
        .number()
        .int()
        .min(1)
        .max(5)
        .default(1)
        .describe("How many levels to traverse (default: 1, max: 5)"),
    },
    async (params) => {
      const maybeDb = ensureDb(ctx, params.target_dir);
      if (!maybeDb) return notInitialized();
      const db = maybeDb;

      // Check if we have any dependencies indexed
      const depCount = (
        db.prepare("SELECT COUNT(*) as count FROM dependencies").get() as {
          count: number;
        }
      ).count;

      if (depCount === 0) {
        // Fall back to file-level import analysis from symbols table
        return getFileImportGraph(db, params.module, params.direction);
      }

      // Full dependency graph from dependencies table
      const edges: DepEdge[] = [];
      const visited = new Set<string>();

      function collectEdges(modulePath: string, currentDepth: number): void {
        if (currentDepth > params.depth || visited.has(modulePath)) return;
        visited.add(modulePath);

        const prefix = `${escapeLike(modulePath)}%`;

        if (params.direction === "dependencies" || params.direction === "both") {
          const deps = db
            .prepare(
              `SELECT d.source_symbol as source_id, s1.name as source_name, s1.file_path as source_file,
                      d.target_symbol as target_id, s2.name as target_name, s2.file_path as target_file,
                      d.kind
               FROM dependencies d
               JOIN symbols s1 ON s1.id = d.source_symbol
               JOIN symbols s2 ON s2.id = d.target_symbol
               WHERE s1.file_path LIKE ? ESCAPE '\\'
               ORDER BY d.kind, s2.name`,
            )
            .all(prefix) as DepEdge[];

          for (const dep of deps) {
            const key = `${dep.source_id}->${dep.target_id}:${dep.kind}`;
            if (!visited.has(key)) {
              edges.push(dep);
              visited.add(key);
              if (currentDepth < params.depth) {
                const targetDir = dep.target_file.replace(/\/[^/]+$/, "");
                collectEdges(targetDir, currentDepth + 1);
              }
            }
          }
        }

        if (params.direction === "dependents" || params.direction === "both") {
          const deps = db
            .prepare(
              `SELECT d.source_symbol as source_id, s1.name as source_name, s1.file_path as source_file,
                      d.target_symbol as target_id, s2.name as target_name, s2.file_path as target_file,
                      d.kind
               FROM dependencies d
               JOIN symbols s1 ON s1.id = d.source_symbol
               JOIN symbols s2 ON s2.id = d.target_symbol
               WHERE s2.file_path LIKE ? ESCAPE '\\'
               ORDER BY d.kind, s1.name`,
            )
            .all(prefix) as DepEdge[];

          for (const dep of deps) {
            const key = `${dep.source_id}->${dep.target_id}:${dep.kind}`;
            if (!visited.has(key)) {
              edges.push(dep);
              visited.add(key);
              if (currentDepth < params.depth) {
                const sourceDir = dep.source_file.replace(/\/[^/]+$/, "");
                collectEdges(sourceDir, currentDepth + 1);
              }
            }
          }
        }
      }

      collectEdges(params.module, 1);

      if (edges.length === 0) {
        return textResult(
          `No dependency edges found for module \`${params.module}\`.\n\nThis may mean dependencies haven't been indexed yet (Phase 1b). Run \`arcbridge_reindex\` to update.`,
        );
      }

      return formatEdges(edges, params.module, params.direction);
    },
  );
}

function getFileImportGraph(
  db: import("better-sqlite3").Database,
  modulePath: string,
  _direction: string,
) {
  // When no dependency edges exist, show a file-level view of symbols
  const prefix = `${escapeLike(modulePath)}%`;

  const symbols = db
    .prepare(
      `SELECT file_path, name, kind, is_exported
       FROM symbols
       WHERE file_path LIKE ? ESCAPE '\\'
       ORDER BY file_path, name`,
    )
    .all(prefix) as {
    file_path: string;
    name: string;
    kind: string;
    is_exported: number;
  }[];

  if (symbols.length === 0) {
    return textResult(
      `No symbols found in module \`${modulePath}\`. Run \`arcbridge_reindex\` first.`,
    );
  }

  const byFile = new Map<string, typeof symbols>();
  for (const s of symbols) {
    const list = byFile.get(s.file_path) ?? [];
    list.push(s);
    byFile.set(s.file_path, list);
  }

  const lines = [
    `# Module: ${modulePath}`,
    "",
    `> Dependency edges not yet indexed. Showing file-level symbol map.`,
    `> Run \`arcbridge_reindex\` after Phase 1b to see full dependency graph.`,
    "",
  ];

  for (const [file, syms] of byFile) {
    lines.push(`## \`${file}\``, "");
    for (const s of syms) {
      const exported = s.is_exported ? " (exported)" : "";
      lines.push(`- \`${s.name}\` — ${s.kind}${exported}`);
    }
    lines.push("");
  }

  return {
    content: [{ type: "text" as const, text: lines.join("\n") }],
  };
}

function formatEdges(
  edges: DepEdge[],
  modulePath: string,
  direction: string,
) {
  const byKind = new Map<string, DepEdge[]>();
  for (const e of edges) {
    const list = byKind.get(e.kind) ?? [];
    list.push(e);
    byKind.set(e.kind, list);
  }

  const lines = [
    `# Dependency Graph: ${modulePath}`,
    "",
    `**Direction:** ${direction} | **Edges:** ${edges.length}`,
    "",
  ];

  for (const [kind, kindEdges] of byKind) {
    lines.push(`## ${kind}`, "");
    for (const e of kindEdges) {
      lines.push(
        `- \`${e.source_name}\` (\`${e.source_file}\`) → \`${e.target_name}\` (\`${e.target_file}\`)`,
      );
    }
    lines.push("");
  }

  return {
    content: [{ type: "text" as const, text: lines.join("\n") }],
  };
}
