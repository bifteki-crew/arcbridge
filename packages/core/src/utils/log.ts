/**
 * Log a non-fatal warning to stderr. stdout is reserved for command output
 * (--json) and MCP stdio framing, so diagnostics must go to stderr.
 */
export function logWarn(context: string, err?: unknown): void {
  const detail =
    err === undefined ? "" : `: ${err instanceof Error ? err.message : String(err)}`;
  process.stderr.write(`[arcbridge] ${context}${detail}\n`);
}
