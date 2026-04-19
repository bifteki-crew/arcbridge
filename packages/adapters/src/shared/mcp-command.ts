import { platform } from "node:os";

/**
 * Return the MCP server command and args for the current platform.
 * On Windows, `npx` is a `.cmd` script that cannot be spawned directly —
 * MCP clients use `child_process.spawn` without a shell, so we wrap it
 * with `cmd /c`.
 */
export function mcpCommand(): { command: string; args: string[] } {
  if (platform() === "win32") {
    return {
      command: "cmd",
      args: ["/c", "npx", "-y", "@arcbridge/mcp-server"],
    };
  }
  return {
    command: "npx",
    args: ["-y", "@arcbridge/mcp-server"],
  };
}

/**
 * Return the MCP server command as a flat array (for platforms like OpenCode
 * that use `command: ["npx", ...]` instead of separate command + args).
 */
export function mcpCommandArray(): string[] {
  if (platform() === "win32") {
    return ["cmd", "/c", "npx", "-y", "@arcbridge/mcp-server"];
  }
  return ["npx", "-y", "@arcbridge/mcp-server"];
}
