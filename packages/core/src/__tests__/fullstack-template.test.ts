// The generated model must be self-consistent on the FIRST run. Both bugs below
// shipped in the fullstack template and both surfaced immediately when a real
// example repository was built from it.
import { describe, it, expect } from "vitest";
import { firstAdrTemplate } from "../templates/arc42/09-decisions.js";
import { githubActionTemplate } from "../templates/sync/github-action.js";
import { buildingBlocksTemplate } from "../templates/arc42/05-building-blocks.js";
import type { InitProjectInput } from "../templates/types.js";
import type { ArcBridgeConfig } from "../schemas/config.js";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const input = (template: InitProjectInput["template"]): InitProjectInput => ({
  name: "example",
  template,
  projectRoot: "/nonexistent-project-root",
  features: [],
  platforms: ["claude"],
  quality_priorities: ["maintainability"],
});

describe("fullstack ADR references things that exist", () => {
  it("targets the fullstack block id and path, not the single-service ones", () => {
    const adr = firstAdrTemplate(input("fullstack-nextjs-dotnet"));
    // `app-shell` belongs to nextjs-app-router; this template names it frontend-shell.
    expect(adr.frontmatter.affected_blocks).toEqual(["frontend-shell"]);
    expect(adr.frontmatter.affected_files).toEqual(["frontend/app/"]);
  });

  it("names a block the building-blocks template actually generates", () => {
    const adr = firstAdrTemplate(input("fullstack-nextjs-dotnet"));
    const blocks = buildingBlocksTemplate(input("fullstack-nextjs-dotnet"));
    const ids = new Set((blocks.frontmatter.blocks as { id: string }[]).map((b) => b.id));
    for (const referenced of adr.frontmatter.affected_blocks as string[]) {
      expect(ids.has(referenced), `ADR references unknown block "${referenced}"`).toBe(true);
    }
  });

  it("still emits the single-service ADR for nextjs-app-router", () => {
    const adr = firstAdrTemplate(input("nextjs-app-router"));
    expect(adr.frontmatter.affected_blocks).toEqual(["app-shell"]);
  });
});

describe("fullstack blocks declare a decision, not a set of options", () => {
  it("gives every block exactly one code_path", () => {
    // Alternates are permanently wrong: missing_module checks each code_path
    // independently, so the unused variant reports a finding nobody can resolve.
    const blocks = buildingBlocksTemplate(input("fullstack-nextjs-dotnet"))
      .frontmatter.blocks as { id: string; code_paths: string[] }[];
    for (const b of blocks) {
      expect(b.code_paths.length, `${b.id} declares ${b.code_paths.length} paths`).toBe(1);
    }
  });

  it("defaults to the framework convention when nothing exists yet", () => {
    const blocks = buildingBlocksTemplate(input("fullstack-nextjs-dotnet"))
      .frontmatter.blocks as { id: string; code_paths: string[] }[];
    const byId = (id: string) => blocks.find((b) => b.id === id)!.code_paths[0];
    expect(byId("frontend-shell")).toBe("frontend/app/");
    expect(byId("frontend-components")).toBe("frontend/src/components/");
  });

  it("picks the variant that actually exists on disk", () => {
    const root = mkdtempSync(join(tmpdir(), "arcbridge-layout-"));
    try {
      // A frontend using the src/app convention rather than app/.
      mkdirSync(join(root, "frontend", "src", "app"), { recursive: true });
      mkdirSync(join(root, "frontend", "src", "components"), { recursive: true });
      const blocks = buildingBlocksTemplate({
        ...input("fullstack-nextjs-dotnet"),
        projectRoot: root,
      }).frontmatter.blocks as { id: string; code_paths: string[] }[];
      expect(blocks.find((b) => b.id === "frontend-shell")!.code_paths).toEqual([
        "frontend/src/app/",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("generated sync workflow", () => {
  // The generator ignores its config; cast to the real parameter type rather
  // than `never`, so this breaks if the signature ever starts mattering.
  const workflow = () => githubActionTemplate({} as ArcBridgeConfig).content ?? "";

  it("installs nothing", () => {
    // `pnpm install --frozen-lockfile` at the repo root fails unless the repo is
    // a pnpm workspace rooted at the top — so it broke plain npm projects,
    // .NET-only and Unity projects, and any layout whose Node package is nested.
    // A fullstack repo has no root package.json at all.
    const text = workflow();
    expect(text).not.toContain("pnpm");
    expect(text).not.toContain("frozen-lockfile");
  });

  it("reindexes before checking drift", () => {
    // .arcbridge/index.db is gitignored, so a CI checkout has no index. Without
    // --reindex, every block's code_paths and every ADR's files look absent.
    const text = workflow();
    expect(text).toContain("arcbridge drift --reindex");
    expect(text).not.toMatch(/arcbridge drift --json/);
  });

  it("does not pin a Node version the runners have deprecated", () => {
    expect(workflow()).not.toContain("node-version: '20'");
  });

  it("passes -y to npx so it never waits for a prompt on a runner", () => {
    const text = workflow();
    const calls = text.match(/npx[^\n]*arcbridge/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(call).toContain("npx -y");
  });
});
