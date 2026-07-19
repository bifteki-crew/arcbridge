// Multi-service indexing: symbol IDs must stay unique across services and
// stored paths must stay repo-root-relative (so drift's repo-relative
// code_paths match). Before scanRoot, two services sharing a relative layout
// produced identical IDs and INSERT OR REPLACE silently overwrote one service
// with the other.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openMemoryDatabase, type Database } from "../db/connection.js";
import { initializeSchema } from "../db/schema.js";
import { indexCSharpTreeSitter } from "../indexer/csharp/indexer.js";
import { indexConfiguredProject } from "../indexer/index.js";
import { detectDrift } from "../drift/detector.js";

let db: Database;
let repoRoot: string;

const USER_MODEL = `namespace Acme.Models
{
    public class User
    {
        public string Name { get; set; }
        public string Email { get; set; }
    }
}
`;

function csService(dir: string): void {
  mkdirSync(join(repoRoot, dir, "Models"), { recursive: true });
  writeFileSync(join(repoRoot, dir, "Models", "User.cs"), USER_MODEL, "utf-8");
}

beforeEach(() => {
  db = openMemoryDatabase();
  initializeSchema(db);
  repoRoot = mkdtempSync(join(tmpdir(), "arcbridge-multisvc-"));
});

afterEach(() => {
  db.close();
  rmSync(repoRoot, { recursive: true, force: true });
});

describe("scanRoot keeps symbol IDs unique across services", () => {
  it("two services with identical relative layouts do not overwrite each other", async () => {
    csService("services/a");
    csService("services/b");

    await indexCSharpTreeSitter(db, {
      projectRoot: repoRoot,
      scanRoot: join(repoRoot, "services", "a"),
      service: "svc-a",
    });
    await indexCSharpTreeSitter(db, {
      projectRoot: repoRoot,
      scanRoot: join(repoRoot, "services", "b"),
      service: "svc-b",
    });

    const rows = db
      .prepare("SELECT id, file_path, service FROM symbols WHERE name = 'User' ORDER BY id")
      .all() as { id: string; file_path: string; service: string }[];

    // Both services' User classes survive with distinct, repo-relative IDs
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe("services/a/Models/User.cs::Acme.Models.User#class");
    expect(rows[1].id).toBe("services/b/Models/User.cs::Acme.Models.User#class");
    expect(rows[0].service).toBe("svc-a");
    expect(rows[1].service).toBe("svc-b");
    expect(rows[0].file_path).toBe("services/a/Models/User.cs");
  });

  it("incremental re-run with scanRoot skips unchanged files", async () => {
    csService("services/a");
    const opts = {
      projectRoot: repoRoot,
      scanRoot: join(repoRoot, "services", "a"),
      service: "svc-a",
    };
    const first = await indexCSharpTreeSitter(db, opts);
    expect(first.filesProcessed).toBeGreaterThan(0);

    const second = await indexCSharpTreeSitter(db, opts);
    expect(second.filesProcessed).toBe(0);
    expect(second.filesSkipped).toBe(first.filesProcessed);
  });
});

describe("indexConfiguredProject indexes non-TypeScript services", () => {
  it("a dotnet service is indexed (repo-relative paths), not skipped", async () => {
    // TS frontend
    mkdirSync(join(repoRoot, "web", "src"), { recursive: true });
    writeFileSync(
      join(repoRoot, "web", "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "bundler", strict: true },
        include: ["src/**/*"],
      }),
      "utf-8",
    );
    writeFileSync(join(repoRoot, "web", "package.json"), JSON.stringify({ name: "web" }), "utf-8");
    writeFileSync(join(repoRoot, "web", "src", "app.ts"), "export const app = 1;\n", "utf-8");

    // C# api
    csService("api");

    // Force the tree-sitter backend so the test doesn't depend on a dotnet SDK
    mkdirSync(join(repoRoot, ".arcbridge"), { recursive: true });
    writeFileSync(
      join(repoRoot, ".arcbridge", "config.yaml"),
      "indexing:\n  csharp_indexer: tree-sitter\n",
      "utf-8",
    );

    const { services, warnings } = await indexConfiguredProject(db, repoRoot, {
      services: [
        { name: "frontend", path: "web", type: "nextjs" },
        { name: "api", path: "api", type: "dotnet" },
      ],
    });

    const api = services.find((s) => s.service === "api");
    expect(api?.skippedReason).toBeUndefined();
    expect(api?.symbolsIndexed).toBeGreaterThan(0);
    expect(warnings.join("\n")).not.toContain("TypeScript only");

    const csRows = db
      .prepare("SELECT file_path, service FROM symbols WHERE language = 'csharp'")
      .all() as { file_path: string; service: string }[];
    expect(csRows.length).toBeGreaterThan(0);
    for (const row of csRows) {
      expect(row.file_path.startsWith("api/")).toBe(true);
      expect(row.service).toBe("api");
    }
  });

  it("repo-relative C# paths match building-block code_paths in drift", async () => {
    csService("api");
    mkdirSync(join(repoRoot, ".arcbridge"), { recursive: true });
    writeFileSync(
      join(repoRoot, ".arcbridge", "config.yaml"),
      "indexing:\n  csharp_indexer: tree-sitter\n",
      "utf-8",
    );

    await indexConfiguredProject(db, repoRoot, {
      services: [{ name: "api", path: "api", type: "dotnet" }],
    });

    db.prepare(
      "INSERT INTO building_blocks (id, name, level, responsibility, code_paths, interfaces, service) VALUES (?, ?, 1, ?, ?, '[]', 'api')",
    ).run("api-block", "API", "The .NET API", JSON.stringify(["api/"]));

    const entries = detectDrift(db);
    const undocumented = entries.filter((e) => e.kind === "undocumented_module");
    // Before path normalization, C# paths were service-relative (Models/…)
    // and never matched the repo-relative code_path "api/" — every file was
    // flagged undocumented. Now they match.
    expect(undocumented).toHaveLength(0);
  });
});
