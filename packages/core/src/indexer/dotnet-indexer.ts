import { execFileSync } from "node:child_process";
import { resolve, join, dirname, relative, basename } from "node:path";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";
import type { IndexResult, ExtractedSymbol } from "./types.js";
import type { ExtractedDependency } from "./dependency-extractor.js";
import {
  getExistingHashes,
  removeSymbolsForFiles,
  writeSymbols,
  writeDependencies,
} from "./db-writer.js";

export interface DotnetIndexerOptions {
  projectRoot: string;
  service?: string;
  /** Explicit path to .csproj or .sln. If omitted, auto-detected from projectRoot. */
  csprojPath?: string;
}

/** JSON shape emitted by the .NET console app */
interface DotnetIndexerOutput {
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
  } catch {
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
 * Distinguishes "command not found" (ENOENT) from "command exists but failed".
 */
function hasGlobalTool(): boolean {
  try {
    execFileSync("arcbridge-dotnet-indexer", [], {
      encoding: "utf-8",
      timeout: 5000,
    });
    return true;
  } catch (err) {
    // ENOENT = executable not found on PATH
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      return false;
    }
    // Any other error means the tool exists but exited non-zero (e.g., missing args)
    return true;
  }
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

  // 1. Try the global tool (installed via `dotnet tool install -g arcbridge-dotnet-indexer`)
  if (hasGlobalTool()) {
    try {
      return execFileSync("arcbridge-dotnet-indexer", args, { ...EXEC_OPTIONS, cwd });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`.NET indexer (global tool) failed: ${message}`, { cause: err });
    }
  }

  // 2. Fall back to monorepo source (dotnet run --project)
  const indexerProject = resolveIndexerProject();
  if (!indexerProject) {
    throw new Error(
      "Roslyn C# indexer not available. Either install the global tool " +
      "(`dotnet tool install -g arcbridge-dotnet-indexer`) or run from the ArcBridge monorepo.",
    );
  }

  try {
    return execFileSync(
      "dotnet",
      ["run", "--project", indexerProject, "--no-build", "--", ...args],
      { ...EXEC_OPTIONS, cwd },
    );
  } catch {
    // Retry with build (first run may not have been built)
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
  db: Database.Database,
  options: DotnetIndexerOptions,
): IndexResult {
  const start = Date.now();
  const service = options.service ?? "main";
  const projectRoot = resolve(options.projectRoot);

  // Find the .NET project/solution to analyze
  const dotnetProject = options.csprojPath ?? findDotnetProject(projectRoot);
  if (!dotnetProject) {
    throw new Error(
      "No .sln or .csproj file found in project root. " +
      "The .NET indexer requires a project or solution file.",
    );
  }

  // Get existing hashes for incremental indexing
  const existingHashes = getExistingHashes(db, service);
  const hashesJson = JSON.stringify(Object.fromEntries(existingHashes));

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

  // Remove stale symbols for changed + removed files
  const filesToClean = [...output.changedFiles, ...output.removedFiles];
  removeSymbolsForFiles(db, filesToClean);

  // All symbols from all projects in the solution go under one service.
  // In a typical .NET solution (MyApp.Api, MyApp.Domain, MyApp.Infrastructure),
  // these are layers of the same service, not separate services.
  // Agents can still filter by file_path prefix to scope to a specific layer.
  const symbols: ExtractedSymbol[] = output.symbols.map((s) => ({
    id: s.id,
    name: s.name,
    qualifiedName: s.qualifiedName,
    kind: s.kind as ExtractedSymbol["kind"],
    filePath: s.filePath,
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
    sourceSymbolId: d.sourceSymbolId,
    targetSymbolId: d.targetSymbolId,
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
      INSERT OR REPLACE INTO routes (id, route_path, kind, http_methods, has_auth, service)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const runRoutes = db.transaction(() => {
      for (const route of output.routes) {
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

    runRoutes();
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
