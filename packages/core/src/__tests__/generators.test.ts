import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parse } from "yaml";
import matter from "gray-matter";
import type { InitProjectInput } from "../templates/types.js";
import { generateConfig } from "../generators/config-generator.js";
import { generateArc42 } from "../generators/arc42-generator.js";
import { generatePlan } from "../generators/plan-generator.js";
import { generateAgentRoles } from "../generators/agent-generator.js";
import { generateDatabase } from "../generators/db-generator.js";
import { ArchLensConfigSchema } from "../schemas/config.js";
import { QualityScenariosFileSchema } from "../schemas/quality-scenarios.js";
import { BuildingBlocksFrontmatterSchema } from "../schemas/building-blocks.js";
import { PhasesFileSchema } from "../schemas/phases.js";

const TEST_INPUT: InitProjectInput = {
  name: "test-app",
  template: "nextjs-app-router",
  features: ["auth", "api"],
  quality_priorities: ["security", "performance", "accessibility"],
  platforms: ["claude"],
};

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "archlens-test-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("generateConfig", () => {
  it("creates config.yaml with valid content", () => {
    const config = generateConfig(tempDir, TEST_INPUT);
    const filePath = join(tempDir, ".archlens", "config.yaml");

    expect(existsSync(filePath)).toBe(true);

    const raw = readFileSync(filePath, "utf-8");
    const parsed = parse(raw);
    const validated = ArchLensConfigSchema.parse(parsed);

    expect(validated.project_name).toBe("test-app");
    expect(validated.project_type).toBe("nextjs-app-router");
    expect(config.project_name).toBe("test-app");
  });
});

describe("generateArc42", () => {
  it("creates all arc42 files", () => {
    generateArc42(tempDir, TEST_INPUT);
    const arc42Dir = join(tempDir, ".archlens", "arc42");

    expect(existsSync(join(arc42Dir, "01-introduction.md"))).toBe(true);
    expect(existsSync(join(arc42Dir, "03-context.md"))).toBe(true);
    expect(existsSync(join(arc42Dir, "05-building-blocks.md"))).toBe(true);
    expect(existsSync(join(arc42Dir, "06-runtime-views.md"))).toBe(true);
    expect(existsSync(join(arc42Dir, "07-deployment.md"))).toBe(true);
    expect(existsSync(join(arc42Dir, "10-quality-scenarios.yaml"))).toBe(true);
    expect(existsSync(join(arc42Dir, "11-risks-debt.md"))).toBe(true);
    expect(
      existsSync(join(arc42Dir, "09-decisions", "001-nextjs-app-router.md")),
    ).toBe(true);
  });

  it("produces valid building blocks frontmatter", () => {
    generateArc42(tempDir, TEST_INPUT);
    const raw = readFileSync(
      join(tempDir, ".archlens", "arc42", "05-building-blocks.md"),
      "utf-8",
    );
    const { data } = matter(raw);
    const validated = BuildingBlocksFrontmatterSchema.parse(data);

    expect(validated.blocks.length).toBeGreaterThan(0);
    // Should include auth and api blocks since those features are enabled
    const ids = validated.blocks.map((b) => b.id);
    expect(ids).toContain("auth-module");
    expect(ids).toContain("api-layer");
  });

  it("produces valid quality scenarios", () => {
    generateArc42(tempDir, TEST_INPUT);
    const raw = readFileSync(
      join(tempDir, ".archlens", "arc42", "10-quality-scenarios.yaml"),
      "utf-8",
    );
    const parsed = parse(raw);
    const validated = QualityScenariosFileSchema.parse(parsed);

    expect(validated.scenarios.length).toBeGreaterThan(0);
    expect(validated.quality_goals.length).toBe(3);
  });
});

describe("generatePlan", () => {
  it("creates phases.yaml and task files", () => {
    generatePlan(tempDir, TEST_INPUT);
    const planDir = join(tempDir, ".archlens", "plan");

    expect(existsSync(join(planDir, "phases.yaml"))).toBe(true);
    expect(existsSync(join(planDir, "sync-log.md"))).toBe(true);

    const raw = readFileSync(join(planDir, "phases.yaml"), "utf-8");
    const parsed = parse(raw);
    const validated = PhasesFileSchema.parse(parsed);

    expect(validated.phases.length).toBeGreaterThan(0);
  });

  it("creates task files for phases with tasks", () => {
    generatePlan(tempDir, TEST_INPUT);
    const tasksDir = join(tempDir, ".archlens", "plan", "tasks");

    expect(existsSync(join(tasksDir, "phase-0-setup.yaml"))).toBe(true);
    expect(existsSync(join(tasksDir, "phase-1-foundation.yaml"))).toBe(true);
  });
});

describe("generateAgentRoles", () => {
  it("creates all 6 agent role files", () => {
    const roles = generateAgentRoles(tempDir);
    const agentsDir = join(tempDir, ".archlens", "agents");

    expect(roles).toHaveLength(6);
    expect(existsSync(join(agentsDir, "architect.md"))).toBe(true);
    expect(existsSync(join(agentsDir, "implementer.md"))).toBe(true);
    expect(existsSync(join(agentsDir, "security-reviewer.md"))).toBe(true);
    expect(existsSync(join(agentsDir, "quality-guardian.md"))).toBe(true);
    expect(existsSync(join(agentsDir, "phase-manager.md"))).toBe(true);
    expect(existsSync(join(agentsDir, "onboarding.md"))).toBe(true);
  });

  it("produces parseable frontmatter", () => {
    generateAgentRoles(tempDir);
    const raw = readFileSync(
      join(tempDir, ".archlens", "agents", "architect.md"),
      "utf-8",
    );
    const { data, content } = matter(raw);

    expect(data.role_id).toBe("architect");
    expect(data.name).toBe("Architect");
    expect(content.trim().length).toBeGreaterThan(0);
  });
});

describe("generateDatabase", () => {
  it("creates populated database from generated files", () => {
    // Must generate files first
    generateConfig(tempDir, TEST_INPUT);
    generateArc42(tempDir, TEST_INPUT);
    generatePlan(tempDir, TEST_INPUT);
    generateAgentRoles(tempDir);

    const db = generateDatabase(tempDir, TEST_INPUT);

    // Check metadata
    const projectName = db
      .prepare("SELECT value FROM archlens_meta WHERE key = 'project_name'")
      .get() as { value: string };
    expect(projectName.value).toBe("test-app");

    // Check building blocks
    const blocks = db
      .prepare("SELECT COUNT(*) as count FROM building_blocks")
      .get() as { count: number };
    expect(blocks.count).toBeGreaterThan(0);

    // Check quality scenarios
    const scenarios = db
      .prepare("SELECT COUNT(*) as count FROM quality_scenarios")
      .get() as { count: number };
    expect(scenarios.count).toBeGreaterThan(0);

    // Check phases
    const phases = db
      .prepare("SELECT COUNT(*) as count FROM phases")
      .get() as { count: number };
    expect(phases.count).toBeGreaterThan(0);

    // Check tasks
    const tasks = db
      .prepare("SELECT COUNT(*) as count FROM tasks")
      .get() as { count: number };
    expect(tasks.count).toBeGreaterThan(0);

    // Check ADRs
    const adrs = db
      .prepare("SELECT COUNT(*) as count FROM adrs")
      .get() as { count: number };
    expect(adrs.count).toBeGreaterThan(0);

    db.close();
  });
});
