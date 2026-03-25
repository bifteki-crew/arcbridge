import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AgentRole, ArcBridgeConfig } from "@arcbridge/core";
import { ClaudeAdapter } from "../claude/claude-adapter.js";
import { CopilotAdapter } from "../copilot/copilot-adapter.js";

const TEST_CONFIG: ArcBridgeConfig = {
  schema_version: 1,
  project_name: "test-app",
  project_type: "nextjs-app-router",
  services: [],
  platforms: ["claude"],
  quality_priorities: ["security", "performance"],
  indexing: { include: ["src/**/*.ts"], exclude: ["node_modules"], default_mode: "fast", csharp_indexer: "auto" },
  testing: { test_command: "npx vitest run", timeout_ms: 60000 },
  drift: { ignore_paths: [] },
  metrics: { auto_record: false },
  sync: { auto_detect_drift: true, drift_severity_threshold: "warning", propose_updates_on: "phase-complete" },
};

const TEST_ROLES: AgentRole[] = [
  {
    role_id: "architect",
    name: "Architect",
    description: "Designs system structure",
    version: 1,
    required_tools: ["arcbridge_get_building_blocks"],
    denied_tools: [],
    read_only: false,
    quality_focus: ["maintainability"],
    model_preferences: {
      reasoning_depth: "high",
      speed_priority: "low",
      suggested_models: { claude: "claude-opus-4-6" },
    },
    platform_overrides: {},
    system_prompt: "You are the Architect agent.",
  },
  {
    role_id: "code-reviewer",
    name: "Code Reviewer",
    description: "On-demand code review",
    version: 1,
    required_tools: ["arcbridge_get_building_block"],
    denied_tools: [],
    read_only: true,
    quality_focus: ["maintainability", "reliability"],
    model_preferences: {
      reasoning_depth: "high",
      speed_priority: "low",
      suggested_models: { claude: "claude-opus-4-6" },
    },
    platform_overrides: {},
    system_prompt: "You are the Code Reviewer agent.",
  },
];

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "arcbridge-adapter-test-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("ClaudeAdapter", () => {
  const adapter = new ClaudeAdapter();

  it("generates CLAUDE.md with project info", () => {
    adapter.generateProjectConfig(tempDir, TEST_CONFIG);

    const filePath = join(tempDir, "CLAUDE.md");
    expect(existsSync(filePath)).toBe(true);

    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("test-app");
    expect(content).toContain("nextjs-app-router");
    expect(content).toContain("security, performance");
    expect(content).toContain("arcbridge_get_project_status");
  });

  it("generates agent files in .claude/agents/", () => {
    adapter.generateAgentConfigs(tempDir, TEST_ROLES);

    const agentsDir = join(tempDir, ".claude", "agents");
    expect(existsSync(join(agentsDir, "architect.md"))).toBe(true);
    expect(existsSync(join(agentsDir, "code-reviewer.md"))).toBe(true);

    const content = readFileSync(join(agentsDir, "architect.md"), "utf-8");
    expect(content).toContain("# Architect");
    expect(content).toContain("Designs system structure");
    expect(content).toContain("arcbridge_get_building_blocks");
    expect(content).toContain("You are the Architect agent.");
  });

  it("marks read-only roles", () => {
    adapter.generateAgentConfigs(tempDir, TEST_ROLES);

    const content = readFileSync(
      join(tempDir, ".claude", "agents", "code-reviewer.md"),
      "utf-8",
    );
    expect(content).toContain("read-only");
  });

  it("includes quality focus section", () => {
    adapter.generateAgentConfigs(tempDir, TEST_ROLES);

    const content = readFileSync(
      join(tempDir, ".claude", "agents", "code-reviewer.md"),
      "utf-8",
    );
    expect(content).toContain("Quality Focus");
    expect(content).toContain("maintainability");
    expect(content).toContain("reliability");
  });
});

describe("CopilotAdapter", () => {
  const adapter = new CopilotAdapter();

  it("generates copilot-instructions.md", () => {
    adapter.generateProjectConfig(tempDir, TEST_CONFIG);

    const filePath = join(tempDir, ".github", "copilot-instructions.md");
    expect(existsSync(filePath)).toBe(true);

    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("test-app");
    expect(content).toContain("nextjs-app-router");
    expect(content).toContain("security, performance");
  });

  it("generates agent files in .github/agents/", () => {
    adapter.generateAgentConfigs(tempDir, TEST_ROLES);

    const agentsDir = join(tempDir, ".github", "agents");
    expect(existsSync(join(agentsDir, "architect.md"))).toBe(true);
    expect(existsSync(join(agentsDir, "code-reviewer.md"))).toBe(true);

    const content = readFileSync(join(agentsDir, "architect.md"), "utf-8");
    expect(content).toContain("# Architect");
    expect(content).toContain("You are the Architect agent.");
  });

  it("marks read-only roles", () => {
    adapter.generateAgentConfigs(tempDir, TEST_ROLES);

    const content = readFileSync(
      join(tempDir, ".github", "agents", "code-reviewer.md"),
      "utf-8",
    );
    expect(content).toContain("Read-only");
  });
});
