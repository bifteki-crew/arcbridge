import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Database, transaction } from "../../db/connection.js";
import { globbySync } from "globby";
import type { IndexResult, ExtractedSymbol } from "../types.js";
import type { ExtractedDependency } from "../dependency-extractor.js";
import { hashContent } from "../content-hash.js";
import {
  getExistingHashes,
  removeScopedSymbolsForFiles,
  writeSymbols,
  writeDependencies,
} from "../db-writer.js";
import { ensurePythonParser, parsePython } from "./parser.js";
import { extractPythonSymbols } from "./symbol-extractor.js";
import {
  extractPythonDependencies,
  buildPythonSymbolLookup,
  type SymbolForDeps,
} from "./dependency-extractor.js";
import { extractPythonRoutes, type PythonRoute } from "./route-analyzer.js";

export interface PythonTreeSitterOptions {
  projectRoot: string;
  service?: string;
}

/**
 * Index a Python project using tree-sitter.
 * Mirrors the TypeScript/C# indexer flow: discover → hash → parse → extract → write.
 */
export async function indexPythonTreeSitter(
  db: Database,
  options: PythonTreeSitterOptions,
): Promise<IndexResult> {
  const start = Date.now();

  // One-time async init of the WASM-based tree-sitter parser
  await ensurePythonParser();
  const service = options.service ?? "main";
  const projectRoot = options.projectRoot;

  // 1. Discover .py files (skip virtual envs, caches, build artifacts)
  const ignorePatterns = [
    "**/__pycache__/**",
    "**/.venv/**",
    "**/venv/**",
    "**/.tox/**",
    "**/node_modules/**",
    "**/.git/**",
    "**/dist/**",
    "**/build/**",
    "**/.eggs/**",
    "**/*.egg-info/**",
  ];
  const pyFiles = globbySync("**/*.py", {
    cwd: projectRoot,
    ignore: ignorePatterns,
    absolute: false,
  });

  // 2. Read all files once, hash, and parse — cache for reuse across phases
  // TODO: existingHashes is derived from the symbols table, so files that produce
  // zero symbols (e.g. empty __init__.py) will never have a stored hash and will be
  // re-parsed on every run. Consider storing per-file hashes independently.
  const existingHashes = getExistingHashes(db, service, "python");
  const currentPaths = new Set<string>();
  const fileCache = new Map<string, { content: string; tree: ReturnType<typeof parsePython>; hash: string }>();

  const changedFiles: string[] = [];
  let filesSkipped = 0;

  for (const filePath of pyFiles) {
    const relPath = filePath.replace(/\\/g, "/");
    currentPaths.add(relPath);

    const fullPath = join(projectRoot, relPath);
    const content = readFileSync(fullPath, "utf-8");
    const hash = hashContent(content);
    const tree = parsePython(content);
    fileCache.set(relPath, { content, tree, hash });

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

  // 4. Remove stale symbols for changed + removed files (scoped by service + language)
  const filesToClean = [...removed, ...changedFiles];
  removeScopedSymbolsForFiles(db, filesToClean, service, "python");

  // 5. Extract symbols from changed files
  const allNewSymbols: ExtractedSymbol[] = [];
  for (const relPath of changedFiles) {
    const cached = fileCache.get(relPath);
    if (!cached) continue;
    const symbols = extractPythonSymbols(cached.tree, relPath, cached.hash);
    allNewSymbols.push(...symbols);
  }

  // 6. Write symbols to DB
  writeSymbols(db, allNewSymbols, service, "python");

  // 7. Build symbol lookup from Python symbols in this service
  const allDbSymbols = db
    .prepare("SELECT id, file_path as filePath, name, kind, start_line as startLine, end_line as endLine FROM symbols WHERE service = ? AND language = 'python'")
    .all(service) as SymbolForDeps[];

  const symbolLookup = buildPythonSymbolLookup(allDbSymbols);

  // 8. Extract dependencies from ALL files (cross-file deps need full context)
  const allDeps: ExtractedDependency[] = [];
  for (const [relPath, cached] of fileCache) {
    const fileDeps = extractPythonDependencies(cached.tree, relPath, allDbSymbols, symbolLookup);
    allDeps.push(...fileDeps);
  }

  // Clear deps for service and re-insert
  db.prepare(
    "DELETE FROM dependencies WHERE source_symbol IN (SELECT id FROM symbols WHERE service = ? AND language = 'python')",
  ).run(service);
  writeDependencies(db, allDeps);

  // 9. Extract routes from ALL files
  const allRoutes: PythonRoute[] = [];
  for (const [relPath, cached] of fileCache) {
    const routes = extractPythonRoutes(cached.tree, relPath);
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
        // Scope route ID by service so different services with the same
        // endpoint (e.g. /health) don't overwrite each other via INSERT OR REPLACE
        insertRoute.run(
          `${service}::${route.id}`,
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
