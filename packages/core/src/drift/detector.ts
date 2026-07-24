import type { Database } from "../db/connection.js";
import { transaction } from "../db/connection.js";
import { typesConflict } from "../contracts/types.js";

export type DriftKind =
  | "undocumented_module"
  | "missing_module"
  | "dependency_violation"
  | "unlinked_test"
  | "stale_adr"
  | "new_dependency"
  | "contract_violation";

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
  "angular-app": [
    ".angular/",
    "src/environments/",
    "src/main.ts",
    "src/index.html",
    "src/styles.",
    "angular.json",
  ],
  "dotnet-webapi": [
    "Program.", "Startup.",
    "bin/", "obj/",
    "Properties/",
    "Migrations/",
    "wwwroot/",
  ],
  "unity-game": [
    "Library/",
    "Temp/",
    "Logs/",
    "UserSettings/",
    "Packages/",
    "ProjectSettings/",
    "Assets/Plugins/",
    "obj/",
    "bin/",
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
  detectContractViolations(db, entries);

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
        .prepare("SELECT 1 FROM symbols WHERE file_path LIKE ? ESCAPE '\\' LIMIT 1")
        .get(`${escapeLike(prefix)}%`) as Record<string, unknown> | undefined;

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

  // Flatten every (block, prefix) pair once and sort by descending prefix
  // length, with block id as a deterministic tie-breaker for equal-length
  // prefixes. The first match for a file is then the most specific block.
  const rankedPrefixes: { blockId: string; prefix: string }[] = [];
  for (const block of blocks) {
    const paths = safeParseJson<string[]>(block.code_paths, []);
    for (const prefix of paths.map(normalizePath)) {
      rankedPrefixes.push({ blockId: block.id, prefix });
    }
  }
  rankedPrefixes.sort(
    (a, b) => b.prefix.length - a.prefix.length || a.blockId.localeCompare(b.blockId),
  );

  // Get all file paths and assign them to blocks
  const filePaths = db
    .prepare("SELECT DISTINCT file_path FROM symbols")
    .all() as { file_path: string }[];

  // Assign each file to the block with the LONGEST matching code-path prefix
  // (most specific wins) — first match in the ranked list, breaking early. This
  // is independent of the order blocks come back from SQLite, so a broad `src/`
  // block can't steal files from a narrower `src/components/` block. Generators
  // (templates, `adopt`) emit narrow-before-broad for readability, but the
  // correctness guarantee lives here.
  for (const { file_path } of filePaths) {
    const match = rankedPrefixes.find(({ prefix }) => fileMatchesPath(file_path, prefix));
    if (match) fileToBlock.set(file_path, match.blockId);
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
        .prepare("SELECT 1 FROM symbols WHERE file_path LIKE ? ESCAPE '\\' LIMIT 1")
        .get(`${escapeLike(prefix)}%`) as Record<string, unknown> | undefined;

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
    // npm — frameworks (core deps that don't need ADRs)
    "react", "react-dom", "next", "vite", "@vitejs/plugin-react",
    "express", "fastify", "hono", "koa",
    // npm — dev tooling
    "typescript", "eslint", "prettier", "vitest", "jest",
    "@types/node", "@types/react", "@types/react-dom",
    "tsup", "tsx", "ts-node", "nodemon",
    "@eslint/js", "typescript-eslint",
    // npm — build/bundler
    "esbuild", "rollup", "webpack", "postcss", "tailwindcss", "autoprefixer",
    // nuget — test
    "microsoft.net.test.sdk", "xunit", "xunit.runner.visualstudio",
    "nunit", "nunit3testadapter", "coverlet.collector",
    // nuget — framework
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

/**
 * Detect endpoint-contract violations: outbound fetch/axios calls (api_calls,
 * the consumer half) that no indexed service's api-route (routes, the producer
 * half) satisfies — either the URL matches nothing, or it matches but the HTTP
 * method isn't allowed. Runs only when the project exposes at least one
 * api-route: a pure frontend calling an externally-deployed backend has no
 * producer side in this repo, so flagging its calls would be pure noise.
 */
function detectContractViolations(db: Database, entries: DriftEntry[]): void {
  const calls = db
    .prepare("SELECT DISTINCT url, method, file_path, service, expected_type FROM api_calls")
    .all() as {
    url: string;
    method: string;
    file_path: string;
    service: string;
    expected_type: string | null;
  }[];
  if (calls.length === 0) return;

  const routeRows = db
    .prepare("SELECT route_path, http_methods, service, response_type FROM routes WHERE kind = 'api-route'")
    .all() as { route_path: string; http_methods: string; service: string; response_type: string | null }[];
  if (routeRows.length === 0) return;

  // Precompile once — segments + allowed methods per route — instead of
  // re-splitting/re-parsing inside the calls × routes comparison loop.
  const routes = routeRows.map((r) => ({
    segs: splitSegments(r.route_path),
    methods: safeParseJson<string[]>(r.http_methods, []),
    service: r.service,
    responseType: r.response_type,
  }));

  for (const call of calls) {
    // Strip query/hash — routes are matched on the path only
    const url = call.url.split("?")[0].split("#")[0];
    const urlSegs = splitSegments(url);
    const matching = routes.filter((r) => segmentsMatch(r.segs, urlSegs));

    if (matching.length === 0) {
      entries.push({
        kind: "contract_violation",
        severity: "warning",
        description: `\`${call.file_path}\` calls \`${call.method} ${url}\` but no indexed service exposes that endpoint.`,
        affectedBlock: null,
        affectedFile: call.file_path,
      });
      continue;
    }

    // A matching route with no declared methods means "any method" (some
    // analyzers, e.g. Go net/http, leave http_methods empty) — don't flag.
    const anyMethodRoute = matching.some((r) => r.methods.length === 0);
    const allowed = new Set(matching.flatMap((r) => r.methods));
    if (!anyMethodRoute && allowed.size > 0 && !allowed.has(call.method)) {
      entries.push({
        kind: "contract_violation",
        severity: "warning",
        description: `\`${call.file_path}\` calls \`${call.method} ${url}\` but the endpoint only allows ${[...allowed].sort().join(", ")}.`,
        affectedBlock: null,
        affectedFile: call.file_path,
      });
      continue;
    }

    // Field-level: when the call annotates its expected response type AND the
    // method-matching route knows the DTO it returns, diff the two field sets.
    if (!call.expected_type) continue;
    // Pick the DTO-bearing route deterministically: SQLite row order isn't
    // guaranteed, so when several services expose the same path+method, sort by
    // (service, responseType) rather than comparing against an arbitrary one.
    const candidates = matching
      .filter((r) => r.responseType && (r.methods.length === 0 || r.methods.includes(call.method)))
      .sort((a, b) =>
        a.service.localeCompare(b.service) || (a.responseType ?? "").localeCompare(b.responseType ?? ""),
      );
    // Ambiguous producers (different services returning different DTOs for the
    // same endpoint) can't be diffed meaningfully — skip rather than guess.
    const distinctDtos = new Set(candidates.map((r) => `${r.service}:${r.responseType}`));
    if (candidates.length === 0 || distinctDtos.size > 1) continue;
    const methodRoute = candidates[0];
    if (!methodRoute.responseType) continue;

    const expected = loadTypeFields(db, call.expected_type, call.service);
    const actual = loadTypeFields(db, methodRoute.responseType, methodRoute.service);
    if (expected.fields.length === 0 || actual.fields.length === 0) continue; // shape unknown on a side

    for (const field of expected.fields) {
      const exactMatch = actual.byName.get(field.name);
      if (exactMatch) {
        if (typesConflict(field.type, exactMatch.type)) {
          entries.push(contractEntry(
            `\`${call.file_path}\` expects \`${field.name}: ${field.type}\` from \`${call.method} ${url}\` but the endpoint returns \`${exactMatch.type}\` for that field.`,
            call.file_path,
          ));
        }
        continue;
      }
      const ciMatch = actual.byLower.get(field.name.toLowerCase());
      if (ciMatch) {
        entries.push(contractEntry(
          `\`${call.file_path}\` expects field \`${field.name}\` from \`${call.method} ${url}\` but the endpoint returns \`${ciMatch.name}\` (casing differs).`,
          call.file_path,
        ));
      } else if (!field.optional) {
        // An optional field (`foo?: string`) the backend doesn't return is
        // legitimate — only required fields are contract obligations.
        entries.push(contractEntry(
          `\`${call.file_path}\` expects field \`${field.name}\` from \`${call.method} ${url}\` but the endpoint's response type \`${methodRoute.responseType}\` has no such field.`,
          call.file_path,
        ));
      }
    }
  }
}

function contractEntry(description: string, file: string): DriftEntry {
  return { kind: "contract_violation", severity: "warning", description, affectedBlock: null, affectedFile: file };
}

interface TypeField {
  name: string;
  type: string | null;
  /** TS interface members declared `foo?:` — absence on the producer is legal. */
  optional: boolean;
}
interface TypeFields {
  /** Unique fields (deduped by exact name) — iterate this side. */
  fields: TypeField[];
  /** Exact-name lookup. */
  byName: Map<string, TypeField>;
  /** Lowercased-name lookup, for case-insensitive matching. */
  byLower: Map<string, TypeField>;
}

/**
 * Load a type's fields. Members are the `variable` symbol rows whose qualified
 * name's second-to-last segment is the type's simple name — `UserDto.email` (TS
 * interface) or `Api.Models.UserDto.email` (C# DTO). Scoped to the service.
 * Returns the unique field list plus exact/lowercased lookups (kept separate so
 * iterating one side never double-counts a mixed-case field name).
 */
function loadTypeFields(db: Database, typeName: string, service: string): TypeFields {
  const simple = typeName.split(".").pop() ?? typeName;
  const rows = db
    .prepare(
      // ORDER BY makes map construction deterministic — SQLite row order isn't
      // guaranteed, and several symbols can match the LIKE patterns.
      "SELECT name, qualified_name, return_type, signature FROM symbols WHERE kind = 'variable' AND service = ? AND (qualified_name LIKE ? ESCAPE '\\' OR qualified_name LIKE ? ESCAPE '\\') ORDER BY qualified_name, name",
    )
    .all(service, `${escapeLike(simple)}.%`, `%.${escapeLike(simple)}.%`) as {
    name: string;
    qualified_name: string;
    return_type: string | null;
    signature: string | null;
  }[];

  const byName = new Map<string, TypeField>();
  const byLower = new Map<string, TypeField>();
  for (const row of rows) {
    const parts = row.qualified_name.split(".");
    // The owning type is the segment before the field name
    if (parts[parts.length - 2] !== simple) continue;
    if (byName.has(row.name)) continue;
    const entry: TypeField = {
      name: row.name,
      type: row.return_type,
      optional: row.signature === "optional",
    };
    byName.set(row.name, entry);
    // Don't overwrite: when fields differ only by case, keep the first in the
    // deterministic order rather than letting a later row silently win.
    const lower = row.name.toLowerCase();
    if (!byLower.has(lower)) byLower.set(lower, entry);
  }
  return { fields: [...byName.values()], byName, byLower };
}

/**
 * Segment-wise route/URL match. A segment counts as a parameter placeholder in
 * any analyzer's style — `:id` (Next/Gin), `{id}` (ASP.NET/FastAPI/Chi),
 * `<id>` (Flask), `[id]`/`*` — and a placeholder on either side matches any
 * concrete segment. Concrete segments compare case-insensitively (ASP.NET
 * routing is case-insensitive; this is a heuristic matcher, not a router).
 */
export function routeMatchesUrl(routePath: string, url: string): boolean {
  return segmentsMatch(splitSegments(routePath), splitSegments(url));
}

function splitSegments(path: string): string[] {
  return path.split("/").filter(Boolean);
}

function segmentsMatch(routeSegs: string[], urlSegs: string[]): boolean {
  for (let i = 0; i < routeSegs.length; i++) {
    const rs = routeSegs[i];
    // A catch-all segment (Next.js [...slug]/*slug, Gin *path, ASP.NET
    // {**slug}) swallows all remaining URL segments (zero or more — optional
    // catch-alls exist, and over-matching is the right bias for a heuristic).
    if (isCatchAllSegment(rs)) return true;
    const us = urlSegs[i];
    if (us === undefined) return false;
    if (!isParamSegment(rs) && !isParamSegment(us) && rs.toLowerCase() !== us.toLowerCase()) {
      return false;
    }
  }
  return routeSegs.length === urlSegs.length;
}

function isCatchAllSegment(seg: string): boolean {
  return (
    seg.startsWith("*") ||
    seg.startsWith("[...") ||
    seg.startsWith("[[...") ||
    seg.startsWith("{**") ||
    seg.includes("...")
  );
}

function isParamSegment(seg: string): boolean {
  return (
    seg.startsWith(":") ||
    seg.startsWith("*") ||
    (seg.startsWith("{") && seg.endsWith("}")) ||
    (seg.startsWith("<") && seg.endsWith(">")) ||
    (seg.startsWith("[") && seg.endsWith("]"))
  );
}

function normalizePath(codePath: string): string {
  // Remove trailing glob patterns: "src/lib/**" → "src/lib/", "src/lib/*" → "src/lib/"
  return codePath.replace(/\*+\/?$/, "");
}

function fileMatchesPath(filePath: string, prefix: string): boolean {
  // Exact file match or directory prefix match
  return filePath === prefix || filePath.startsWith(prefix);
}

function escapeLike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function safeParseJson<T>(value: string | null, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
