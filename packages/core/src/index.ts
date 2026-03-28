// Schemas
export {
  ArcBridgeConfigSchema,
  type ArcBridgeConfig,
  type Service,
} from "./schemas/config.js";
export {
  QualityScenarioSchema,
  QualityScenarioStatusSchema,
  QualityScenariosFileSchema,
  QualityCategorySchema,
  QualityPrioritySchema,
  type QualityScenario,
  type QualityScenariosFile,
} from "./schemas/quality-scenarios.js";
export {
  BuildingBlockSchema,
  BuildingBlocksFrontmatterSchema,
  type BuildingBlock,
  type BuildingBlocksFrontmatter,
} from "./schemas/building-blocks.js";
export {
  PhaseSchema,
  TaskSchema,
  PhasesFileSchema,
  TaskFileSchema,
  type Phase,
  type Task,
  type PhasesFile,
  type TaskFile,
} from "./schemas/phases.js";
export {
  AdrFrontmatterSchema,
  type AdrFrontmatter,
} from "./schemas/adrs.js";
export {
  AgentRoleSchema,
  type AgentRole,
} from "./schemas/agent-roles.js";

// Database
export { openDatabase, openMemoryDatabase, transaction, suppressSqliteWarning, type Database } from "./db/connection.js";
export { initializeSchema, CURRENT_SCHEMA_VERSION } from "./db/schema.js";
export { migrate } from "./db/migrations.js";

// Generators
export { generateConfig } from "./generators/config-generator.js";
export { generateArc42 } from "./generators/arc42-generator.js";
export { generatePlan } from "./generators/plan-generator.js";
export { generateAgentRoles } from "./generators/agent-generator.js";
export {
  generateDatabase,
  refreshFromDocs,
  type GenerateDatabaseResult,
} from "./generators/db-generator.js";

// Indexer
export {
  indexProject,
  detectProjectLanguage,
  discoverDotnetServices,
  indexPackageDependencies,
  type ProjectLanguage,
  type DotnetProjectInfo,
  type IndexerOptions,
  type IndexResult,
  type ExtractedSymbol,
  type SymbolKind,
} from "./indexer/index.js";

// Drift detection
export {
  detectDrift,
  writeDriftLog,
  type DriftEntry,
  type DriftKind,
  type DriftSeverity,
  type DriftOptions,
} from "./drift/detector.js";

// Sync
export {
  inferTaskStatuses,
  applyInferences,
  type TaskInferenceResult,
} from "./sync/task-inference.js";
export {
  syncTaskToYaml,
  addTaskToYaml,
  deleteTaskFromYaml,
  syncPhaseToYaml,
  syncScenarioToYaml,
} from "./sync/yaml-writer.js";
export { generateSyncFiles } from "./generators/sync-generator.js";

// Metrics
export {
  insertActivity,
  getSessionTotals,
  queryMetrics,
  exportMetrics,
} from "./metrics/activity.js";
export type {
  InsertActivityParams,
  QueryMetricsParams,
  MetricsResult,
  SessionTotals,
  LatestQualitySnapshot,
  ActivityRow,
  AggregatedRow,
  ExportFormat,
} from "./metrics/types.js";

// Git helpers
export {
  resolveRef,
  getChangedFiles,
  getUncommittedChanges,
  scopeToProject,
  getHeadSha,
  setSyncCommit,
  type ChangedFile,
  type GitRef,
} from "./git/helpers.js";

// Testing
export {
  verifyScenarios,
  type ScenarioTestResult,
  type TestOutcome,
  type VerifyResult,
} from "./testing/runner.js";

// Role loader
export {
  loadRoles,
  loadRole,
  type LoadRolesResult,
} from "./roles/loader.js";

// Config loader
export { loadConfig } from "./config/loader.js";

// Template types
export type { InitProjectInput } from "./templates/types.js";
