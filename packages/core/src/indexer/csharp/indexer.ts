import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Database } from "../../db/connection.js";
import { transaction } from "../../db/connection.js";
import { globbySync } from "globby";
import type { IndexResult, ExtractedSymbol } from "../types.js";
import type { ExtractedDependency } from "../dependency-extractor.js";
import { hashContent } from "../content-hash.js";
import {
  getExistingHashes,
  removeSymbolsForFiles,
  writeSymbols,
  writeDependencies,
} from "../db-writer.js";
import { ensureCSharpParser, parseCSharp } from "./parser.js";
import { extractCSharpSymbols } from "./symbol-extractor.js";
import {
  extractCSharpDependencies,
  buildCSharpSymbolLookup,
  type SymbolForDeps,
} from "./dependency-extractor.js";
import { extractCSharpRoutes, type CSharpRoute } from "./route-analyzer.js";

export interface CSharpTreeSitterOptions {
  projectRoot: string;
  service?: string;
}

/**
 * Index a C# project using tree-sitter (no .NET SDK required).
 * Mirrors the TypeScript indexer flow: discover → hash → parse → extract → write.
 */
export async function indexCSharpTreeSitter(
  db: Database,
  options: CSharpTreeSitterOptions,
): Promise<IndexResult> {
  const start = Date.now();

  // One-time async init of the WASM-based tree-sitter parser
  await ensureCSharpParser();
  const service = options.service ?? "main";
  const projectRoot = options.projectRoot;

  // 1. Discover .cs files (skip build artifacts, Unity-managed dirs)
  const ignorePatterns = [
    "**/bin/**", "**/obj/**", "**/node_modules/**", "**/.git/**",
    // Unity project directories that should never be indexed
    "**/Library/**", "**/Temp/**", "**/Logs/**", "**/UserSettings/**",
    "**/Packages/**", "**/ProjectSettings/**",
  ];
  const csFiles = globbySync("**/*.cs", {
    cwd: projectRoot,
    ignore: ignorePatterns,
    absolute: false,
  });

  // 2. Read all files once, hash, and parse — cache for reuse across phases
  const existingHashes = getExistingHashes(db, service);
  const currentPaths = new Set<string>();
  const fileCache = new Map<string, { content: string; tree: ReturnType<typeof parseCSharp> }>();

  const changedFiles: string[] = [];
  let filesSkipped = 0;

  for (const filePath of csFiles) {
    const relPath = filePath.replace(/\\/g, "/");
    currentPaths.add(relPath);

    const fullPath = join(projectRoot, relPath);
    const content = readFileSync(fullPath, "utf-8");
    const hash = hashContent(content);
    const tree = parseCSharp(content);
    fileCache.set(relPath, { content, tree });

    const existingHash = existingHashes.get(relPath);
    if (existingHash === hash) {
      filesSkipped++;
    } else {
      changedFiles.push(relPath);
    }
  }

  // 3. Find removed files
  const removed: string[] = [];
  for (const existingPath of existingHashes.keys()) {
    if (!currentPaths.has(existingPath)) {
      removed.push(existingPath);
    }
  }

  // 4. Remove stale symbols for changed + removed files
  // TODO: removeSymbolsForFiles deletes by file_path without service scoping —
  // safe when services use distinct file paths (typical), but could collide in
  // edge cases. Same limitation exists in the TypeScript indexer.
  const filesToClean = [...removed, ...changedFiles];
  removeSymbolsForFiles(db, filesToClean);

  // 5. Extract symbols from changed files
  const allNewSymbols: ExtractedSymbol[] = [];
  for (const relPath of changedFiles) {
    const cached = fileCache.get(relPath);
    if (!cached) continue;
    const symbols = extractCSharpSymbols(cached.tree, relPath, cached.content);
    allNewSymbols.push(...symbols);
  }

  // 6. Write symbols to DB
  writeSymbols(db, allNewSymbols, service, "csharp");

  // 7. Build symbol lookup from ALL db symbols for this service
  const allDbSymbols = db
    .prepare("SELECT id, file_path as filePath, name, kind, start_line as startLine, end_line as endLine FROM symbols WHERE service = ?")
    .all(service) as SymbolForDeps[];

  const symbolLookup = buildCSharpSymbolLookup(allDbSymbols);

  // 8. Extract dependencies from ALL files (cross-file deps need full context)
  const allDeps: ExtractedDependency[] = [];
  for (const [relPath, cached] of fileCache) {
    const fileDeps = extractCSharpDependencies(cached.tree, relPath, allDbSymbols, symbolLookup);
    allDeps.push(...fileDeps);
  }

  // Clear deps for service and re-insert
  db.prepare(
    "DELETE FROM dependencies WHERE source_symbol IN (SELECT id FROM symbols WHERE service = ? AND language = 'csharp')",
  ).run(service);
  writeDependencies(db, allDeps);

  // 9. Extract routes from ALL files
  const allRoutes: CSharpRoute[] = [];
  for (const [relPath, cached] of fileCache) {
    const routes = extractCSharpRoutes(cached.tree, relPath);
    allRoutes.push(...routes);
  }

  // Clean up stale routes before inserting
  db.prepare("DELETE FROM routes WHERE service = ?").run(service);

  if (allRoutes.length > 0) {
    const insertRoute = db.prepare(`
      INSERT OR REPLACE INTO routes (id, route_path, kind, http_methods, has_auth, service)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    transaction(db, () => {
      for (const route of allRoutes) {
        insertRoute.run(
          route.id,
          route.routePath,
          route.kind,
          JSON.stringify(route.httpMethods),
          route.hasAuth ? 1 : 0,
          service,
        );
      }
    });

  }

  return {
    symbolsIndexed: allNewSymbols.length,
    dependenciesIndexed: allDeps.length,
    componentsAnalyzed: 0,
    routesAnalyzed: allRoutes.length,
    filesProcessed: changedFiles.length,
    filesSkipped,
    filesRemoved: removed.length,
    durationMs: Date.now() - start,
  };
}
