import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openMemoryDatabase, type Database } from "../db/connection.js";
import { initializeSchema } from "../db/schema.js";
import { indexConfiguredProject } from "../indexer/index.js";

let db: Database;
let repoRoot: string;

const BASE_TSCONFIG = JSON.stringify({
  compilerOptions: {
    target: "ES2022",
    module: "ESNext",
    moduleResolution: "bundler",
    strict: true,
  },
});

function pkg(name: string, files: Record<string, string>, deps?: Record<string, string>): void {
  const dir = join(repoRoot, "packages", name);
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify({ extends: "../../tsconfig.base.json", include: ["src/**/*"] }),
    "utf-8",
  );
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: `@scope/${name}`, dependencies: deps ?? {} }),
    "utf-8",
  );
  for (const [rel, content] of Object.entries(files)) {
    writeFileSync(join(dir, "src", rel), content, "utf-8");
  }
}

beforeEach(() => {
  db = openMemoryDatabase();
  initializeSchema(db);
  repoRoot = mkdtempSync(join(tmpdir(), "arcbridge-monorepo-"));
  writeFileSync(join(repoRoot, "tsconfig.base.json"), BASE_TSCONFIG, "utf-8");
  // Deliberately NO root tsconfig.json — mirrors a pnpm monorepo
  pkg("core", { "index.ts": "export function coreFn(): number { return 1; }\n" }, { zod: "^3.0.0" });
  pkg("cli", { "main.ts": "export function cliMain(): string { return 'hi'; }\n" }, { commander: "^12.0.0" });
});

afterEach(() => {
  db.close();
  rmSync(repoRoot, { recursive: true, force: true });
});

const SERVICES = [
  { name: "core", path: "packages/core", type: "express" as const, tsconfig: "tsconfig.json" },
  { name: "cli", path: "packages/cli", type: "express" as const, tsconfig: "tsconfig.json" },
];

describe("indexConfiguredProject (monorepo)", () => {
  it("indexes each package as its own service with repo-relative paths", async () => {
    const result = await indexConfiguredProject(db, repoRoot, { services: SERVICES });

    expect(result.total.symbolsIndexed).toBeGreaterThanOrEqual(2);
    expect(result.services.map((s) => s.service).sort()).toEqual(["cli", "core"]);

    // File paths are relative to the repo root, not the package dir
    const files = (
      db.prepare("SELECT DISTINCT file_path FROM symbols ORDER BY file_path").all() as {
        file_path: string;
      }[]
    ).map((r) => r.file_path);
    expect(files).toContain("packages/core/src/index.ts");
    expect(files).toContain("packages/cli/src/main.ts");

    // Symbols are tagged by service
    const coreSym = db
      .prepare("SELECT service FROM symbols WHERE name = 'coreFn'")
      .get() as { service: string };
    const cliSym = db
      .prepare("SELECT service FROM symbols WHERE name = 'cliMain'")
      .get() as { service: string };
    expect(coreSym.service).toBe("core");
    expect(cliSym.service).toBe("cli");
  });

  it("scans each package's own manifest, not the repo root's", async () => {
    await indexConfiguredProject(db, repoRoot, { services: SERVICES });

    const coreDeps = (
      db
        .prepare("SELECT name FROM package_dependencies WHERE service = 'core'")
        .all() as { name: string }[]
    ).map((r) => r.name);
    const cliDeps = (
      db
        .prepare("SELECT name FROM package_dependencies WHERE service = 'cli'")
        .all() as { name: string }[]
    ).map((r) => r.name);

    // Each service sees only its own dependency, not the other's
    expect(coreDeps).toContain("zod");
    expect(coreDeps).not.toContain("commander");
    expect(cliDeps).toContain("commander");
    expect(cliDeps).not.toContain("zod");
  });

  it("falls back to a single root index when no services are configured", async () => {
    // Give the repo a root tsconfig so the single-index path finds something
    writeFileSync(
      join(repoRoot, "tsconfig.json"),
      JSON.stringify({ extends: "./tsconfig.base.json", include: ["packages/core/src/**/*"] }),
      "utf-8",
    );

    const result = await indexConfiguredProject(db, repoRoot, { services: [] });
    expect(result.services).toHaveLength(1);
    expect(result.services[0]!.service).toBe("main");
  });

  it("skips services whose path escapes the project root", async () => {
    const result = await indexConfiguredProject(db, repoRoot, {
      services: [
        { name: "evil", path: "../../etc", type: "express", tsconfig: "tsconfig.json" },
        ...SERVICES,
      ],
    });

    const evil = result.services.find((s) => s.service === "evil");
    expect(evil?.skippedReason).toBe("path escapes project root");
    expect(result.warnings.some((w) => w.includes("evil") && w.includes("escapes"))).toBe(true);
    // No symbols indexed from outside the project
    const files = db.prepare("SELECT file_path FROM symbols").all() as { file_path: string }[];
    expect(files.every((f) => f.file_path.startsWith("packages/"))).toBe(true);
  });

  it("warns and skips non-TypeScript services", async () => {
    const result = await indexConfiguredProject(db, repoRoot, {
      services: [
        ...SERVICES,
        { name: "indexer", path: "packages/dotnet", type: "dotnet", tsconfig: undefined },
      ],
    });

    expect(result.warnings.some((w) => w.includes("indexer") && w.includes("TypeScript only"))).toBe(true);
    // TS services still indexed
    expect(result.total.symbolsIndexed).toBeGreaterThanOrEqual(2);
  });
});
