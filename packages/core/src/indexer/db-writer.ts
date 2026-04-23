import type { Database } from "../db/connection.js";
import { transaction } from "../db/connection.js";
import type { ExtractedSymbol, IndexerLanguage } from "./types.js";
import type { ExtractedDependency } from "./dependency-extractor.js";

export function getExistingHashes(
  db: Database,
  service: string,
  language?: IndexerLanguage,
): Map<string, string> {
  const query = language
    ? "SELECT DISTINCT file_path, content_hash FROM symbols WHERE service = ? AND language = ?"
    : "SELECT DISTINCT file_path, content_hash FROM symbols WHERE service = ?";
  const params = language ? [service, language] : [service];
  const rows = db.prepare(query).all(...params) as { file_path: string; content_hash: string }[];

  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.file_path, row.content_hash);
  }
  return map;
}

export function removeSymbolsForFiles(
  db: Database,
  filePaths: string[],
): void {
  if (filePaths.length === 0) return;

  const deleteSymbols = db.prepare(
    "DELETE FROM symbols WHERE file_path = ?",
  );

  // Clean up dependent tables before deleting symbols (FK constraints)
  const deleteDepsSource = db.prepare(
    "DELETE FROM dependencies WHERE source_symbol IN (SELECT id FROM symbols WHERE file_path = ?)",
  );
  const deleteDepsTarget = db.prepare(
    "DELETE FROM dependencies WHERE target_symbol IN (SELECT id FROM symbols WHERE file_path = ?)",
  );
  const deleteComponents = db.prepare(
    "DELETE FROM components WHERE symbol_id IN (SELECT id FROM symbols WHERE file_path = ?)",
  );

  transaction(db, () => {
    for (const fp of filePaths) {
      deleteDepsSource.run(fp);
      deleteDepsTarget.run(fp);
      deleteComponents.run(fp);
      deleteSymbols.run(fp);
    }
  });

}

/**
 * Remove symbols and their dependencies/components for the given file paths,
 * scoped to a specific service and language. Prevents cross-service/language
 * data loss in monorepo setups with overlapping relative paths.
 */
export function removeScopedSymbolsForFiles(
  db: Database,
  filePaths: string[],
  service: string,
  language: IndexerLanguage,
): void {
  if (filePaths.length === 0) return;

  const scope = "file_path = ? AND service = ? AND language = ?";

  const deleteDepsSource = db.prepare(
    `DELETE FROM dependencies WHERE source_symbol IN (SELECT id FROM symbols WHERE ${scope})`,
  );
  const deleteDepsTarget = db.prepare(
    `DELETE FROM dependencies WHERE target_symbol IN (SELECT id FROM symbols WHERE ${scope})`,
  );
  const deleteComponents = db.prepare(
    `DELETE FROM components WHERE symbol_id IN (SELECT id FROM symbols WHERE ${scope})`,
  );
  const deleteSymbols = db.prepare(
    `DELETE FROM symbols WHERE ${scope}`,
  );

  transaction(db, () => {
    for (const fp of filePaths) {
      deleteDepsSource.run(fp, service, language);
      deleteDepsTarget.run(fp, service, language);
      deleteComponents.run(fp, service, language);
      deleteSymbols.run(fp, service, language);
    }
  });
}

export function writeSymbols(
  db: Database,
  symbols: ExtractedSymbol[],
  service: string,
  language: string = "typescript",
): void {
  if (symbols.length === 0) return;

  const insert = db.prepare(`
    INSERT OR REPLACE INTO symbols (
      id, name, qualified_name, kind, file_path,
      start_line, end_line, start_col, end_col,
      signature, return_type, doc_comment,
      is_exported, is_async, service, language,
      content_hash, indexed_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?
    )
  `);

  const now = new Date().toISOString();

  transaction(db, () => {
    for (const s of symbols) {
      insert.run(
        s.id,
        s.name,
        s.qualifiedName,
        s.kind,
        s.filePath,
        s.startLine,
        s.endLine,
        s.startCol,
        s.endCol,
        s.signature,
        s.returnType,
        s.docComment,
        s.isExported ? 1 : 0,
        s.isAsync ? 1 : 0,
        service,
        language,
        s.contentHash,
        now,
      );
    }
  });

}

export function writeDependencies(
  db: Database,
  dependencies: ExtractedDependency[],
): void {
  if (dependencies.length === 0) return;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO dependencies (source_symbol, target_symbol, kind)
    VALUES (?, ?, ?)
  `);

  transaction(db, () => {
    for (const dep of dependencies) {
      insert.run(dep.sourceSymbolId, dep.targetSymbolId, dep.kind);
    }
  });

}
