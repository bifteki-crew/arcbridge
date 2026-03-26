import type { Database } from "../db/connection.js";
import { transaction } from "../db/connection.js";

export type DriftKind =
  | "undocumented_module"
  | "missing_module"
  | "dependency_violation"
  | "unlinked_test"
  | "stale_adr"
  | "new_dependency";

export type DriftSeverity = "info" | "warning" | "error";

export interface DriftEntry {
  kind: DriftKind;
  severity: DriftSeverity;
  description: string;
  affectedBlock: string | null;
  affectedFile: string | null;
}

interface BlockRow {
  id: string;
  name: string;
  code_paths: string;
  interfaces: string;
}

interface AdrRow {
  id: string;
  title: string;
  affected_files: string;
}

export interface DriftOptions {
  /** File paths/prefixes to ignore in undocumented_module checks */
  ignorePaths?: string[];
  /** Project type — used to auto-ignore common framework files */
  projectType?: string;
}

/** Built-in ignore patterns for known project types */
const FRAMEWORK_IGNORES: Record<string, string[]> = {
  "nextjs-app-router": [
    ".next/",
    "next.config",
    "src/app/layout.",
    "src/app/page.",
    "src/app/not-found.",
    "src/app/loading.",
    "src/app/error.",
    "src/app/global-error.",
    "src/middleware.",
    "app/layout.",
    "app/page.",
    "app/not-found.",
    "app/loading.",
    "app/error.",
    "app/global-error.",
    "middleware.",
  ],
  "react-vite": ["src/main.", "src/App.", "vite.config"],
  "api-service": ["src/index.", "src/app.", "src/server."],
  "dotnet-webapi": [
    "Program.", "Startup.",
    "bin/", "obj/",
    "Properties/",
    "Migrations/",
    "wwwroot/",
  ],
};

/**
 * Run architecture drift detection against the indexed codebase.
 * Compares building block code_paths against actual indexed files,
 * checks cross-block dependencies, and validates ADR references.
 */
export function detectDrift(
  db: Database,
  options?: DriftOptions,
): DriftEntry[] {
  const entries: DriftEntry[] = [];

  // Build ignore list from options + framework defaults
  const ignorePaths = [...(options?.ignorePaths ?? [])];
  if (options?.projectType && FRAMEWORK_IGNORES[options.projectType]) {
    ignorePaths.push(...FRAMEWORK_IGNORES[options.projectType]);
  }

  detectUndocumentedModules(db, entries, ignorePaths);
  detectMissingModules(db, entries);
  detectDependencyViolations(db, entries);
  detectUnlinkedTests(db, entries);
  detectStaleAdrs(db, entries);
  detectNewDependencies(db, entries);

  return entries;
}

/**
 * Write drift entries to the drift_log table.
 * Clears existing unresolved entries and inserts fresh ones.
 */
export function writeDriftLog(
  db: Database,
  entries: DriftEntry[],
): void {
  // Clear unresolved entries (keep resolved ones for history)
  db.prepare("DELETE FROM drift_log WHERE resolution IS NULL").run();

  if (entries.length === 0) return;

  const insert = db.prepare(`
    INSERT INTO drift_log (detected_at, kind, severity, description, affected_block, affected_file)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();

  transaction(db, () => {
    for (const e of entries) {
      insert.run(now, e.kind, e.severity, e.description, e.affectedBlock, e.affectedFile);
    }
  });

}

// --- Detection functions ---

/**
 * Find source files that have indexed symbols but don't match any building block's code_paths.
 */
function detectUndocumentedModules(
  db: Database,
  entries: DriftEntry[],
  ignorePaths: string[] = [],
): void {
  const blocks = db
    .prepare("SELECT id, name, code_paths FROM building_blocks")
    .all() as BlockRow[];

  if (blocks.length === 0) return;

  // Build a list of all code_path prefixes across all blocks
  const allPrefixes: string[] = [];
  for (const block of blocks) {
    const paths = safeParseJson<string[]>(block.code_paths, []);
    for (const cp of paths) {
      allPrefixes.push(normalizePath(cp));
    }
  }

  if (allPrefixes.length === 0) return;

  // Get all unique file paths from symbols
  const filePaths = db
    .prepare("SELECT DISTINCT file_path FROM symbols ORDER BY file_path")
    .all() as { file_path: string }[];

  for (const { file_path } of filePaths) {
    const matched = allPrefixes.some((prefix) => fileMatchesPath(file_path, prefix));
    if (!matched) {
      // Skip files matching ignore patterns (framework files, config files, etc.)
      const ignored = ignorePaths.some((pattern) => file_path.startsWith(pattern));
      if (ignored) continue;

      entries.push({
        kind: "undocumented_module",
        severity: "warning",
        description: `File \`${file_path}\` has indexed symbols but is not mapped to any building block's code_paths.`,
        affectedBlock: null,
        affectedFile: file_path,
      });
    }
  }
}

