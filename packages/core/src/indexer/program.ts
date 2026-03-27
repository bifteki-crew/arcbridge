import ts from "typescript";
import { join, dirname } from "node:path";
import type { IndexerOptions } from "./types.js";

export interface ProgramResult {
  program: ts.Program;
  checker: ts.TypeChecker;
  sourceFiles: readonly ts.SourceFile[];
  projectRoot: string;
}

export function createTsProgram(options: IndexerOptions): ProgramResult {
  const projectRoot = options.projectRoot;

  const configPath =
    options.tsconfigPath ??
    ts.findConfigFile(projectRoot, ts.sys.fileExists, "tsconfig.json");

  if (!configPath) {
    throw new Error(
      `No tsconfig.json found in ${projectRoot}. TypeScript indexing requires a tsconfig.json.`,
    );
  }

  let configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    const message = ts.flattenDiagnosticMessageText(
      configFile.error.messageText,
      "\n",
    );
    throw new Error(`Failed to read tsconfig.json: ${message}`);
  }

  // Handle tsconfig with "references" but no "include" (common in Vite projects).
  // The root tsconfig.json delegates to tsconfig.app.json / tsconfig.node.json.
  // Without resolving references, parseJsonConfigFileContent returns 0 files.
  let resolvedConfigPath = configPath;
  const config = configFile.config;
  const hasOwnFiles = (config.include && config.include.length > 0) || (config.files && config.files.length > 0);
  if (config.references && !hasOwnFiles) {
    // First try declared references (e.g., [{ "path": "./tsconfig.app.json" }])
    for (const ref of config.references) {
      const refRelPath = typeof ref === "string" ? ref : ref.path;
      if (!refRelPath) continue;
      const refFullPath = join(dirname(configPath), refRelPath);
      // Reference might point to a directory (containing tsconfig.json) or a file
      const refConfigPath = refFullPath.endsWith(".json")
        ? refFullPath
        : join(refFullPath, "tsconfig.json");
      if (ts.sys.fileExists(refConfigPath)) {
        const refConfig = ts.readConfigFile(refConfigPath, ts.sys.readFile);
        const rc = refConfig.config;
        if (!refConfig.error && ((rc.include?.length > 0) || (rc.files?.length > 0))) {
          configFile = refConfig;
          resolvedConfigPath = refConfigPath;
          break;
        }
      }
    }

    // Fallback: try common names if references didn't resolve
    if (resolvedConfigPath === configPath) {
      for (const candidate of ["tsconfig.app.json", "tsconfig.src.json"]) {
        const refPath = ts.findConfigFile(projectRoot, ts.sys.fileExists, candidate);
        if (refPath) {
          const refConfig = ts.readConfigFile(refPath, ts.sys.readFile);
          if (!refConfig.error) {
            configFile = refConfig;
            resolvedConfigPath = refPath;
            break;
          }
        }
      }
    }
  }

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    join(projectRoot),
    { noEmit: true },
    resolvedConfigPath,
  );

  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
  });

  const checker = program.getTypeChecker();

  const sourceFiles = program
    .getSourceFiles()
    .filter(
      (sf) =>
        !sf.isDeclarationFile &&
        !sf.fileName.includes("node_modules"),
    );

  return { program, checker, sourceFiles, projectRoot };
}
