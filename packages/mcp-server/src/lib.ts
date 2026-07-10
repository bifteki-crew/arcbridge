// Library entry: the server factory + context, for embedding the ArcBridge MCP
// server in-process (e.g. the benchmark harness drives it over InMemoryTransport)
// without going through the stdio binary in `index.ts`.
export { createArcBridgeServer } from "./server.js";
export { createContext, type ServerContext } from "./context.js";
