import ts from "typescript";
import { join } from "node:path";
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
  if (config.references && !config.include && !config.files) {
    // Try common referenced config names
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
