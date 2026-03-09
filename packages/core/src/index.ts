// Schemas
export {
  ArchLensConfigSchema,
  type ArchLensConfig,
  type Service,
} from "./schemas/config.js";
export {
  QualityScenarioSchema,
  QualityScenariosFileSchema,
  QualityCategorySchema,
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
export { openDatabase, openMemoryDatabase } from "./db/connection.js";
export { initializeSchema, CURRENT_SCHEMA_VERSION } from "./db/schema.js";
export { migrate } from "./db/migrations.js";

// Generators
export { generateConfig } from "./generators/config-generator.js";
export { generateArc42 } from "./generators/arc42-generator.js";
export { generatePlan } from "./generators/plan-generator.js";
export { generateAgentRoles } from "./generators/agent-generator.js";
export { generateDatabase } from "./generators/db-generator.js";

// Template types
export type { InitProjectInput } from "./templates/types.js";
