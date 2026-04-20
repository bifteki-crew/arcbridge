import { accessSync, constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Parser, type Tree } from "web-tree-sitter";

const currentDir = dirname(fileURLToPath(import.meta.url));

let cachedParser: Parser | null = null;
let initPromise: Promise<Parser> | null = null;

/**
 * Resolve the path to the vendored Python grammar WASM file.
 * Handles both source (src/indexer/python/) and dist (dist/) layouts.
 */
function resolveGrammarPath(): string {
  const candidates = [
    resolve(currentDir, "../../../wasm/tree-sitter-python.wasm"),  // from src/indexer/python/
    resolve(currentDir, "../wasm/tree-sitter-python.wasm"),        // from dist/ (tsup flat bundle)
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
    "Could not find tree-sitter-python.wasm. " +
    "Ensure the wasm/ directory is present in the @arcbridge/core package.",
  );
}

/**
 * Initialize the web-tree-sitter parser with the Python grammar.
 * Must be called (and awaited) before parsePython().
 * Safe to call multiple times — returns cached parser after first init.
 */
export async function ensurePythonParser(): Promise<Parser> {
  if (cachedParser) return cachedParser;

  // Deduplicate concurrent init calls
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const TreeSitter = await import("web-tree-sitter");
      await TreeSitter.Parser.init();
      const grammarPath = resolveGrammarPath();
      const Python = await TreeSitter.Language.load(grammarPath);
      const parser = new TreeSitter.Parser();
      parser.setLanguage(Python);
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
 * Parse Python source code. Requires ensurePythonParser() to have been awaited first.
 * Throws if the parser has not been initialized.
 */
export function parsePython(content: string): Tree {
  if (!cachedParser) {
    throw new Error(
      "Python parser not initialized. Call await ensurePythonParser() first.",
    );
  }
  const tree = cachedParser.parse(content);
  if (!tree) {
    throw new Error("Failed to parse Python content");
  }
  return tree;
}
