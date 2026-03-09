import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createContext } from "./context.js";
import { registerInitProject } from "./tools/init-project.js";
import { registerGetProjectStatus } from "./tools/get-project-status.js";
import { registerGetBuildingBlocks } from "./tools/get-building-blocks.js";
import { registerGetBuildingBlock } from "./tools/get-building-block.js";
import { registerGetQualityScenarios } from "./tools/get-quality-scenarios.js";
import { registerGetPhasePlan } from "./tools/get-phase-plan.js";
import { registerGetCurrentTasks } from "./tools/get-current-tasks.js";
import { registerUpdateTask } from "./tools/update-task.js";
import { registerCreateTask } from "./tools/create-task.js";
import { registerGetRelevantAdrs } from "./tools/get-relevant-adrs.js";

export function createArchLensServer(): McpServer {
  const server = new McpServer({
    name: "archlens",
    version: "0.1.0",
  });

  const ctx = createContext();

  // Lifecycle
  registerInitProject(server, ctx);
  registerGetProjectStatus(server, ctx);

  // Architecture
  registerGetBuildingBlocks(server, ctx);
  registerGetBuildingBlock(server, ctx);
  registerGetQualityScenarios(server, ctx);
  registerGetRelevantAdrs(server, ctx);

  // Planning
  registerGetPhasePlan(server, ctx);
  registerGetCurrentTasks(server, ctx);
  registerUpdateTask(server, ctx);
  registerCreateTask(server, ctx);

  return server;
}
