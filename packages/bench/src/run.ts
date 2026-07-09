import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { reportsDir } from "./paths.js";
import { runTokenProxy } from "./token-proxy.js";
import { renderMarkdown, renderConsole } from "./report.js";

// Timestamp is passed in (not read from the clock in library code) so the
// report content is otherwise deterministic. Callers may override via argv[2].
const generatedAt = process.argv[2] ?? new Date().toISOString();

async function main(): Promise<void> {
  const results = await runTokenProxy();

  mkdirSync(reportsDir, { recursive: true });
  const mdPath = join(reportsDir, "token-savings.md");
  writeFileSync(mdPath, renderMarkdown(results, generatedAt));

  console.log(renderConsole(results));
  console.log(`\nReport written to ${mdPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
