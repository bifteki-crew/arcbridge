import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  generateConfig,
  generateArc42,
  generatePlan,
  generateAgentRoles,
  generateDatabase,
  refreshFromDocs,
  type InitProjectInput,
} from "@arcbridge/core";
import type { Database } from "@arcbridge/core";

const TEST_INPUT: InitProjectInput = {
  name: "test-app",
  template: "nextjs-app-router",
  features: [],
  quality_priorities: ["security", "performance"],
  platforms: ["claude"],
};

let tempDir: string;
let db: Database;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "arcbridge-arc42-test-"));
  mkdirSync(join(tempDir, "src"), { recursive: true });
  generateConfig(tempDir, TEST_INPUT);
  generateArc42(tempDir, TEST_INPUT);
  generatePlan(tempDir, TEST_INPUT);
  generateAgentRoles(tempDir);
  ({ db } = generateDatabase(tempDir, TEST_INPUT));
});

afterEach(() => {
  db.close();
  rmSync(tempDir, { recursive: true, force: true });
});

/** Parse frontmatter from a markdown file without external deps */
function parseFrontmatter(raw: string): { data: Record<string, unknown>; content: string } {
  if (!raw.startsWith("---")) return { data: {}, content: raw };
  const endIndex = raw.indexOf("\n---", 3);
  if (endIndex < 0) return { data: {}, content: raw };
  const yamlBlock = raw.slice(4, endIndex);
  const content = raw.slice(endIndex + 4).replace(/^\n/, "");
  // Simple key: value parser for flat frontmatter
  const data: Record<string, unknown> = {};
  for (const line of yamlBlock.split("\n")) {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (match) {
      const val = match[2]!.trim();
      data[match[1]!] = val === "true" ? true : val === "false" ? false : /^\d+$/.test(val) ? Number(val) : val;
    }
  }
  return { data, content };
}

describe("arc42 section files", () => {
  it("generates all expected sections including 02 and 04", () => {
    const arc42Dir = join(tempDir, ".arcbridge", "arc42");
    const sections = [
      "01-introduction.md",
      "02-constraints.md",
      "03-context.md",
      "04-solution-strategy.md",
      "05-building-blocks.md",
      "06-runtime-views.md",
      "07-deployment.md",
      "08-crosscutting.md",
      "11-risks-debt.md",
    ];

    for (const file of sections) {
      const filePath = join(arc42Dir, file);
      const raw = readFileSync(filePath, "utf-8");
      expect(raw.length).toBeGreaterThan(0);

      const { data } = parseFrontmatter(raw);
      expect(data.section).toBeDefined();
      expect(data.schema_version).toBe(1);
    }
  });

  it("02-constraints has correct frontmatter", () => {
    const raw = readFileSync(join(tempDir, ".arcbridge", "arc42", "02-constraints.md"), "utf-8");
    const { data, content } = parseFrontmatter(raw);
    expect(data.section).toBe("constraints");
    expect(content).toContain("Architecture Constraints");
    expect(content).toContain("Technical Constraints");
    expect(content).toContain("Organizational Constraints");
  });

  it("04-solution-strategy has correct frontmatter and quality goals", () => {
    const raw = readFileSync(join(tempDir, ".arcbridge", "arc42", "04-solution-strategy.md"), "utf-8");
    const { data, content } = parseFrontmatter(raw);
    expect(data.section).toBe("solution-strategy");
    expect(content).toContain("Solution Strategy");
    expect(content).toContain("security");
    expect(content).toContain("performance");
  });
});

describe("arc42 section update (file-level)", () => {
  it("preserves frontmatter when body is replaced", () => {
    const filePath = join(tempDir, ".arcbridge", "arc42", "06-runtime-views.md");
    const original = readFileSync(filePath, "utf-8");
    const { data: originalFm } = parseFrontmatter(original);

    // Simulate what update_arc42_section does: split, replace body, write
    const fmEnd = original.indexOf("\n---", 3) + 4;
    const frontmatterBlock = original.slice(0, fmEnd);
    const newBody = "# Runtime View\n\n## Auth Flow\n\nUser → Login → JWT → Dashboard\n";
    writeFileSync(filePath, `${frontmatterBlock}\n${newBody}\n`, "utf-8");

    // Verify frontmatter survived
    const updated = readFileSync(filePath, "utf-8");
    const { data: updatedFm, content } = parseFrontmatter(updated);
    expect(updatedFm.section).toBe(originalFm.section);
    expect(updatedFm.schema_version).toBe(originalFm.schema_version);
    expect(content).toContain("Auth Flow");
    expect(content).not.toContain("Key Runtime Scenarios"); // original body gone
  });

  it("refreshFromDocs succeeds after section update", () => {
    const filePath = join(tempDir, ".arcbridge", "arc42", "11-risks-debt.md");
    const original = readFileSync(filePath, "utf-8");
    const fmEnd = original.indexOf("\n---", 3) + 4;
    const frontmatterBlock = original.slice(0, fmEnd);

    writeFileSync(filePath, `${frontmatterBlock}\n# Updated Risks\n\nNew risk content.\n`, "utf-8");

    // Should not throw
    expect(() => refreshFromDocs(db, tempDir)).not.toThrow();
  });

  it("missing frontmatter does not crash refreshFromDocs", () => {
    const filePath = join(tempDir, ".arcbridge", "arc42", "06-runtime-views.md");
    writeFileSync(filePath, "no frontmatter just markdown", "utf-8");

    expect(() => refreshFromDocs(db, tempDir)).not.toThrow();
  });

  it("unterminated frontmatter does not crash refreshFromDocs", () => {
    const filePath = join(tempDir, ".arcbridge", "arc42", "06-runtime-views.md");
    writeFileSync(filePath, "---\nsection: runtime-views\nschema_version: 1\n# no closing delimiter", "utf-8");

    expect(() => refreshFromDocs(db, tempDir)).not.toThrow();
  });
});
