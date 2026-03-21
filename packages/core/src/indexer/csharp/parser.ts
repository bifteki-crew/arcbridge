import { accessSync, constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Parser, type Tree } from "web-tree-sitter";

const currentDir = dirname(fileURLToPath(import.meta.url));

let cachedParser: Parser | null = null;
let initPromise: Promise<Parser> | null = null;

/**
 * Resolve the path to the vendored C# grammar WASM file.
 * Handles both source (src/indexer/csharp/) and dist (dist/) layouts.
 */
function resolveGrammarPath(): string {
  const candidates = [
    resolve(currentDir, "../../../wasm/tree-sitter-c_sharp.wasm"),  // from src/indexer/csharp/
    resolve(currentDir, "../wasm/tree-sitter-c_sharp.wasm"),        // from dist/ (tsup flat bundle)
  ];

  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.R_OK);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error(
    "Could not find tree-sitter-c_sharp.wasm. " +
    "Ensure the wasm/ directory is present in the @arcbridge/core package.",
  );
}

/**
 * Initialize the web-tree-sitter parser with the C# grammar.
 * Must be called (and awaited) before parseCSharp().
 * Safe to call multiple times — returns cached parser after first init.
 */
export async function ensureCSharpParser(): Promise<Parser> {
  if (cachedParser) return cachedParser;

  // Deduplicate concurrent init calls
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const TreeSitter = await import("web-tree-sitter");
      await TreeSitter.Parser.init();
      const grammarPath = resolveGrammarPath();
      const CSharp = await TreeSitter.Language.load(grammarPath);
      const parser = new TreeSitter.Parser();
      parser.setLanguage(CSharp);
      cachedParser = parser;
      return parser;
    } catch (err) {
      initPromise = null; // allow retry on next call
      throw err;
    }
  })();

  return initPromise;
}

/**
 * Parse C# source code. Requires ensureCSharpParser() to have been awaited first.
 * Throws if the parser has not been initialized.
 */
export function parseCSharp(content: string): Tree {
  if (!cachedParser) {
    throw new Error(
      "C# parser not initialized. Call await ensureCSharpParser() first.",
    );
  }
  const tree = cachedParser.parse(content);
  if (!tree) {
    throw new Error("Failed to parse C# content");
  }
  return tree;
}
