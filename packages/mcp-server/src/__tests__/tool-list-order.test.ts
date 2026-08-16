// MCP revision 2026-07-28 adds: "Servers SHOULD return tools from tools/list in a
// deterministic order to enable client-side caching and improve LLM prompt cache
// hit rates."
//
// We satisfy this today only as a side effect of registering tools in a fixed
// order in server.ts. That is easy to break without noticing — building the
// registration list from an object, a Map iteration, or a Promise.all would all
// still pass every other test while quietly reshuffling the list and costing
// every user prompt-cache hits on every session. Pinned here so the guarantee is
// intentional rather than incidental.
import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createArcBridgeServer } from "../server.js";
import { createContext } from "../context.js";

async function listToolNames(): Promise<string[]> {
  const server = createArcBridgeServer(createContext());
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "order-test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const { tools } = await client.listTools();
    return tools.map((t) => t.name);
  } finally {
    await client.close();
  }
}

describe("tools/list ordering", () => {
  it("is identical across separate server instances", async () => {
    const [first, second] = await Promise.all([listToolNames(), listToolNames()]);
    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual(first);
  });

  it("is stable when the same server is listed twice", async () => {
    const server = createArcBridgeServer(createContext());
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "order-test", version: "0.0.0" });
    await Promise.all([server.connect(st), client.connect(ct)]);
    try {
      const a = (await client.listTools()).tools.map((t) => t.name);
      const b = (await client.listTools()).tools.map((t) => t.name);
      expect(b).toEqual(a);
    } finally {
      await client.close();
    }
  });

  it("leads with the tools an agent needs first", async () => {
    // Registration order is deliberately semantic (lifecycle → architecture →
    // planning → code intelligence) rather than alphabetical: it reads better to
    // a model scanning the list, and re-sorting would invalidate every existing
    // client's cache once for no benefit. Pinning the first entry keeps that a
    // decision rather than an accident.
    const names = await listToolNames();
    expect(names[0]).toBe("arcbridge_init_project");
    expect(names).toContain("arcbridge_get_building_blocks");
  });

  it("exposes no duplicate tool names", async () => {
    const names = await listToolNames();
    expect(new Set(names).size).toBe(names.length);
  });
});
