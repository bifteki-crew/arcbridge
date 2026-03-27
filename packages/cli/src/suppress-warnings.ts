/**
 * Suppress the node:sqlite ExperimentalWarning for this process.
 * Import this as the first line in entry points (CLI, MCP server).
 * This is a process-level concern, not a library concern — @arcbridge/core
 * does not suppress warnings so consumers can decide for themselves.
 */
const origEmit = process.emit;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(process as any).emit = function (event: string, ...args: any[]) {
  if (
    event === "warning" &&
    args[0]?.name === "ExperimentalWarning" &&
    typeof args[0]?.message === "string" &&
    args[0].message.includes("SQLite")
  ) {
    return false;
  }
  return origEmit.apply(process, [event, ...args] as Parameters<typeof origEmit>);
};
