import type { AdoptProposal } from "./propose.js";
import type { BlockSummary } from "../sync/block-summaries.js";

/**
 * Merge a fresh adopt proposal into an existing, hand-curated model.
 *
 * `adopt --apply` rewrites `05-building-blocks.yaml` wholesale. That is right the
 * first time — it replaces template placeholders with something derived from real
 * code. It is wrong every time after, because a proposal cannot reconstruct what a
 * person wrote: responsibilities, the interfaces they deliberately allowed, links
 * to quality scenarios and ADRs. Re-running adopt after moving a directory should
 * not cost you the architecture prose.
 *
 * The split is by field, not by block:
 *
 *   - `code_paths` come from the PROPOSAL. They are the thing derived from code,
 *     and the reason to re-run at all.
 *   - `name`, `responsibility`, `interfaces`, `quality_scenarios`, `adrs` and
 *     `service` are kept from the EXISTING block. A generated responsibility is a
 *     placeholder; a written one is a decision.
 *
 * Blocks are matched by `id`. Predictable and explainable beats clever: a fuzzy
 * match on overlapping paths would silently graft one block's prose onto another's
 * when a directory moves between them, which is precisely the loss this exists to
 * prevent.
 */

export interface MergedBlock {
  id: string;
  name: string;
  level: number;
  code_paths: string[];
  interfaces: string[];
  quality_scenarios: string[];
  adrs: string[];
  responsibility: string;
  service: string;
}

export interface MergeResult {
  blocks: MergedBlock[];
  /** Existing blocks whose paths were refreshed from the proposal. */
  updated: { id: string; before: string[]; after: string[] }[];
  /** Proposed blocks with no existing counterpart. */
  added: string[];
  /**
   * Proposed blocks dropped because the existing model already subdivides the
   * same ground more finely.
   *
   * Adopt proposes one coarse block per service on a multi-service project. Merged
   * naively into a hand-authored model that already splits `api/` into controllers,
   * services, models and data, that adds an `api/` block overlapping all four —
   * turning a good eleven-block model into a worse thirteen-block one. A proposal
   * that is strictly less specific than what exists contributes nothing.
   */
  skippedCoarser: string[];
  /**
   * Existing blocks the proposal did not mention. KEPT, never dropped — a block
   * can be absent from a proposal because its code moved, was temporarily
   * deleted, or sits below the clustering threshold, and none of those are a
   * reason to discard someone's writing. Drift will report them if the code
   * really is gone.
   */
  keptUnmatched: string[];
}

export function mergeProposalIntoBlocks(
  existing: (BlockSummary & { level?: number; qualityScenarios?: string[]; adrs?: string[] })[],
  proposal: AdoptProposal,
): MergeResult {
  const byId = new Map(existing.map((b) => [b.id, b]));
  const proposedIds = new Set(proposal.blocks.map((b) => b.id));

  const blocks: MergedBlock[] = [];
  const updated: MergeResult["updated"] = [];
  const added: string[] = [];
  const skippedCoarser: string[] = [];
  const existingPaths = existing.flatMap((b) => b.codePaths.map(normalize));

  for (const proposed of proposal.blocks) {
    const prior = byId.get(proposed.id);
    if (!prior) {
      if (isAlreadySubdivided(proposed.code_paths, existingPaths)) {
        skippedCoarser.push(proposed.id);
        continue;
      }
      added.push(proposed.id);
      blocks.push({
        id: proposed.id,
        name: proposed.name,
        level: 1,
        code_paths: proposed.code_paths,
        interfaces: proposed.interfaces,
        quality_scenarios: [],
        adrs: [],
        responsibility: proposed.responsibility,
        service: proposed.service,
      });
      continue;
    }

    if (JSON.stringify(prior.codePaths) !== JSON.stringify(proposed.code_paths)) {
      updated.push({ id: prior.id, before: prior.codePaths, after: proposed.code_paths });
    }
    blocks.push({
      id: prior.id,
      name: prior.name,
      level: prior.level ?? 1,
      // The one field taken from the proposal.
      code_paths: proposed.code_paths,
      interfaces: prior.interfaces,
      quality_scenarios: prior.qualityScenarios ?? [],
      adrs: prior.adrs ?? [],
      responsibility: prior.responsibility,
      service: prior.service ?? "main",
    });
  }

  const keptUnmatched: string[] = [];
  for (const prior of existing) {
    if (proposedIds.has(prior.id)) continue;
    keptUnmatched.push(prior.id);
    blocks.push({
      id: prior.id,
      name: prior.name,
      level: prior.level ?? 1,
      code_paths: prior.codePaths,
      interfaces: prior.interfaces,
      quality_scenarios: prior.qualityScenarios ?? [],
      adrs: prior.adrs ?? [],
      responsibility: prior.responsibility,
      service: prior.service ?? "main",
    });
  }

  return { blocks, updated, added, keptUnmatched, skippedCoarser };
}

function normalize(path: string): string {
  return path.replace(/\/+$/, "");
}

/**
 * Whether every path a proposed block claims is already broken down by existing
 * blocks — i.e. some existing path sits at or beneath it. A proposal covering
 * `api/` adds nothing when `api/Controllers/` and `api/Services/` are already
 * modelled separately.
 */
function isAlreadySubdivided(proposedPaths: string[], existingPaths: string[]): boolean {
  if (proposedPaths.length === 0 || existingPaths.length === 0) return false;
  return proposedPaths.every((raw) => {
    const path = normalize(raw);
    return existingPaths.some((e) => e === path || e.startsWith(`${path}/`));
  });
}
