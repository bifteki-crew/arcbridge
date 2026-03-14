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
import { ArcBridgeConfigSchema } from "../schemas/config.js";
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
  tempDir = mkdtempSync(join(tmpdir(), "arcbridge-test-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("generateConfig", () => {
  it("creates config.yaml with valid content", () => {
    const config = generateConfig(tempDir, TEST_INPUT);
    const filePath = join(tempDir, ".arcbridge", "config.yaml");

    expect(existsSync(filePath)).toBe(true);

    const raw = readFileSync(filePath, "utf-8");
    const parsed = parse(raw);
    const validated = ArcBridgeConfigSchema.parse(parsed);

    expect(validated.project_name).toBe("test-app");
    expect(validated.project_type).toBe("nextjs-app-router");
    expect(config.project_name).toBe("test-app");
  });
});

describe("generateArc42", () => {
  it("creates all arc42 files", () => {
    generateArc42(tempDir, TEST_INPUT);
    const arc42Dir = join(tempDir, ".arcbridge", "arc42");

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
      join(tempDir, ".arcbridge", "arc42", "05-building-blocks.md"),
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
      join(tempDir, ".arcbridge", "arc42", "10-quality-scenarios.yaml"),
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
    const planDir = join(tempDir, ".arcbridge", "plan");

    expect(existsSync(join(planDir, "phases.yaml"))).toBe(true);
    expect(existsSync(join(planDir, "sync-log.md"))).toBe(true);

    const raw = readFileSync(join(planDir, "phases.yaml"), "utf-8");
    const parsed = parse(raw);
    const validated = PhasesFileSchema.parse(parsed);

    expect(validated.phases.length).toBeGreaterThan(0);
  });

  it("creates task files for phases with tasks", () => {
    generatePlan(tempDir, TEST_INPUT);
    const tasksDir = join(tempDir, ".arcbridge", "plan", "tasks");

    expect(existsSync(join(tasksDir, "phase-0-setup.yaml"))).toBe(true);
    expect(existsSync(join(tasksDir, "phase-1-foundation.yaml"))).toBe(true);
  });
});

