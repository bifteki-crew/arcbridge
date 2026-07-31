import { execFileSync } from "node:child_process";
import { resolve, join, dirname, relative, basename, sep, isAbsolute } from "node:path";
import { readdirSync, readFileSync, existsSync, accessSync, constants } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Database } from "../db/connection.js";
import { transaction } from "../db/connection.js";
import { logWarn } from "../utils/log.js";
import { unwrapToTypeName } from "../contracts/types.js";
import type { IndexResult, ExtractedSymbol } from "./types.js";
import type { ExtractedDependency } from "./dependency-extractor.js";
import {
  getExistingHashes,
  removeScopedSymbolsForFiles,
  writeSymbols,
  writeDependencies,
} from "./db-writer.js";

export interface DotnetIndexerOptions {
  /** Path basis: stored file_paths (and thus symbol IDs) are relative to this. */
  projectRoot: string;
  service?: string;
  /** Explicit path to .csproj or .sln. If omitted, auto-detected from scanRoot/projectRoot. */
  csprojPath?: string;
  /**
   * Directory to look for the .sln/.csproj in (a service's subdirectory in a
   * monorepo). Defaults to projectRoot. The Roslyn tool always emits paths
   * relative to the solution dir; they are re-based onto projectRoot here so
   * symbol IDs stay unique across services and match repo-relative
   * building-block code_paths.
   */
  scanRoot?: string;
}

/** JSON shape emitted by the .NET console app */
interface DotnetIndexerOutput {
  /**
   * Extraction features this tool build supports. Absent on versions predating
   * the field, which is exactly the signal we need: the .NET tool versions
   * independently of this package, so "no response types" must be
   * distinguishable from "tool too old to emit them".
   */
  capabilities?: string[];
  symbols: Array<{
    id: string;
    name: string;
    qualifiedName: string;
    kind: string;
    filePath: string;
    startLine: number;
    endLine: number;
    startCol: number;
    endCol: number;
    signature: string | null;
    returnType: string | null;
    docComment: string | null;
    isExported: boolean;
    isAsync: boolean;
    contentHash: string;
    projectName?: string;
  }>;
  dependencies: Array<{
    sourceSymbolId: string;
    targetSymbolId: string;
    kind: string;
  }>;
  routes: Array<{
    id: string;
    routePath: string;
    kind: string;
    httpMethods: string[];
    hasAuth: boolean;
    handlerSymbolId?: string;
    /**
     * Response DTO with simple names and generics intact, e.g.
     * "Task<ActionResult<UserDto>>" — unwrapped here rather than in C# so both
     * backends share one unwrap table. Absent from older tool versions, which
     * simply leaves response_type null (field-level checks stay silent).
     */
    responseType?: string | null;
  }>;
  changedFiles: string[];
  removedFiles: string[];
  filesProcessed: number;
  filesSkipped: number;
  durationMs: number;
}

/**
 * Find .sln or .csproj in the project root.
 * Prefers .sln if present, falls back to .csproj.
 */
export function findDotnetProject(projectRoot: string): string | null {
  try {
    const entries = readdirSync(projectRoot);
    const sln = entries.find((e) => e.endsWith(".sln"));
    if (sln) return join(projectRoot, sln);
    const csproj = entries.find((e) => e.endsWith(".csproj"));
    if (csproj) return join(projectRoot, csproj);
    return null;
  } catch (err) {
    logWarn(`Could not scan ${projectRoot} for .sln/.csproj`, err);
    return null;
  }
}

/** Represents a .NET project discovered in a solution. */
export interface DotnetProjectInfo {
  /** Project name (without .csproj extension) */
  name: string;
  /** Relative path from solution root to .csproj directory */
  path: string;
  /** Full path to the .csproj file */
  csprojPath: string;
  /** Whether this is a test project (name contains Test/Tests) */
  isTestProject: boolean;
}

/**
 * Parse a .sln file to discover all .csproj projects.
 * Returns project info for each non-test project found.
 */