/**
 * Find building blocks whose code_paths reference directories/files with no indexed symbols.
 */
function detectMissingModules(
  db: Database,
  entries: DriftEntry[],
): void {
  const blocks = db
    .prepare("SELECT id, name, code_paths FROM building_blocks")
    .all() as BlockRow[];

  for (const block of blocks) {
    const paths = safeParseJson<string[]>(block.code_paths, []);

    for (const cp of paths) {
      const prefix = normalizePath(cp);
      // Check if any symbol file_path matches this code_path
      const match = db
        .prepare("SELECT 1 FROM symbols WHERE file_path LIKE ? LIMIT 1")
        .get(`${escapeLike(prefix)}%`) as unknown | undefined;

      if (!match) {
        entries.push({
          kind: "missing_module",
          severity: "warning",
          description: `Building block \`${block.name}\` (${block.id}) declares code_path \`${cp}\` but no indexed symbols match it.`,
          affectedBlock: block.id,
          affectedFile: null,
        });
      }
    }
  }
}

/**
 * Find dependencies that cross building block boundaries.
 * A dependency violation occurs when a symbol in block A imports/calls a symbol in block B,
 * but block A doesn't declare block B in its interfaces.
 */
function detectDependencyViolations(
  db: Database,
  entries: DriftEntry[],
): void {
  const blocks = db
    .prepare("SELECT id, name, code_paths, interfaces FROM building_blocks")
    .all() as BlockRow[];

  if (blocks.length < 2) return;

  // Build file → block mapping
  const fileToBlock = new Map<string, string>();
  const blockPrefixes = new Map<string, string[]>();

  for (const block of blocks) {
    const paths = safeParseJson<string[]>(block.code_paths, []);
    const prefixes = paths.map(normalizePath);
    blockPrefixes.set(block.id, prefixes);
  }

  // Get all file paths and assign them to blocks
  const filePaths = db
    .prepare("SELECT DISTINCT file_path FROM symbols")
    .all() as { file_path: string }[];

  for (const { file_path } of filePaths) {
    for (const block of blocks) {
      const prefixes = blockPrefixes.get(block.id) ?? [];
      if (prefixes.some((prefix) => fileMatchesPath(file_path, prefix))) {
        fileToBlock.set(file_path, block.id);
        break; // First match wins
      }
    }
  }

  // Build block interface sets (declared allowed dependencies)
  const blockInterfaces = new Map<string, Set<string>>();
  for (const block of blocks) {
    const interfaces = safeParseJson<string[]>(block.interfaces, []);
    blockInterfaces.set(block.id, new Set(interfaces));
  }

  // Check all dependencies for cross-block violations
  const crossBlockDeps = db
    .prepare(
      `SELECT
        d.source_symbol, d.target_symbol, d.kind,
        ss.file_path as source_file,
        st.file_path as target_file
      FROM dependencies d
      JOIN symbols ss ON d.source_symbol = ss.id
      JOIN symbols st ON d.target_symbol = st.id
      WHERE d.kind IN ('imports', 'calls', 'renders')`,
    )
    .all() as {
    source_symbol: string;
    target_symbol: string;
    kind: string;
    source_file: string;
    target_file: string;
  }[];

  // Build name lookup for reporting
  const blockNames = new Map(blocks.map((b) => [b.id, b.name]));

  // Track violations to avoid duplicates (report per file pair, not per edge)
  const reported = new Set<string>();

  for (const dep of crossBlockDeps) {
    const sourceBlock = fileToBlock.get(dep.source_file);
    const targetBlock = fileToBlock.get(dep.target_file);

    // Skip if same block, unmapped, or declared interface
    if (!sourceBlock || !targetBlock) continue;
    if (sourceBlock === targetBlock) continue;

    const interfaces = blockInterfaces.get(sourceBlock);
    if (interfaces && interfaces.has(targetBlock)) continue;

    const key = `${sourceBlock}→${targetBlock}`;
    if (reported.has(key)) continue;
    reported.add(key);

    const sourceBlockName = blockNames.get(sourceBlock) ?? sourceBlock;
    const targetBlockName = blockNames.get(targetBlock) ?? targetBlock;

    entries.push({
      kind: "dependency_violation",
      severity: "error",
      description: `Block \`${sourceBlockName}\` (${sourceBlock}) depends on block \`${targetBlockName}\` (${targetBlock}) but does not declare it in its interfaces.`,
      affectedBlock: sourceBlock,
      affectedFile: dep.source_file,
    });
  }
}

/**
 * Find quality scenarios with linked_tests that don't match any indexed file paths.
 */
