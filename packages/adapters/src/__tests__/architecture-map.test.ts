// The map is embedded so an agent starts with the architecture rather than having
// to ask. Benchmark runs showed an unattended agent calling ZERO ArcBridge tools
// despite a CLAUDE.md that says, in bold, to use them — so the information has to
// arrive without depending on the agent choosing to fetch it.
import { describe, it, expect } from "vitest";
import { renderArchitectureMap, type BlockSummary } from "../shared/architecture-map.js";

const block = (over: Partial<BlockSummary> = {}): BlockSummary => ({
  id: "api-controllers",
  name: "API Controllers",
  codePaths: ["api/Controllers/"],
  responsibility: "HTTP surface of the service.",
  interfaces: ["api-services"],
  ...over,
});

describe("renderArchitectureMap", () => {
  it("renders a block with its paths, allowed dependencies and responsibility", () => {
    const out = renderArchitectureMap([block()]);
    expect(out).toContain("`api-controllers`");
    expect(out).toContain("`api/Controllers/`");
    expect(out).toContain("api-services");
    expect(out).toContain("HTTP surface of the service.");
  });

  it("returns nothing at all when there are no blocks", () => {
    // An empty heading would cost every session tokens for no information.
    expect(renderArchitectureMap([])).toBe("");
  });

  it("states the longest-prefix rule, since that is what decides where code goes", () => {
    expect(renderArchitectureMap([block()])).toContain("longest matching path");
  });

  it("says that an undeclared dependency is drift", () => {
    expect(renderArchitectureMap([block()])).toContain("architectural drift");
  });

  it("keeps a long responsibility on one line so the table survives", () => {
    const out = renderArchitectureMap([
      block({ responsibility: `${"very long ".repeat(40)}end` }),
    ]);
    const row = out.split("\n").find((l) => l.startsWith("| `api-controllers`"))!;
    expect(row).toContain("…");
    expect(row.split("|")).toHaveLength(6); // leading + 4 cells + trailing
  });

  it("escapes a pipe in a responsibility rather than breaking the table", () => {
    const out = renderArchitectureMap([block({ responsibility: "reads a|b files" })]);
    const row = out.split("\n").find((l) => l.startsWith("| `api-controllers`"))!;
    expect(row).toContain("a\\|b");
    // Split on UNESCAPED pipes only — a naive split counts the escaped one too,
    // which is exactly the ambiguity the escape exists to remove.
    expect(row.split(/(?<!\\)\|/)).toHaveLength(6);
  });

  it("caps the number of blocks and says how many were omitted", () => {
    const many = Array.from({ length: 45 }, (_, i) => block({ id: `b${i}` }));
    const out = renderArchitectureMap(many);
    expect(out).toContain("5 further block(s) omitted");
    expect(out).toContain("arcbridge_get_building_blocks");
  });

  it("handles a block that owns no paths", () => {
    expect(renderArchitectureMap([block({ codePaths: [], interfaces: [] })])).toContain("| — | — |");
  });
});
