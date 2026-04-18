import { describe, it, expect, vi, beforeEach } from "vitest";

describe("mcp-command", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns npx command on non-Windows platforms", async () => {
    vi.doMock("node:os", () => ({ platform: () => "darwin" }));
    const { mcpCommand, mcpCommandArray } = await import("../shared/mcp-command.js");

    expect(mcpCommand()).toEqual({
      command: "npx",
      args: ["-y", "@arcbridge/mcp-server"],
    });
    expect(mcpCommandArray()).toEqual(["npx", "-y", "@arcbridge/mcp-server"]);
  });

  it("returns cmd /c npx on Windows", async () => {
    vi.doMock("node:os", () => ({ platform: () => "win32" }));
    const { mcpCommand, mcpCommandArray } = await import("../shared/mcp-command.js");

    expect(mcpCommand()).toEqual({
      command: "cmd",
      args: ["/c", "npx", "-y", "@arcbridge/mcp-server"],
    });
    expect(mcpCommandArray()).toEqual(["cmd", "/c", "npx", "-y", "@arcbridge/mcp-server"]);
  });
});
