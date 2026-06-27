import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openMemoryDatabase, type Database } from "../db/connection.js";
import { initializeSchema } from "../db/schema.js";
import { proposeBuildingBlocks } from "../adopt/propose.js";
import { proposalToBuildingBlocksMarkdown } from "../adopt/serialize.js";
import { BuildingBlocksFrontmatterSchema } from "../schemas/building-blocks.js";
import matter from "gray-matter";

let db: Database;
let sid = 0;

function addSymbol(file: string, name: string, opts: { exported?: boolean; service?: string } = {}): string {
  const id = `${file}::${name}#${sid++}`;
  db.prepare(
    `INSERT INTO symbols (id, name, qualified_name, kind, file_path, start_line, end_line, is_exported, service, language, indexed_at)
     VALUES (?, ?, ?, 'function', ?, 1, 5, ?, ?, 'typescript', '2026-01-01')`,
  ).run(id, name, name, file, opts.exported ? 1 : 0, opts.service ?? "main");
  return id;
}

function addDep(from: string, to: string): void {
  db.prepare("INSERT OR IGNORE INTO dependencies (source_symbol, target_symbol, kind) VALUES (?, ?, 'imports')").run(from, to);
}

beforeEach(() => {
  db = openMemoryDatabase();
  initializeSchema(db);
  sid = 0;
});

afterEach(() => db.close());

describe("proposeBuildingBlocks", () => {
  it("clusters a single app by directory and covers every file", () => {
    // src/index.ts (loose) + three dirs of 3 files each
    addSymbol("src/index.ts", "main");
    const btn = addSymbol("src/components/Button.tsx", "Button", { exported: true });
    addSymbol("src/components/Card.tsx", "Card", { exported: true });
    addSymbol("src/components/Modal.tsx", "Modal");
    const fmt = addSymbol("src/lib/format.ts", "format", { exported: true });
    addSymbol("src/lib/http.ts", "http", { exported: true });
    addSymbol("src/lib/parse.ts", "parse");
    const useAuth = addSymbol("src/hooks/useAuth.ts", "useAuth", { exported: true });
    addSymbol("src/hooks/useData.ts", "useData");
    addSymbol("src/hooks/useForm.ts", "useForm");

    // components → hooks, components → lib, hooks → lib
    addDep(btn, useAuth);
    addDep(btn, fmt);
    addDep(useAuth, fmt);

    const proposal = proposeBuildingBlocks(db);
    const ids = proposal.blocks.map((b) => b.id);

    // Coverage: nothing left unassigned (the inverse of undocumented_module)
    expect(proposal.unassigned).toEqual([]);
    expect(ids).toEqual(expect.arrayContaining(["components", "lib", "hooks"]));

    // Ordering: broad parent remainder (owns src/index.ts) comes AFTER the
    // narrower child blocks, so first-match assignment is correct.
    const broad = proposal.blocks.find((b) => b.code_paths[0] === "src/");
    expect(broad).toBeDefined();
    expect(ids.indexOf(broad!.id)).toBeGreaterThan(ids.indexOf("components"));
  });

  it("derives interface direction from real edges", () => {
    addSymbol("src/index.ts", "main");
    const btn = addSymbol("src/components/Button.tsx", "Button", { exported: true });
    addSymbol("src/components/Card.tsx", "Card");
    addSymbol("src/components/Modal.tsx", "Modal");
    const fmt = addSymbol("src/lib/format.ts", "format", { exported: true });
    addSymbol("src/lib/http.ts", "http");
    addSymbol("src/lib/parse.ts", "parse");
    const useAuth = addSymbol("src/hooks/useAuth.ts", "useAuth", { exported: true });
    addSymbol("src/hooks/useData.ts", "useData");
    addSymbol("src/hooks/useForm.ts", "useForm");

    addDep(btn, useAuth); // components → hooks
    addDep(btn, fmt); // components → lib
    addDep(useAuth, fmt); // hooks → lib

    const proposal = proposeBuildingBlocks(db);
    const by = (id: string) => proposal.blocks.find((b) => b.id === id)!;

    expect(by("components").interfaces).toEqual(expect.arrayContaining(["hooks", "lib"]));
    expect(by("hooks").interfaces).toEqual(["lib"]);
    expect(by("lib").interfaces).toEqual([]); // leaf — depends on nothing
    // lib is the most depended-on, reflected in inbound edges
    expect(by("lib").evidence.inboundEdges).toBeGreaterThan(0);
    expect(by("lib").evidence.topSymbols).toContain("format");
  });

  it("clusters a monorepo at package level", () => {
    for (const pkg of ["core", "cli", "adapters"]) {
      for (let i = 0; i < 4; i++) {
        addSymbol(`packages/${pkg}/src/file${i}.ts`, `fn_${pkg}_${i}`, { service: pkg });
      }
    }
    const proposal = proposeBuildingBlocks(db, { maxBlocks: 6 });
    const ids = proposal.blocks.map((b) => b.id).sort();
    expect(ids).toEqual(["adapters", "cli", "core"]);
    expect(proposal.unassigned).toEqual([]);
    expect(proposal.blocks.every((b) => b.code_paths[0]!.startsWith("packages/"))).toBe(true);
  });

  it("subdivides a single service when one is requested", () => {
    for (const pkg of ["core", "cli"]) {
      for (let i = 0; i < 4; i++) addSymbol(`packages/${pkg}/src/f${i}.ts`, `fn_${pkg}_${i}`, { service: pkg });
    }
    // core also has a sizable indexer subdir
    for (let i = 0; i < 4; i++) addSymbol(`packages/core/src/indexer/ix${i}.ts`, `ix${i}`, { service: "core" });

    const full = proposeBuildingBlocks(db);
    expect(full.blocks.map((b) => b.id).sort()).toEqual(["cli", "core"]); // one per service

    const scoped = proposeBuildingBlocks(db, { service: "core" });
    expect(scoped.blocks.map((b) => b.id)).toContain("core-indexer"); // subdivided
    expect(scoped.blocks.every((b) => b.service === "core")).toBe(true);
  });

  it("serializes to a building-blocks doc whose code_paths cover every file", () => {
    addSymbol("src/index.ts", "main");
    for (const d of ["components", "lib", "hooks"]) {
      for (let i = 0; i < 3; i++) addSymbol(`src/${d}/f${i}.ts`, `${d}${i}`);
    }
    const proposal = proposeBuildingBlocks(db);
    const md = proposalToBuildingBlocksMarkdown(proposal, "2026-01-01T00:00:00.000Z");

    // Round-trips through the canonical schema
    const fm = BuildingBlocksFrontmatterSchema.parse(matter(md).data);
    const prefixes = fm.blocks.flatMap((b) => b.code_paths);

    // Every indexed file matches at least one block's code_path (zero
    // undocumented modules after apply)
    const files = (db.prepare("SELECT DISTINCT file_path FROM symbols").all() as { file_path: string }[]).map((r) => r.file_path);
    for (const f of files) {
      expect(prefixes.some((p) => f === p || f.startsWith(p)), `${f} unmatched`).toBe(true);
    }
  });

  it("respects maxBlocks", () => {
    for (let d = 0; d < 20; d++) {
      for (let i = 0; i < 3; i++) addSymbol(`src/mod${d}/f${i}.ts`, `f_${d}_${i}`);
    }
    const proposal = proposeBuildingBlocks(db, { maxBlocks: 8 });
    expect(proposal.blocks.length).toBeLessThanOrEqual(8);
    expect(proposal.unassigned).toEqual([]);
  });
});
