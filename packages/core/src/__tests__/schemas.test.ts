import { describe, it, expect } from "vitest";
import { ArchLensConfigSchema } from "../schemas/config.js";
import { QualityScenarioSchema, QualityScenariosFileSchema } from "../schemas/quality-scenarios.js";
import { BuildingBlockSchema } from "../schemas/building-blocks.js";
import { PhaseSchema, TaskSchema } from "../schemas/phases.js";
import { AdrFrontmatterSchema } from "../schemas/adrs.js";
import { AgentRoleSchema } from "../schemas/agent-roles.js";

describe("ArchLensConfigSchema", () => {
  it("parses valid config", () => {
    const result = ArchLensConfigSchema.parse({
      project_name: "my-app",
      project_type: "nextjs-app-router",
    });
    expect(result.project_name).toBe("my-app");
    expect(result.schema_version).toBe(1);
    expect(result.platforms).toEqual(["claude"]);
    expect(result.indexing.default_mode).toBe("fast");
  });

  it("rejects missing project_name", () => {
    expect(() =>
      ArchLensConfigSchema.parse({ project_type: "nextjs-app-router" }),
    ).toThrow();
  });

  it("rejects invalid project_type", () => {
    expect(() =>
      ArchLensConfigSchema.parse({
        project_name: "test",
        project_type: "invalid",
      }),
    ).toThrow();
  });
});

describe("QualityScenarioSchema", () => {
  it("parses valid scenario", () => {
    const result = QualityScenarioSchema.parse({
      id: "SEC-01",
      name: "Auth on API routes",
      category: "security",
      priority: "must",
      scenario: "Unauthenticated request hits API",
      expected: "Returns 401",
      verification: "automatic",
    });
    expect(result.status).toBe("untested");
    expect(result.linked_code).toEqual([]);
  });

  it("rejects invalid id pattern", () => {
    expect(() =>
      QualityScenarioSchema.parse({
        id: "bad-id",
        name: "Test",
        category: "security",
        priority: "must",
        scenario: "test",
        expected: "test",
        verification: "automatic",
      }),
    ).toThrow();
  });
});

describe("BuildingBlockSchema", () => {
  it("parses valid block", () => {
    const result = BuildingBlockSchema.parse({
      id: "auth-module",
      name: "Auth Module",
      level: 1,
      responsibility: "Handles authentication",
    });
    expect(result.service).toBe("main");
    expect(result.code_paths).toEqual([]);
  });

  it("rejects non-kebab-case id", () => {
    expect(() =>
      BuildingBlockSchema.parse({
        id: "AuthModule",
        name: "Test",
        level: 1,
        responsibility: "test",
      }),
    ).toThrow();
  });
});

describe("PhaseSchema", () => {
  it("parses valid phase", () => {
    const result = PhaseSchema.parse({
      id: "phase-1",
      name: "Foundation",
      phase_number: 1,
      description: "Build foundation",
    });
    expect(result.status).toBe("planned");
  });
});

describe("TaskSchema", () => {
  it("parses valid task", () => {
    const result = TaskSchema.parse({
      id: "task-1.1",
      title: "Setup project",
    });
    expect(result.status).toBe("todo");
    expect(result.quality_scenarios).toEqual([]);
  });
});

describe("AdrFrontmatterSchema", () => {
  it("parses valid ADR", () => {
    const result = AdrFrontmatterSchema.parse({
      id: "001-use-nextjs",
      title: "Use Next.js",
      date: "2024-01-01",
    });
    expect(result.status).toBe("proposed");
  });

  it("rejects invalid id pattern", () => {
    expect(() =>
      AdrFrontmatterSchema.parse({
        id: "bad",
        title: "Test",
        date: "2024-01-01",
      }),
    ).toThrow();
  });
});

describe("AgentRoleSchema", () => {
  it("parses valid role", () => {
    const result = AgentRoleSchema.parse({
      role_id: "architect",
      name: "Architect",
      description: "System architect",
      system_prompt: "You are the architect.",
    });
    expect(result.version).toBe(1);
    expect(result.read_only).toBe(false);
    expect(result.model_preferences.reasoning_depth).toBe("medium");
  });
});
