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
import { registerReindex } from "./tools/reindex.js";
import { registerSearchSymbols } from "./tools/search-symbols.js";
import { registerGetSymbol } from "./tools/get-symbol.js";
import { registerGetDependencyGraph } from "./tools/get-dependency-graph.js";
import { registerGetComponentGraph } from "./tools/get-component-graph.js";
import { registerGetRouteMap } from "./tools/get-route-map.js";
import { registerGetBoundaryAnalysis } from "./tools/get-boundary-analysis.js";
import { registerCheckDrift } from "./tools/check-drift.js";
import { registerGetGuidance } from "./tools/get-guidance.js";
import { registerGetOpenQuestions } from "./tools/get-open-questions.js";
import { registerProposeArc42Update } from "./tools/propose-arc42-update.js";
import { registerGetPracticeReview } from "./tools/get-practice-review.js";
import { registerCompletePhase } from "./tools/complete-phase.js";
import { registerActivateRole } from "./tools/activate-role.js";
import { registerVerifyScenarios } from "./tools/verify-scenarios.js";
import { registerRunRoleCheck } from "./tools/run-role-check.js";

export function createArcBridgeServer(): McpServer {
  const server = new McpServer({
    name: "arcbridge",
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

  // Code Intelligence
  registerReindex(server, ctx);
  registerSearchSymbols(server, ctx);
  registerGetSymbol(server, ctx);
  registerGetDependencyGraph(server, ctx);

  // React & Next.js Analysis
  registerGetComponentGraph(server, ctx);
  registerGetRouteMap(server, ctx);
  registerGetBoundaryAnalysis(server, ctx);

  // Architecture Bridge
  registerCheckDrift(server, ctx);
  registerGetGuidance(server, ctx);
  registerGetOpenQuestions(server, ctx);
  registerProposeArc42Update(server, ctx);
  registerGetPracticeReview(server, ctx);
  registerCompletePhase(server, ctx);
  registerActivateRole(server, ctx);
  registerVerifyScenarios(server, ctx);
  registerRunRoleCheck(server, ctx);

  return server;
}
