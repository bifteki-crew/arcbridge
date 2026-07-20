import ts from "typescript";
import { relative, sep } from "node:path";
import type { Database } from "../db/connection.js";
import { transaction } from "../db/connection.js";

/**
 * Outbound HTTP call site detected in frontend/TS code — the consumer half of
 * an endpoint contract (the producer half is the `routes` table).
 */
export interface ApiCall {
  url: string;
  method: string;
  filePath: string;
  line: number;
}

const AXIOS_METHODS = new Set(["get", "post", "put", "delete", "patch", "head", "options"]);

/**
 * Extract the URL from a fetch/axios first argument. Handles string literals
 * and template literals; template substitutions (`/api/users/${id}`) become
 * `:param` segments so they can match parameterized route templates. Returns
 * null for non-literal URLs (variables, function results) — those can't be
 * matched statically and are skipped rather than guessed.
 */
function literalUrl(node: ts.Expression): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isTemplateExpression(node)) {
    let url = node.head.text;
    for (const span of node.templateSpans) {
      url += `:param${span.literal.text}`;
    }
    return url;
  }
  return null;
}

/** Read `method: "POST"` out of a fetch options object literal. */
function methodFromOptions(node: ts.Expression | undefined): string | null {
  if (!node || !ts.isObjectLiteralExpression(node)) return null;
  for (const prop of node.properties) {
    if (
      ts.isPropertyAssignment(prop) &&
      (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) &&
      prop.name.text === "method" &&
      (ts.isStringLiteral(prop.initializer) || ts.isNoSubstitutionTemplateLiteral(prop.initializer))
    ) {
      return prop.initializer.text.toUpperCase();
    }
  }
  return null;
}

/**
 * Walk a source file for outbound HTTP call sites:
 * - `fetch(url)` / `fetch(url, { method: "POST" })`
 * - `axios.get(url)` / `axios.post(url)` / … and `axios(url, { method })`
 *
 * Only same-origin URLs (starting with `/`) are recorded — absolute URLs point
 * at external hosts that aren't part of this repo's contract surface.
 */
export function extractApiCalls(sf: ts.SourceFile, relPath: string): ApiCall[] {
  const calls: ApiCall[] = [];

  const record = (urlNode: ts.Expression, method: string, pos: number): void => {
    const url = literalUrl(urlNode);
    if (!url || !url.startsWith("/")) return;
    const { line } = sf.getLineAndCharacterOfPosition(pos);
    calls.push({ url, method, filePath: relPath, line: line + 1 });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const callee = node.expression;

      // fetch(url, opts?) — also covers globalThis.fetch / window.fetch
      const isFetch =
        (ts.isIdentifier(callee) && callee.text === "fetch") ||
        (ts.isPropertyAccessExpression(callee) && callee.name.text === "fetch");
      if (isFetch) {
        const method = methodFromOptions(node.arguments[1]) ?? "GET";
        record(node.arguments[0], method, node.getStart(sf));
      }

      // <receiver>.get/post/…(url) — heuristic: any receiver whose name looks
      // like an HTTP client (`axios`, or instance names matching
      // /api|client|http/i, e.g. `api.get(...)`, `apiClient.post(...)`).
      // Wider than axios alone by design — axios.create() instances are
      // conventionally named like this — at the cost of occasionally catching
      // a non-HTTP object with a same-named verb method.
      if (
        ts.isPropertyAccessExpression(callee) &&
        AXIOS_METHODS.has(callee.name.text) &&
        ts.isIdentifier(callee.expression) &&
        /axios|api|client|http/i.test(callee.expression.text)
      ) {
        record(node.arguments[0], callee.name.text.toUpperCase(), node.getStart(sf));
      }

      // axios(url, { method }) direct call form
      if (ts.isIdentifier(callee) && callee.text === "axios") {
        const method = methodFromOptions(node.arguments[1]) ?? "GET";
        record(node.arguments[0], method, node.getStart(sf));
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return calls;
}

/**
 * Analyze all source files for outbound API calls and persist them,
 * service-scoped (full re-extract per index run, mirroring routes).
 * Returns the number of calls recorded.
 */
export function analyzeApiCalls(
  sourceFiles: readonly ts.SourceFile[],
  projectRoot: string,
  db: Database,
  service: string = "main",
): number {
  const allCalls: ApiCall[] = [];
  for (const sf of sourceFiles) {
    if (sf.isDeclarationFile) continue;
    const relPath = relative(projectRoot, sf.fileName).split(sep).join("/");
    allCalls.push(...extractApiCalls(sf, relPath));
  }

  db.prepare("DELETE FROM api_calls WHERE service = ?").run(service);
  if (allCalls.length > 0) {
    const insert = db.prepare(
      "INSERT OR REPLACE INTO api_calls (id, url, method, file_path, line, service) VALUES (?, ?, ?, ?, ?, ?)",
    );
    transaction(db, () => {
      for (const call of allCalls) {
        insert.run(
          `${service}::${call.filePath}:${call.line}::${call.method} ${call.url}`,
          call.url,
          call.method,
          call.filePath,
          call.line,
          service,
        );
      }
    });
  }
  return allCalls.length;
}