function detectUnlinkedTests(
  db: Database,
  entries: DriftEntry[],
): void {
  const scenarios = db
    .prepare(
      "SELECT id, name, linked_tests FROM quality_scenarios WHERE linked_tests != '[]'",
    )
    .all() as { id: string; name: string; linked_tests: string }[];

  // Get all known file paths for fast lookup
  const knownFiles = new Set(
    (
      db
        .prepare("SELECT DISTINCT file_path FROM symbols")
        .all() as { file_path: string }[]
    ).map((r) => r.file_path),
  );

  for (const scenario of scenarios) {
    const testPaths = safeParseJson<string[]>(scenario.linked_tests, []);

    for (const testPath of testPaths) {
      // Check if any known file starts with (or equals) this path
      const prefix = normalizePath(testPath);
      const found = [...knownFiles].some(
        (fp) => fp === prefix || fp.startsWith(prefix),
      );

      if (!found) {
        entries.push({
          kind: "unlinked_test",
          severity: "warning",
          description: `Quality scenario \`${scenario.id}: ${scenario.name}\` links to test path \`${testPath}\` but no indexed files match it.`,
          affectedBlock: null,
          affectedFile: testPath,
        });
      }
    }
  }
}

/**
 * Find ADRs whose affected_files reference paths with no indexed symbols.
 */
function detectStaleAdrs(
  db: Database,
  entries: DriftEntry[],
): void {
  const adrs = db
    .prepare("SELECT id, title, affected_files FROM adrs WHERE status != 'superseded'")
    .all() as AdrRow[];

  for (const adr of adrs) {
    const files = safeParseJson<string[]>(adr.affected_files, []);
    if (files.length === 0) continue;

    for (const file of files) {
      const prefix = normalizePath(file);
      const match = db
        .prepare("SELECT 1 FROM symbols WHERE file_path LIKE ? LIMIT 1")
        .get(`${escapeLike(prefix)}%`) as unknown | undefined;

      if (!match) {
        entries.push({
          kind: "stale_adr",
          severity: "info",
          description: `ADR \`${adr.id}: ${adr.title}\` references \`${file}\` but no indexed symbols match it.`,
          affectedBlock: null,
          affectedFile: file,
        });
      }
    }
  }
}

/**
 * Find package dependencies (npm/NuGet) that have no corresponding ADR.
 * Flags packages that were likely added without documenting the rationale.
 * Only flags non-trivial packages (skips common tooling/framework deps).
 */
function detectNewDependencies(
  db: Database,
  entries: DriftEntry[],
): void {
  const packages = db
    .prepare("SELECT name, source FROM package_dependencies WHERE source IN ('npm', 'nuget')")
    .all() as { name: string; source: string }[];

  if (packages.length === 0) return;

  // Get all ADR text to check if any mention the package
  const adrs = db
    .prepare("SELECT id, title, context, decision FROM adrs WHERE status != 'superseded'")
    .all() as { id: string; title: string; context: string | null; decision: string | null }[];

  // Build searchable text from ADRs
  const adrText = adrs
    .map((a) => `${a.title} ${a.context ?? ""} ${a.decision ?? ""}`.toLowerCase())
    .join(" ");

  // Common packages that don't need ADRs (all lowercase for case-insensitive matching)
  const trivialPackages = new Set([
    // npm
    "typescript", "eslint", "prettier", "vitest", "jest",
    "@types/node", "@types/react", "tsup", "tsx",
    // nuget
    "microsoft.net.test.sdk", "xunit", "xunit.runner.visualstudio",
    "nunit", "nunit3testadapter", "coverlet.collector",
    "microsoft.aspnetcore.openapi", "swashbuckle.aspnetcore",
  ]);

  for (const pkg of packages) {
    if (trivialPackages.has(pkg.name.toLowerCase())) continue;

    // Check if any ADR mentions this package
    const pkgLower = pkg.name.toLowerCase();
    if (adrText.includes(pkgLower)) continue;

    // Also check for partial matches (e.g., ADR mentions "Serilog" matches "Serilog.Sinks.Console")
    const baseName = pkgLower.split(/[./]/)[0];
    if (baseName && baseName.length > 3 && adrText.includes(baseName)) continue;

    entries.push({
      kind: "new_dependency",
      severity: "info",
      description: `Package \`${pkg.name}\` (${pkg.source}) is used but not mentioned in any ADR. Consider documenting why this dependency was chosen.`,
      affectedBlock: null,
      affectedFile: null,
    });
  }
}

// --- Helpers ---

function normalizePath(codePath: string): string {
  // Remove trailing glob patterns: "src/lib/**" → "src/lib/", "src/lib/*" → "src/lib/"
  return codePath.replace(/\*+\/?$/, "");
}

function fileMatchesPath(filePath: string, prefix: string): boolean {
  // Exact file match or directory prefix match
  return filePath === prefix || filePath.startsWith(prefix);
}

function escapeLike(value: string): string {
  return value.replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function safeParseJson<T>(value: string | null, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
