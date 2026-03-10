import { relative } from "node:path";
import type Database from "better-sqlite3";
import type { IndexerOptions, IndexResult } from "./types.js";
import { createTsProgram } from "./program.js";
import { extractSymbols } from "./symbol-extractor.js";
import { hashContent } from "./content-hash.js";
import {
  getExistingHashes,
  removeSymbolsForFiles,
  writeSymbols,
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

  // 6. Write to DB
  writeSymbols(db, allSymbols, service);

  return {
    symbolsIndexed: allSymbols.length,
    filesProcessed: changed.length,
    filesSkipped,
    filesRemoved: removed.length,
    durationMs: Date.now() - start,
  };
}

export type { IndexerOptions, IndexResult, ExtractedSymbol, SymbolKind } from "./types.js";
