// readBlockSummaries runs during `init` and `sync` and falls back to [] on
// anything unexpected. That fallback is deliberate — a missing map must never
// fail the command that was only regenerating configs — but a silent fallback is
// also how a path or schema regression hides, so each branch is pinned.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readBlockSummaries } from "../sync/block-summaries.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "arcbridge-blocksum-"));
  mkdirSync(join(root, ".arcbridge", "arc42"), { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function writeBlocks(yaml: string): void {
  writeFileSync(join(root, ".arcbridge", "arc42", "05-building-blocks.yaml"), yaml, "utf-8");
}

describe("readBlockSummaries", () => {
  it("maps a valid file to summaries", () => {
    writeBlocks(`section: building-blocks
schema_version: 1
last_synced: '2026-01-01T00:00:00Z'
blocks:
  - id: api-controllers
    name: API Controllers
    level: 1
    code_paths:
      - api/Controllers/
    interfaces:
      - api-services
    quality_scenarios: []
    adrs: []
    responsibility: HTTP surface.
    service: api
`);
    expect(readBlockSummaries(root)).toEqual([
      {
        id: "api-controllers",
        name: "API Controllers",
        codePaths: ["api/Controllers/"],
        interfaces: ["api-services"],
        responsibility: "HTTP surface.",
        service: "api",
      },
    ]);
  });

  it("returns [] when the file does not exist", () => {
    // The normal state during `init` before the model is written.
    expect(readBlockSummaries(root)).toEqual([]);
  });

  it("returns [] for malformed YAML rather than throwing", () => {
    writeBlocks("blocks: [ this is not: valid: yaml\n  - broken");
    expect(readBlockSummaries(root)).toEqual([]);
  });

  it("returns [] when the document does not match the schema", () => {
    writeBlocks("section: building-blocks\nschema_version: 1\nlast_synced: 'x'\nblocks: 'not a list'\n");
    expect(readBlockSummaries(root)).toEqual([]);
  });

  it("defaults absent optional fields instead of producing undefined holes", () => {
    writeBlocks(`section: building-blocks
schema_version: 1
last_synced: '2026-01-01T00:00:00Z'
blocks:
  - id: bare
    name: Bare
    level: 1
    code_paths: []
    interfaces: []
    quality_scenarios: []
    adrs: []
    responsibility: Minimal block.
`);
    const [b] = readBlockSummaries(root);
    expect(b.codePaths).toEqual([]);
    expect(b.interfaces).toEqual([]);
    // The schema defaults an omitted service to "main" rather than leaving it unset.
    expect(b.service).toBe("main");
  });
});
