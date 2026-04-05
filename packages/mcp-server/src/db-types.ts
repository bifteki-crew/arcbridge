/**
 * Shared database row type interfaces for MCP tool queries.
 *
 * These types represent the full column set from each table.
 * Tools SELECT a subset of columns and cast to these types —
 * unselected fields will be undefined at runtime, which is fine
 * since tools only access fields they selected.
 */

/** Phase row from the `phases` table */
export interface PhaseRow {
  id: string;
  name: string;
  phase_number: number;
  status: string;
  description: string;
  gate_status: string;
  started_at: string | null;
  completed_at: string | null;
}

/** Task row from the `tasks` table */
export interface TaskRow {
  id: string;
  title: string;
  status: string;
  phase_id: string;
  description: string | null;
  building_block: string | null;
  quality_scenarios: string;
  acceptance_criteria: string;
  completed_at: string | null;
}

/** Building block row from the `building_blocks` table */
export interface BlockRow {
  id: string;
  name: string;
  level: number;
  parent_id: string | null;
  responsibility: string;
  code_paths: string;
  interfaces: string;
  service: string;
  last_synced: string | null;
  description: string | null;
}

/** Quality scenario row from the `quality_scenarios` table */
export interface ScenarioRow {
  id: string;
  name: string;
  category: string;
  status: string;
  priority: string;
  scenario: string;
  expected: string;
  linked_tests: string;
  linked_code: string;
  linked_blocks: string;
  verification: string;
}

/** ADR row from the `adrs` table */
export interface AdrRow {
  id: string;
  title: string;
  status: string;
  date: string;
  context: string | null;
  decision: string | null;
  consequences: string | null;
  affected_blocks: string;
  affected_files: string;
  quality_scenarios: string;
}

/** Symbol row from the `symbols` table */
export interface SymbolRow {
  id: string;
  name: string;
  qualified_name: string;
  kind: string;
  file_path: string;
  start_line: number;
  end_line: number;
  start_col: number;
  end_col: number;
  signature: string | null;
  return_type: string | null;
  doc_comment: string | null;
  is_exported: number;
  is_async: number;
  service: string;
  content_hash: string;
  indexed_at: string;
}

/** Generic count result from COUNT(*) queries */
export interface CountRow {
  count: number;
}
