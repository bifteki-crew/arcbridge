import { relative } from "node:path";
import type Database from "better-sqlite3";
import type { IndexerOptions, IndexResult } from "./types.js";
import { createTsProgram } from "./program.js";
import { extractSymbols } from "./symbol-extractor.js";
import { extractDependencies, buildSymbolLookup } from "./dependency-extractor.js";
import { analyzeComponents } from "./component-analyzer.js";
import { analyzeRoutes } from "./route-analyzer.js";
import { hashContent } from "./content-hash.js";
import {
  getExistingHashes,
  removeSymbolsForFiles,
  writeSymbols,
  writeDependencies,
} from "./db-writer.js";

export function indexProject(
  db: Database.Database,
  options: IndexerOptions,
): IndexResult {
  const start = Date.now();
  const service = options.service ?? "main";

  // 1. Create TS program
  const { checker, sourceFiles, projectRoot } = createTsProgram(options);

  // 2. Compute file hashes and compare with existing
  const existingHashes = getExistingHashes(db, service);

  const changed: Array<{
    sourceFile: (typeof sourceFiles)[number];
    relativePath: string;
    hash: string;
  }> = [];
  const currentPaths = new Set<string>();
  let filesSkipped = 0;

  for (const sf of sourceFiles) {
    const relPath = relative(projectRoot, sf.fileName);
    currentPaths.add(relPath);

    const hash = hashContent(sf.getFullText());
    const existingHash = existingHashes.get(relPath);

    if (existingHash === hash) {
      filesSkipped++;
    } else {
      changed.push({ sourceFile: sf, relativePath: relPath, hash });
    }
  }

  // 3. Find removed files (in DB but no longer in program)
  const removed: string[] = [];
  for (const existingPath of existingHashes.keys()) {
    if (!currentPaths.has(existingPath)) {
      removed.push(existingPath);
    }
  }

  // 4. Remove stale symbols for changed + removed files
  const filesToClean = [
    ...removed,
    ...changed.map((f) => f.relativePath),
  ];
  removeSymbolsForFiles(db, filesToClean);

  // 5. Extract symbols from changed files
  const allSymbols = changed.flatMap((f) =>
    extractSymbols(f.sourceFile, checker, f.relativePath, f.hash),
  );

  // 6. Write symbols to DB
  writeSymbols(db, allSymbols, service);

  // 7. Extract dependencies across ALL source files
  //    (dependencies can cross file boundaries, so we need all symbols for lookup)
  const allDbSymbols = db
    .prepare("SELECT id, file_path as filePath, name FROM symbols WHERE service = ?")
    .all(service) as Array<{ id: string; filePath: string; name: string }>;

  const lookup = buildSymbolLookup(allDbSymbols);

  // Clear existing dependencies for changed files (already done in removeSymbolsForFiles)
  // Now extract fresh dependencies from all source files
  const allDeps = sourceFiles.flatMap((sf) => {
    const relPath = relative(projectRoot, sf.fileName);
    return extractDependencies(sf, checker, relPath, projectRoot, lookup);
  });

  // Clear all deps and re-insert (simpler than incremental for cross-file edges)
  db.prepare("DELETE FROM dependencies WHERE source_symbol IN (SELECT id FROM symbols WHERE service = ?)").run(service);
  writeDependencies(db, allDeps);

  // 8. Analyze React components (populates components table)
  const componentsAnalyzed = analyzeComponents(sourceFiles, checker, projectRoot, db);

  // 9. Analyze Next.js routes (populates routes table)
  const routesAnalyzed = analyzeRoutes(projectRoot, db, service);

  return {
    symbolsIndexed: allSymbols.length,
    dependenciesIndexed: allDeps.length,
    componentsAnalyzed,
    routesAnalyzed,
    filesProcessed: changed.length,
    filesSkipped,
    filesRemoved: removed.length,
    durationMs: Date.now() - start,
  };
}

export type { IndexerOptions, IndexResult, ExtractedSymbol, SymbolKind } from "./types.js";