export function parseSolutionProjects(slnPath: string): DotnetProjectInfo[] {
  const content = readFileSync(slnPath, "utf-8");
  const slnDir = dirname(slnPath);
  const projects: DotnetProjectInfo[] = [];

  // Match Project("{...}") = "Name", "Path\To\Project.csproj", "{...}"
  const projectPattern = /Project\("\{[^}]+\}"\)\s*=\s*"([^"]+)",\s*"([^"]+\.csproj)"/g;
  let match: RegExpExecArray | null;

  while ((match = projectPattern.exec(content)) !== null) {
    const name = match[1];
    const relativeCsprojPath = match[2].replace(/\\/g, "/");
    const fullCsprojPath = resolve(join(slnDir, relativeCsprojPath));

    if (!existsSync(fullCsprojPath)) continue;

    const projectDir = relative(slnDir, dirname(fullCsprojPath)).replace(/\\/g, "/") || ".";
    // Match .NET test project naming conventions: MyApp.Tests, MyApp.UnitTests, etc.
    // But NOT names that merely start with "Test" like TestApi
    const isTestProject = /[.\x2d]tests?$/i.test(name) ||
      /[.\x2d](unit|integration|functional|e2e)tests?$/i.test(name);

    projects.push({
      name,
      path: projectDir,
      csprojPath: fullCsprojPath,
      isTestProject,
    });
  }

  return projects;
}

/**
 * Discover services from a .NET solution.
 * Returns service configs for non-test projects.
 * Test projects are excluded since they don't represent deployable services.
 */
export function discoverDotnetServices(projectRoot: string): DotnetProjectInfo[] {
  const slnPath = findDotnetProject(projectRoot);
  if (!slnPath || !slnPath.endsWith(".sln")) {
    // Single .csproj — return one project
    const csproj = slnPath;
    if (!csproj) return [];
    const name = basename(csproj, ".csproj");
    return [{
      name,
      path: ".",
      csprojPath: csproj,
      isTestProject: /[.\x2d]tests?$/i.test(name) ||
        /[.\x2d](unit|integration|functional|e2e)tests?$/i.test(name),
    }];
  }

  return parseSolutionProjects(slnPath);
}

/**
 * Check if the arcbridge-dotnet-indexer global tool is available on PATH.
 * Searches PATH directories directly (no dependency on which/where, works
 * in minimal containers where those may be missing).
 */
export function hasGlobalTool(): boolean {
  const pathEnv = process.env.PATH ?? "";
  const dirs = pathEnv.split(process.platform === "win32" ? ";" : ":");
  const name = "arcbridge-dotnet-indexer";
  const extensions = process.platform === "win32"
    ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";")
    : [""];

  for (const dir of dirs) {
    if (!dir) continue;
    for (const ext of extensions) {
      try {
        accessSync(join(dir, `${name}${ext}`), constants.X_OK);
        return true;
      } catch {
        continue;
      }
    }
  }
  return false;
}

/**
 * Resolve the path to the .NET indexer project (monorepo source fallback).
 * Looks relative to this package (core) up to the monorepo root.
 * Returns null if not found (e.g., running from installed npm package).
 */
