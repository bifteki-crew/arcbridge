import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createContext } from "./context.js";
import { registerInitProject } from "./tools/init-project.js";
import { registerGetProjectStatus } from "./tools/get-project-status.js";

export function createArchLensServer(): McpServer {
  const server = new McpServer({
    name: "archlens",
    version: "0.1.0",
  });

  const ctx = createContext();

  registerInitProject(server, ctx);
  registerGetProjectStatus(server, ctx);

  return server;
}
