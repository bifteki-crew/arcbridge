import type Database from "better-sqlite3";
import type { ExtractedSymbol } from "./types.js";

export function getExistingHashes(
  db: Database.Database,
  service: string,
): Map<string, string> {
  const rows = db
    .prepare(
      "SELECT DISTINCT file_path, content_hash FROM symbols WHERE service = ?",
    )
    .all(service) as { file_path: string; content_hash: string }[];

  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.file_path, row.content_hash);
  }
  return map;
}

export function removeSymbolsForFiles(
  db: Database.Database,
  filePaths: string[],
): void {
  if (filePaths.length === 0) return;

  const deleteSymbols = db.prepare(
    "DELETE FROM symbols WHERE file_path = ?",
  );

  // Also clean up dangling dependencies
  const deleteDepsSource = db.prepare(
    "DELETE FROM dependencies WHERE source_symbol IN (SELECT id FROM symbols WHERE file_path = ?)",
  );
  const deleteDepsTarget = db.prepare(
    "DELETE FROM dependencies WHERE target_symbol IN (SELECT id FROM symbols WHERE file_path = ?)",
  );

  const run = db.transaction(() => {
    for (const fp of filePaths) {
      deleteDepsSource.run(fp);
      deleteDepsTarget.run(fp);
      deleteSymbols.run(fp);
    }
  });

  run();
}

export function writeSymbols(
  db: Database.Database,
  symbols: ExtractedSymbol[],
  service: string,
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
      ?, ?, ?, 'typescript',
      ?, ?
    )
  `);

  const now = new Date().toISOString();

  const run = db.transaction(() => {
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
        s.contentHash,
        now,
      );
    }
  });

  run();
}
