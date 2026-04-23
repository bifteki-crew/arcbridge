import ts from "typescript";
import { relative, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import YAML from "yaml";
import type { Database } from "../db/connection.js";
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
import { indexDotnetProjectRoslyn, findDotnetProject, hasIndexerProject, hasGlobalTool } from "./dotnet-indexer.js";
import { indexCSharpTreeSitter } from "./csharp/indexer.js";
import { indexPythonTreeSitter } from "./python/indexer.js";
import { indexGoTreeSitter } from "./go/indexer.js";
import { indexPackageDependencies } from "./package-deps.js";
import { loadConfig } from "../config/loader.js";

export type ProjectLanguage = "typescript" | "csharp" | "python" | "go" | "auto";
export type CSharpBackend = "roslyn" | "tree-sitter";

/**
 * Detect the project language from files in the project root.
 * Priority: Unity (C#) → tsconfig.json (TS) → .csproj/.sln (C#) → go.mod (Go)
 * → pyproject.toml/requirements.txt/setup.py (Python) → package.json (TS) → default TS.
 * Unity check comes first because Unity auto-generates .sln files.
 * package.json without tsconfig is checked last to avoid misdetecting
 * Go/Python projects that have ancillary Node.js tooling.
 */
export function detectProjectLanguage(projectRoot: string): "typescript" | "csharp" | "python" | "go" {
  // Unity projects are always C# (check before TypeScript — Unity has no tsconfig/package.json)
  if (
    existsSync(join(projectRoot, "ProjectSettings")) &&
    existsSync(join(projectRoot, "Assets"))
  ) {
    return "csharp";
  }

  // TypeScript: tsconfig.json is a strong, unambiguous signal
  if (existsSync(join(projectRoot, "tsconfig.json"))) return "typescript";

  // .NET signals
  if (findDotnetProject(projectRoot)) return "csharp";

  // Go signals
  if (existsSync(join(projectRoot, "go.mod"))) return "go";

  // Python signals
  if (
    existsSync(join(projectRoot, "pyproject.toml")) ||
    existsSync(join(projectRoot, "requirements.txt")) ||
    existsSync(join(projectRoot, "setup.py"))
  ) {
    return "python";
  }

  // package.json without tsconfig — could be a JS project or tooling-only;
  // check after Go/Python so a Go/Python project with ancillary package.json
  // isn't misdetected as TypeScript
  if (existsSync(join(projectRoot, "package.json"))) return "typescript";

  // Default to TypeScript (existing behavior)
  return "typescript";
}

/**
 * Index a project, auto-detecting the language unless explicitly specified.
 * Dispatches to the TypeScript, C# (Roslyn or tree-sitter), Python, or Go indexer.
 */
export async function indexProject(
  db: Database,
  options: IndexerOptions,
): Promise<IndexResult> {
  const language = options.language ?? "auto";
  const resolvedLanguage = language === "auto"
    ? detectProjectLanguage(options.projectRoot)
    : language;

  // Index package dependencies (npm/NuGet) regardless of language
  indexPackageDependencies(db, options.projectRoot, options.service ?? "main");

  if (resolvedLanguage === "csharp") {
    const backend = resolveCSharpBackend(options.projectRoot);
    if (backend === "roslyn") {
      return indexDotnetProjectRoslyn(db, {
        projectRoot: options.projectRoot,
        service: options.service,
      });
    }
    return await indexCSharpTreeSitter(db, {
      projectRoot: options.projectRoot,
      service: options.service,
    });
  }

  if (resolvedLanguage === "python") {
    return await indexPythonTreeSitter(db, {
      projectRoot: options.projectRoot,
      service: options.service,
    });
  }

  if (resolvedLanguage === "go") {
    return await indexGoTreeSitter(db, {
      projectRoot: options.projectRoot,
      service: options.service,
    });
  }

  // Resolve tsconfig once — used for both the skip check and indexing itself,
  // avoiding a redundant filesystem walk in createTsProgram.
  const resolvedTsconfigPath =
    options.tsconfigPath ??
    ts.findConfigFile(options.projectRoot, ts.sys.fileExists, "tsconfig.json");

  if (!resolvedTsconfigPath) {
    return {
      symbolsIndexed: 0,
      dependenciesIndexed: 0,
      componentsAnalyzed: 0,
      routesAnalyzed: 0,
      filesProcessed: 0,
      filesSkipped: 0,
      filesRemoved: 0,
      durationMs: 0,
      skippedReason: "no tsconfig.json found",
    };
  }

  return indexTypeScriptProject(db, {
    ...options,
    tsconfigPath: resolvedTsconfigPath,
  });
}

/**
 * Resolve which C# indexer backend to use.
 * 1. Check config for explicit `indexing.csharp_indexer` setting
 * 2. If "auto": global tool on PATH → Roslyn, else dotnet CLI + monorepo project → Roslyn, else tree-sitter
 */
export function resolveCSharpBackend(projectRoot: string): CSharpBackend {
  // Use the existing config loader for validated config access
  const { config, error } = loadConfig(projectRoot);
  let setting = config?.indexing?.csharp_indexer;

  // If full config validation failed but the file exists, try to extract
  // just the csharp_indexer setting from raw YAML so an unrelated config
  // error doesn't silently override the user's explicit backend choice
  if (!setting && error) {
    try {
      const raw = readFileSync(join(projectRoot, ".arcbridge", "config.yaml"), "utf-8");
      const parsed = YAML.parse(raw);
      const rawSetting = parsed?.indexing?.csharp_indexer;
      if (rawSetting === "roslyn" || rawSetting === "tree-sitter") {
        setting = rawSetting;
      }
    } catch {
      // Ignore — proceed with auto
    }
  }

  if (setting === "roslyn" || setting === "tree-sitter") {
    return setting;
  }

  // Auto: prefer global tool, then monorepo source + dotnet CLI, else tree-sitter
  if (hasGlobalTool()) {
    return "roslyn";
  }

  // Global tool not found — check if dotnet CLI + monorepo indexer project are available
  if (hasIndexerProject()) {
    try {
      execFileSync("dotnet", ["--version"], {
        encoding: "utf-8",
        timeout: 5000,
      });
      return "roslyn";
    } catch {
      // .NET SDK not available
    }
  }

  return "tree-sitter";
}

function indexTypeScriptProject(
  db: Database,
  options: IndexerOptions,
): IndexResult {
  const start = Date.now();
  const service = options.service ?? "main";

  // 1. Create TS program
  const { checker, sourceFiles, projectRoot } = createTsProgram(options);

  // 2. Compute file hashes and compare with existing
  const existingHashes = getExistingHashes(db, service, "typescript");

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
  writeSymbols(db, allSymbols, service, "typescript");

  // 7. Extract dependencies across ALL source files
  //    (dependencies can cross file boundaries, so we need all symbols for lookup)
  const allDbSymbols = db
    .prepare("SELECT id, file_path as filePath, name FROM symbols WHERE service = ? AND language = 'typescript'")
    .all(service) as Array<{ id: string; filePath: string; name: string }>;

  const lookup = buildSymbolLookup(allDbSymbols);

  // Clear existing dependencies for changed files (already done in removeSymbolsForFiles)
  // Now extract fresh dependencies from all source files
  const allDeps = sourceFiles.flatMap((sf) => {
    const relPath = relative(projectRoot, sf.fileName);
    return extractDependencies(sf, checker, relPath, projectRoot, lookup);
  });

  // Clear all deps and re-insert (simpler than incremental for cross-file edges)
  db.prepare("DELETE FROM dependencies WHERE source_symbol IN (SELECT id FROM symbols WHERE service = ? AND language = 'typescript')").run(service);
  writeDependencies(db, allDeps);

  // 8. Analyze components — React (JSX) and Angular (@Component) detection
  // Client-only frameworks have no server component concept — all components are client
  const CLIENT_ONLY_TEMPLATES = new Set(["react-vite", "angular-app"]);
  const projectType = (
    db.prepare("SELECT value FROM arcbridge_meta WHERE key = 'project_type'").get() as { value: string } | undefined
  )?.value;
  const allClient = projectType ? CLIENT_ONLY_TEMPLATES.has(projectType) : false;
  const componentsAnalyzed = analyzeComponents(sourceFiles, checker, projectRoot, db, allClient);

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

export type { IndexerOptions, IndexResult, ExtractedSymbol, SymbolKind, IndexerLanguage } from "./types.js";
export { discoverDotnetServices, type DotnetProjectInfo } from "./dotnet-indexer.js";
export { indexPackageDependencies } from "./package-deps.js";
