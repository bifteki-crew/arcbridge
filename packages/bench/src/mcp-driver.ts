import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createArcBridgeServer, createContext } from "@arcbridge/mcp-server/server";

/**
 * A live ArcBridge MCP server driven in-process over the SDK's in-memory
 * transport — the same setup the e2e lifecycle suite uses. This measures what
 * an agent actually receives from a tool call, not an approximation of it.
 */
export interface McpDriver {
  call(name: string, args: Record<string, unknown>): Promise<string>;
  close(): Promise<void>;
}

export async function createDriver(): Promise<McpDriver> {
  const ctx = createContext();
  const server = createArcBridgeServer(ctx);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "arcbridge-bench", version: "0.0.0" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  return {
    async call(name, args) {
      const res = await client.callTool({ name, arguments: args });
      const content = res.content as Array<{ type: string; text?: string }>;
      return content
        .filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("\n");
    },
    async close() {
      await client.close();
      // The context owns the cached DB handle; close it so temp dirs can be
      // removed cleanly on Windows/locked-file platforms.
      ctx.db?.close();
    },
  };
}