function resolveIndexerProject(): string | null {
  const currentDir = dirname(fileURLToPath(import.meta.url));

  const candidates = [
    resolve(currentDir, "../../../../dotnet-indexer/ArcBridge.DotnetIndexer.csproj"),
    resolve(currentDir, "../../../dotnet-indexer/ArcBridge.DotnetIndexer.csproj"),
    resolve(currentDir, "../../dotnet-indexer/ArcBridge.DotnetIndexer.csproj"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

/**
 * Check if the monorepo indexer project is available (for development/source fallback).
 */
export function hasIndexerProject(): boolean {
  return resolveIndexerProject() !== null;
}

const EXEC_OPTIONS = {
  encoding: "utf-8" as const,
  maxBuffer: 50 * 1024 * 1024, // 50MB for large projects
  timeout: 300_000, // 5 minutes
};

/**
 * Run the .NET indexer, trying global tool first, then monorepo source.
 */
function runDotnetIndexer(
  dotnetProject: string,
  hashesJson: string,
  cwd: string,
): string {
  const args = [dotnetProject, "--existing-hashes", hashesJson];

  // 1. Try the global tool unless ARCBRIDGE_PREFER_SOURCE is set
  //    (useful for development/testing to ensure monorepo source is exercised)
  const preferSource = process.env.ARCBRIDGE_PREFER_SOURCE === "1";
  let globalToolError: unknown = null;
  if (!preferSource && hasGlobalTool()) {
    try {
      return execFileSync("arcbridge-dotnet-indexer", args, { ...EXEC_OPTIONS, cwd });
    } catch (err) {
      globalToolError = err;
      logWarn("Global tool arcbridge-dotnet-indexer failed, trying monorepo source fallback", err);
    }
  }

  // 2. Fall back to monorepo source (dotnet run --project)
  const indexerProject = resolveIndexerProject();
  if (!indexerProject) {
    const base =
      "Roslyn C# indexer not available. Either install the global tool " +
      "(`dotnet tool install -g arcbridge-dotnet-indexer`) or run from the ArcBridge monorepo.";
    if (globalToolError) {
      const msg = globalToolError instanceof Error ? globalToolError.message : String(globalToolError);
      throw new Error(`${base} Global tool was found but failed: ${msg}`, { cause: globalToolError });
    }
    throw new Error(base);
  }

  try {
    return execFileSync(
      "dotnet",
      ["run", "--project", indexerProject, "--no-build", "--", ...args],
      { ...EXEC_OPTIONS, cwd },
    );
  } catch (err) {
    // Retry with build (first run may not have been built)
    logWarn(".NET indexer --no-build run failed, retrying with build (expected on first run)", err);
    try {
      return execFileSync(
        "dotnet",
        ["run", "--project", indexerProject, "--", ...args],
        { ...EXEC_OPTIONS, cwd },
      );
    } catch (retryErr) {
      const message = retryErr instanceof Error ? retryErr.message : String(retryErr);
      throw new Error(`.NET indexer failed: ${message}`, { cause: retryErr });
    }
  }
}

/**
 * Index a .NET project by shelling out to the Roslyn-based .NET indexer.
 * Parses the JSON output and writes symbols/dependencies/routes to SQLite.
 */
export function indexDotnetProjectRoslyn(
  db: Database,
  options: DotnetIndexerOptions,
): IndexResult {
  const start = Date.now();
  const service = options.service ?? "main";
  const projectRoot = resolve(options.projectRoot);
  const scanRoot = resolve(options.scanRoot ?? options.projectRoot);

  // Find the .NET project/solution to analyze
  const dotnetProject = options.csprojPath ?? findDotnetProject(scanRoot);
  if (!dotnetProject) {
    throw new Error(
      "No .sln or .csproj file found in project root. " +
      "The .NET indexer requires a project or solution file.",
    );
  }

  // The Roslyn tool emits paths relative to the .sln/.csproj directory. Re-base
  // them onto projectRoot so stored paths (and the symbol IDs derived from
  // them, which start with the path) are repo-relative and cross-service safe.
  const basisDir = resolve(dirname(dotnetProject));
  const storedPrefix = relative(projectRoot, basisDir).split(sep).join("/");
  // A solution dir outside projectRoot would produce "../" stored paths,
  // breaking the repo-relative path/ID contract (scanRoot/csprojPath are
  // caller-provided, so guard here rather than trusting every caller).
  if (storedPrefix.startsWith("..") || isAbsolute(storedPrefix)) {
    throw new Error(
      `.NET project '${dotnetProject}' resolves outside projectRoot '${projectRoot}' — stored paths must stay project-relative.`,
    );
  }
  const addPrefix = (p: string): string => (storedPrefix ? `${storedPrefix}/${p}` : p);
  const stripPrefix = (p: string): string =>
    storedPrefix && p.startsWith(`${storedPrefix}/`) ? p.slice(storedPrefix.length + 1) : p;

  // Get existing hashes for incremental indexing — keys are stored
  // (projectRoot-relative) paths; the tool compares against its own
  // solution-relative paths, so strip the prefix on the way in.
  const existingHashes = getExistingHashes(db, service, "csharp");
  const hashesJson = JSON.stringify(
    Object.fromEntries(
      [...existingHashes].map(([path, hash]) => [stripPrefix(path), hash]),
    ),
  );

  // Shell out to the .NET indexer — prefer global tool, fall back to monorepo source
  const stdout = runDotnetIndexer(dotnetProject, hashesJson, projectRoot);

  // Parse JSON output (take last line that looks like JSON to skip any build output)
  const lines = stdout.trim().split("\n");
  const jsonLine = lines.reverse().find((l) => l.startsWith("{"));
  if (!jsonLine) {
    throw new Error("No JSON output from .NET indexer");
  }

  let output: DotnetIndexerOutput;
  try {
    output = JSON.parse(jsonLine);
  } catch {
    throw new Error(
      `Failed to parse .NET indexer JSON output. First 200 chars: ${jsonLine.slice(0, 200)}`,
    );
  }

  // The .NET tool versions independently of this npm package, so an outdated
  // global tool would emit routes with no response types and field-level
  // contract checks would just go quiet. Say so once, with the fix.
  if (output.routes.length > 0 && !output.capabilities?.includes("responseType")) {
    logWarn(
      "The installed arcbridge-dotnet-indexer predates response-type extraction, " +
        "so field-level contract checks will be skipped. Update it with " +
        "`dotnet tool update -g arcbridge-dotnet-indexer`, or set " +
        "`indexing.csharp_indexer: tree-sitter` in .arcbridge/config.yaml.",
    );
  }

  // Remove stale symbols for changed + removed files (scoped by service +
  // language). Tool output is solution-relative — re-base to stored paths.
  const filesToClean = [...output.changedFiles, ...output.removedFiles].map(addPrefix);
  removeScopedSymbolsForFiles(db, filesToClean, service, "csharp");

  // All symbols from all projects in the solution go under one service.
  // In a typical .NET solution (MyApp.Api, MyApp.Domain, MyApp.Infrastructure),
  // these are layers of the same service, not separate services.
  // Agents can still filter by file_path prefix to scope to a specific layer.
  const symbols: ExtractedSymbol[] = output.symbols.map((s) => ({
    // The ID starts with the file path, so prefixing the whole string re-bases it
    id: addPrefix(s.id),
    name: s.name,
    qualifiedName: s.qualifiedName,
    kind: s.kind as ExtractedSymbol["kind"],
    filePath: addPrefix(s.filePath),
    startLine: s.startLine,
    endLine: s.endLine,
    startCol: s.startCol,
    endCol: s.endCol,
    signature: s.signature,
    returnType: s.returnType,
    docComment: s.docComment,
    isExported: s.isExported,
    isAsync: s.isAsync,
    contentHash: s.contentHash,
  }));

  writeSymbols(db, symbols, service, "csharp");

  // Write dependencies
  const deps: ExtractedDependency[] = output.dependencies.map((d) => ({
    sourceSymbolId: addPrefix(d.sourceSymbolId),
    targetSymbolId: addPrefix(d.targetSymbolId),
    kind: d.kind as ExtractedDependency["kind"],
  }));

  // Clear existing deps for service and re-insert
  db.prepare(
    "DELETE FROM dependencies WHERE source_symbol IN (SELECT id FROM symbols WHERE service = ? AND language = 'csharp')",
  ).run(service);
  writeDependencies(db, deps);

  // Clean up stale routes before inserting
  db.prepare("DELETE FROM routes WHERE service = ?").run(service);

  // Write routes
  if (output.routes.length > 0) {
    const insertRoute = db.prepare(`
      INSERT OR REPLACE INTO routes (id, route_path, kind, http_methods, has_auth, service, response_type)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    transaction(db, () => {
      for (const route of output.routes) {
        // Scope route ID by service so different services with the same
        // endpoint don't overwrite each other via INSERT OR REPLACE
        insertRoute.run(
          `${service}::${route.id}`,
          route.routePath,
          route.kind,
          JSON.stringify(route.httpMethods),
          route.hasAuth ? 1 : 0,
          service,
          // Unwrap here so both C# backends store the same shape: the resolver
          // emits "Task<ActionResult<UserDto>>", the detector wants "UserDto".
          route.responseType ? unwrapToTypeName(route.responseType) : null,
        );
      }
    });

  }

  return {
    symbolsIndexed: output.symbols.length,
    dependenciesIndexed: output.dependencies.length,
    componentsAnalyzed: 0, // N/A for .NET
    routesAnalyzed: output.routes.length,
    filesProcessed: output.filesProcessed,
    filesSkipped: output.filesSkipped,
    filesRemoved: output.removedFiles.length,
    durationMs: Date.now() - start,
  };
}