describe("generateAgentRoles", () => {
  it("creates all 7 agent role files", () => {
    const roles = generateAgentRoles(tempDir);
    const agentsDir = join(tempDir, ".arcbridge", "agents");

    expect(roles).toHaveLength(7);
    expect(existsSync(join(agentsDir, "architect.md"))).toBe(true);
    expect(existsSync(join(agentsDir, "implementer.md"))).toBe(true);
    expect(existsSync(join(agentsDir, "security-reviewer.md"))).toBe(true);
    expect(existsSync(join(agentsDir, "quality-guardian.md"))).toBe(true);
    expect(existsSync(join(agentsDir, "phase-manager.md"))).toBe(true);
    expect(existsSync(join(agentsDir, "onboarding.md"))).toBe(true);
    expect(existsSync(join(agentsDir, "code-reviewer.md"))).toBe(true);
  });

  it("produces parseable frontmatter", () => {
    generateAgentRoles(tempDir);
    const raw = readFileSync(
      join(tempDir, ".arcbridge", "agents", "architect.md"),
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

    const { db, warnings } = generateDatabase(tempDir, TEST_INPUT);

    expect(warnings).toHaveLength(0);

    // Check metadata
    const projectName = db
      .prepare("SELECT value FROM arcbridge_meta WHERE key = 'project_name'")
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

  it("is idempotent — running twice does not crash", () => {
    generateConfig(tempDir, TEST_INPUT);
    generateArc42(tempDir, TEST_INPUT);
    generatePlan(tempDir, TEST_INPUT);
    generateAgentRoles(tempDir);

    const { db: db1, warnings: w1 } = generateDatabase(tempDir, TEST_INPUT);
    const count1 = (
      db1.prepare("SELECT COUNT(*) as count FROM building_blocks").get() as { count: number }
    ).count;
    db1.close();

    // Run again — should not throw, counts should stay the same
    const { db: db2, warnings: w2 } = generateDatabase(tempDir, TEST_INPUT);
    const count2 = (
      db2.prepare("SELECT COUNT(*) as count FROM building_blocks").get() as { count: number }
    ).count;

    expect(w1).toHaveLength(0);
    expect(w2).toHaveLength(0);
    expect(count2).toBe(count1);
    db2.close();
  });

  it("returns warnings for missing files", () => {
    // Don't generate arc42 files — only config
    generateConfig(tempDir, TEST_INPUT);

    const { db, warnings } = generateDatabase(tempDir, TEST_INPUT);

    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.includes("not found"))).toBe(true);
    db.close();
  });
});

describe("dotnet-webapi template", () => {
  const DOTNET_INPUT: InitProjectInput = {
    name: "my-api",
    template: "dotnet-webapi",
    features: ["auth", "database"],
    quality_priorities: ["security", "performance", "reliability"],
    platforms: ["claude"],
  };

  it("generates valid config with dotnet service type", () => {
    const config = generateConfig(tempDir, DOTNET_INPUT);

    expect(config.project_type).toBe("dotnet-webapi");
    expect(config.services[0]!.type).toBe("dotnet");
    expect(config.testing.test_command).toBe("dotnet test");
    expect(config.indexing.include).toContain("**/*.cs");
    expect(config.indexing.exclude).toContain("bin");
  });

  it("generates dotnet-specific building blocks", () => {
    generateArc42(tempDir, DOTNET_INPUT);
    const raw = readFileSync(
      join(tempDir, ".arcbridge", "arc42", "05-building-blocks.md"),
      "utf-8",
    );
    const { data } = matter(raw);
    const validated = BuildingBlocksFrontmatterSchema.parse(data);

    const ids = validated.blocks.map((b) => b.id);
    expect(ids).toContain("api-host");
    expect(ids).toContain("controllers");
    expect(ids).toContain("domain");
    expect(ids).toContain("services");
    expect(ids).toContain("middleware");
    expect(ids).toContain("auth-module");
    expect(ids).toContain("data-access");
    // Should NOT contain JS-specific blocks
    expect(ids).not.toContain("app-shell");
    expect(ids).not.toContain("ui-components");
  });

  it("generates ASP.NET Core ADR", () => {
    generateArc42(tempDir, DOTNET_INPUT);
    expect(
      existsSync(join(tempDir, ".arcbridge", "arc42", "09-decisions", "001-aspnet-core-webapi.md")),
    ).toBe(true);
    expect(
      existsSync(join(tempDir, ".arcbridge", "arc42", "09-decisions", "001-nextjs-app-router.md")),
    ).toBe(false);
  });

  it("generates dotnet phase plan with correct tasks", () => {
    generatePlan(tempDir, DOTNET_INPUT);
    const planDir = join(tempDir, ".arcbridge", "plan");

    const raw = readFileSync(join(planDir, "phases.yaml"), "utf-8");
    const parsed = parse(raw);
    const validated = PhasesFileSchema.parse(parsed);

    expect(validated.phases).toHaveLength(4);
    expect(validated.phases[0]!.description).toContain("ASP.NET Core");

    // Task files exist
    expect(existsSync(join(planDir, "tasks", "phase-0-setup.yaml"))).toBe(true);
    expect(existsSync(join(planDir, "tasks", "phase-1-foundation.yaml"))).toBe(true);
  });

  it("full dotnet project generation with database", () => {
    generateConfig(tempDir, DOTNET_INPUT);
    generateArc42(tempDir, DOTNET_INPUT);
    generatePlan(tempDir, DOTNET_INPUT);
    generateAgentRoles(tempDir);

    const { db, warnings } = generateDatabase(tempDir, DOTNET_INPUT);

    expect(warnings).toHaveLength(0);

    const blocks = db
      .prepare("SELECT COUNT(*) as count FROM building_blocks")
      .get() as { count: number };
    expect(blocks.count).toBeGreaterThan(0);

    const phases = db
      .prepare("SELECT COUNT(*) as count FROM phases")
      .get() as { count: number };
    expect(phases.count).toBe(4);

    const tasks = db
      .prepare("SELECT COUNT(*) as count FROM tasks")
      .get() as { count: number };
    expect(tasks.count).toBeGreaterThan(0);

    const adrs = db
      .prepare("SELECT id FROM adrs")
      .all() as { id: string }[];
    expect(adrs[0]!.id).toBe("001-aspnet-core-webapi");

    db.close();
  });
});
