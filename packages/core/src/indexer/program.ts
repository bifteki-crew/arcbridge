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

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    const message = ts.flattenDiagnosticMessageText(
      configFile.error.messageText,
      "\n",
    );
    throw new Error(`Failed to read tsconfig.json: ${message}`);
  }

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    join(projectRoot),
    { noEmit: true },
    configPath,
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
