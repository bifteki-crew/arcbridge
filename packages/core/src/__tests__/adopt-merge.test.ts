// `adopt --apply` rewrites the model wholesale. That is right the first time and
// destructive every time after: a proposal cannot reconstruct responsibilities,
// deliberately-declared interfaces, or links to quality scenarios and ADRs.
// These pin what merge keeps and what it refreshes.
import { describe, it, expect } from "vitest";
import { mergeProposalIntoBlocks } from "../adopt/merge.js";
import type { AdoptProposal } from "../adopt/propose.js";
import type { BlockSummary } from "../sync/block-summaries.js";

const curated = (over: Partial<BlockSummary> = {}): BlockSummary => ({
  id: "api-controllers",
  name: "API Controllers",
  codePaths: ["api/Controllers/"],
  responsibility: "HTTP surface. Thin: validates input and delegates.",
  interfaces: ["api-services"],
  service: "api",
  level: 2,
  qualityScenarios: ["SEC-03"],
  adrs: ["003"],
  ...over,
});

const proposal = (blocks: Partial<AdoptProposal["blocks"][number]>[]): AdoptProposal =>
  ({
    blocks: blocks.map((b) => ({
      id: "api-controllers",
      name: "Api Controllers",
      code_paths: ["api/Controllers/", "api/Endpoints/"],
      interfaces: [],
      responsibility: "Auto-generated: contains 12 symbols across 3 files.",
      service: "api",
      confidence: "high",
      evidence: {},
      ...b,
    })),
    stats: { files: 0, symbols: 0, edges: 0, services: ["api"] },
  }) as unknown as AdoptProposal;

describe("mergeProposalIntoBlocks", () => {
  it("takes code_paths from the proposal and keeps everything authored", () => {
    const { blocks } = mergeProposalIntoBlocks([curated()], proposal([{}]));
    expect(blocks).toHaveLength(1);
    const b = blocks[0];
    // The one thing derived from code, and the reason to re-run adopt at all.
    expect(b.code_paths).toEqual(["api/Controllers/", "api/Endpoints/"]);
    // Everything a person wrote survives.
    expect(b.responsibility).toBe("HTTP surface. Thin: validates input and delegates.");
    expect(b.name).toBe("API Controllers");
    expect(b.interfaces).toEqual(["api-services"]);
    expect(b.quality_scenarios).toEqual(["SEC-03"]);
    expect(b.adrs).toEqual(["003"]);
    expect(b.level).toBe(2);
  });

  it("reports which blocks had their paths refreshed", () => {
    const { updated } = mergeProposalIntoBlocks([curated()], proposal([{}]));
    expect(updated).toEqual([
      { id: "api-controllers", before: ["api/Controllers/"], after: ["api/Controllers/", "api/Endpoints/"] },
    ]);
  });

  it("says nothing changed when the paths already match", () => {
    const { updated } = mergeProposalIntoBlocks(
      [curated()],
      proposal([{ code_paths: ["api/Controllers/"] }]),
    );
    expect(updated).toEqual([]);
  });

  it("adds a proposed block that has no existing counterpart", () => {
    const { blocks, added } = mergeProposalIntoBlocks(
      [curated()],
      proposal([{}, { id: "api-jobs", name: "Api Jobs", code_paths: ["api/Jobs/"] }]),
    );
    expect(added).toEqual(["api-jobs"]);
    expect(blocks.map((b) => b.id).sort()).toEqual(["api-controllers", "api-jobs"]);
  });

  it("KEEPS an existing block the proposal did not mention", () => {
    // A block can be absent because its code moved, was temporarily deleted, or
    // fell below the clustering threshold. None of those justify deleting the
    // prose; drift reports it if the code is genuinely gone.
    const { blocks, keptUnmatched } = mergeProposalIntoBlocks(
      [curated(), curated({ id: "api-legacy", name: "Legacy", responsibility: "Do not touch." })],
      proposal([{}]),
    );
    expect(keptUnmatched).toEqual(["api-legacy"]);
    const legacy = blocks.find((b) => b.id === "api-legacy")!;
    expect(legacy.responsibility).toBe("Do not touch.");
  });

  it("skips a proposal coarser than the existing model", () => {
    // Adopt proposes one block per service on a multi-service project. Merged
    // naively into a model that already splits api/ four ways, that adds an
    // overlapping api/ block and makes the model worse. Found by running it on
    // the real example, where it turned 11 good blocks into 13.
    const fine = [
      curated({ id: "api-controllers", codePaths: ["api/Controllers/"] }),
      curated({ id: "api-services", codePaths: ["api/Services/"] }),
    ];
    const { blocks, added, skippedCoarser } = mergeProposalIntoBlocks(
      fine,
      proposal([{ id: "api", name: "Api", code_paths: ["api/"] }]),
    );
    expect(skippedCoarser).toEqual(["api"]);
    expect(added).toEqual([]);
    expect(blocks.map((b) => b.id).sort()).toEqual(["api-controllers", "api-services"]);
  });

  it("still adds a proposal covering ground the model does not", () => {
    const { added, skippedCoarser } = mergeProposalIntoBlocks(
      [curated({ codePaths: ["api/Controllers/"] })],
      proposal([{ id: "api-jobs", name: "Jobs", code_paths: ["api/Jobs/"] }]),
    );
    expect(added).toEqual(["api-jobs"]);
    expect(skippedCoarser).toEqual([]);
  });

  it("behaves like a plain adoption when there is nothing to preserve", () => {
    const { blocks, added, updated, keptUnmatched } = mergeProposalIntoBlocks([], proposal([{}]));
    expect(added).toEqual(["api-controllers"]);
    expect(updated).toEqual([]);
    expect(keptUnmatched).toEqual([]);
    // With no prior block, the generated responsibility is all there is.
    expect(blocks[0].responsibility).toContain("Auto-generated");
  });
});
