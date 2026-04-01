import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AgentRole, ArcBridgeConfig } from "@arcbridge/core";
import { CodexAdapter } from "../codex/codex-adapter.js";

const TEST_CONFIG: ArcBridgeConfig = {
  schema_version: 1,
  project_name: "test-app",
  project_type: "nextjs-app-router",
  services: [],
  platforms: ["codex"],
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
];

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "arcbridge-codex-test-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("CodexAdapter", () => {
  const adapter = new CodexAdapter();

  describe("generateProjectConfig", () => {
    it("creates AGENTS.md with project info", () => {
      adapter.generateProjectConfig(tempDir, TEST_CONFIG);

      const agentsMd = readFileSync(join(tempDir, "AGENTS.md"), "utf-8");
      expect(agentsMd).toContain("test-app");
      expect(agentsMd).toContain("nextjs-app-router");
      expect(agentsMd).toContain("security, performance");
      expect(agentsMd).toContain("arcbridge-generated");
    });

    it("includes MCP setup instructions", () => {
      adapter.generateProjectConfig(tempDir, TEST_CONFIG);

      const agentsMd = readFileSync(join(tempDir, "AGENTS.md"), "utf-8");
      expect(agentsMd).toContain("~/.codex/config.toml");
      expect(agentsMd).toContain("[mcp_servers.arcbridge]");
    });

    it("includes Plan → Build → Sync → Review workflow", () => {
      adapter.generateProjectConfig(tempDir, TEST_CONFIG);

      const agentsMd = readFileSync(join(tempDir, "AGENTS.md"), "utf-8");
      expect(agentsMd).toContain("Plan → Build → Sync → Review");
      expect(agentsMd).toContain("arcbridge_get_project_status");
      expect(agentsMd).toContain("arcbridge_activate_role");
    });

    it("includes React section for frontend templates", () => {
      adapter.generateProjectConfig(tempDir, TEST_CONFIG);

      const agentsMd = readFileSync(join(tempDir, "AGENTS.md"), "utf-8");
      expect(agentsMd).toContain("arcbridge_get_component_graph");
      expect(agentsMd).toContain("arcbridge_get_route_map");
    });

    it("excludes React section for non-frontend templates", () => {
      const apiConfig = { ...TEST_CONFIG, project_type: "api-service" as const };
      adapter.generateProjectConfig(tempDir, apiConfig);

      const agentsMd = readFileSync(join(tempDir, "AGENTS.md"), "utf-8");
      expect(agentsMd).not.toContain("arcbridge_get_component_graph");
    });

    it("preserves existing user content with marker-based merge", () => {
      const userContent = "# My Custom Instructions\n\nDo things my way.\n";
      writeFileSync(join(tempDir, "AGENTS.md"), userContent, "utf-8");

      adapter.generateProjectConfig(tempDir, TEST_CONFIG);

      const result = readFileSync(join(tempDir, "AGENTS.md"), "utf-8");
      expect(result).toContain("My Custom Instructions");
      expect(result).toContain("test-app");
      expect(result).toContain("arcbridge-generated");
    });

    it("replaces ArcBridge section on re-run without duplicating marker", () => {
      adapter.generateProjectConfig(tempDir, TEST_CONFIG);
      adapter.generateProjectConfig(tempDir, TEST_CONFIG);

      const result = readFileSync(join(tempDir, "AGENTS.md"), "utf-8");
      const markerCount = (result.match(/arcbridge-generated/g) || []).length;
      expect(markerCount).toBe(1);
    });
  });

  describe("generateAgentConfigs", () => {
    it("creates sync skill", () => {
      adapter.generateAgentConfigs(tempDir, TEST_ROLES);

      const skillPath = join(tempDir, ".agents", "skills", "arcbridge-sync", "SKILL.md");
      expect(existsSync(skillPath)).toBe(true);

      const content = readFileSync(skillPath, "utf-8");
      expect(content).toContain("name: arcbridge-sync");
      expect(content).toContain("arcbridge_reindex");
      expect(content).toContain("arcbridge_check_drift");
    });

    it("creates review skill", () => {
      adapter.generateAgentConfigs(tempDir, TEST_ROLES);

      const skillPath = join(tempDir, ".agents", "skills", "arcbridge-review", "SKILL.md");
      expect(existsSync(skillPath)).toBe(true);

      const content = readFileSync(skillPath, "utf-8");
      expect(content).toContain("name: arcbridge-review");
      expect(content).toContain("arcbridge_verify_scenarios");
      expect(content).toContain("arcbridge_complete_phase");
    });

    it("skills have valid YAML frontmatter", () => {
      adapter.generateAgentConfigs(tempDir, TEST_ROLES);

      const syncSkill = readFileSync(
        join(tempDir, ".agents", "skills", "arcbridge-sync", "SKILL.md"),
        "utf-8",
      );
      // Check YAML frontmatter structure
      expect(syncSkill.startsWith("---\n")).toBe(true);
      expect(syncSkill).toMatch(/^---\nname: arcbridge-sync\ndescription: /);
    });
  });
});
