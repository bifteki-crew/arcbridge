import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");
import { createContext, type ServerContext } from "./context.js";
import { registerInitProject } from "./tools/init-project.js";
import { registerGetProjectStatus } from "./tools/get-project-status.js";
import { registerGetBuildingBlocks } from "./tools/get-building-blocks.js";
import { registerQualityScenarios } from "./tools/quality-scenarios.js";
import { registerGetPhasePlan } from "./tools/get-phase-plan.js";
import { registerManageTasks } from "./tools/manage-tasks.js";
import { registerManagePhases } from "./tools/manage-phases.js";
import { registerGetRelevantAdrs } from "./tools/get-relevant-adrs.js";
import { registerReindex } from "./tools/reindex.js";
import { registerProposeBuildingBlocks } from "./tools/propose-building-blocks.js";
import { registerQuerySymbols } from "./tools/query-symbols.js";
import { registerGetDependencyGraph } from "./tools/get-dependency-graph.js";
import { registerGetComponentGraph } from "./tools/get-component-graph.js";
import { registerGetRouteMap } from "./tools/get-route-map.js";
import { registerGetBoundaryAnalysis } from "./tools/get-boundary-analysis.js";
import { registerCheckDrift } from "./tools/check-drift.js";
import { registerGetGuidance } from "./tools/get-guidance.js";
import { registerGetOpenQuestions } from "./tools/get-open-questions.js";
import { registerArc42 } from "./tools/arc42.js";
import { registerGetPracticeReview } from "./tools/get-practice-review.js";
import { registerActivateRole } from "./tools/activate-role.js";
import { registerVerifyScenarios } from "./tools/verify-scenarios.js";
import { registerRunRoleCheck } from "./tools/run-role-check.js";
import { registerRecordActivity } from "./tools/record-activity.js";
import { registerGetMetrics } from "./tools/get-metrics.js";

/**
 * Create the ArcBridge MCP server. An explicit `ctx` may be passed so callers
 * that own the lifecycle (tests) can close the cached database handle; when
 * omitted, a fresh context is created (production behavior, unchanged).
 *
 * 0.10.0 consolidated the tool surface from 35 to 25 tools — see the
 * CHANGELOG for the old → new mapping.
 */
export function createArcBridgeServer(ctx: ServerContext = createContext()): McpServer {
  const server = new McpServer({
    name: "arcbridge",
    version,
  });

  // Lifecycle
  registerInitProject(server, ctx);
  registerGetProjectStatus(server, ctx);

  // Architecture
  registerGetBuildingBlocks(server, ctx);
  registerQualityScenarios(server, ctx);
  registerGetRelevantAdrs(server, ctx);

  // Planning
  registerGetPhasePlan(server, ctx);
  registerManageTasks(server, ctx);
  registerManagePhases(server, ctx);

  // Code Intelligence
  registerReindex(server, ctx);
  registerProposeBuildingBlocks(server, ctx);
  registerQuerySymbols(server, ctx);
  registerGetDependencyGraph(server, ctx);

  // React & Next.js Analysis
  registerGetComponentGraph(server, ctx);
  registerGetRouteMap(server, ctx);
  registerGetBoundaryAnalysis(server, ctx);

  // Architecture Bridge
  registerCheckDrift(server, ctx);
  registerGetGuidance(server, ctx);
  registerGetOpenQuestions(server, ctx);
  registerArc42(server, ctx);
  registerGetPracticeReview(server, ctx);
  registerActivateRole(server, ctx);
  registerVerifyScenarios(server, ctx);
  registerRunRoleCheck(server, ctx);

  // Metrics
  registerRecordActivity(server, ctx);
  registerGetMetrics(server, ctx);

  return server;
}
