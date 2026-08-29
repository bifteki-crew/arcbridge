# Adopting ArcBridge on an existing codebase

`arcbridge init` scaffolds template building blocks that are *examples of the
shape*, not your actual architecture. On a brownfield project that mismatch
means `arcbridge sync` reports a wall of `undocumented_module` drift until you
hand-author building blocks that match your code.

`arcbridge adopt` closes that gap: it reads your indexed code, clusters files
into candidate building blocks, and derives each block's dependencies from the
real symbol graph — so you start from a proposal that already covers every file
instead of a blank page.

## Quick start

```bash
arcbridge init            # scaffold .arcbridge/ (one-time)
arcbridge adopt           # propose blocks — writes .arcbridge/proposals/building-blocks.md
# review the proposal, then:
arcbridge adopt --apply   # replace .arcbridge/arc42/05-building-blocks.yaml
```

After `--apply`, every indexed file is mapped to a block (`arcbridge drift`
reports zero undocumented modules). The block **responsibilities** are
auto-generated placeholders — refine them, then commit `.arcbridge/`.

## How it decides the blocks

- **Clustering.** Files are grouped by directory. When the project has multiple
  configured services (a monorepo), each service becomes one top-level block.
  A single-service project is subdivided by directory up to `--max-blocks`
  (default 12). Run `arcbridge adopt --service <name>` to subdivide one service.
- **Coverage.** Clustering is a complete partition: a parent directory keeps a
  "remainder" block for its loose files. Drift assigns each file to the block
  with the longest matching code-path prefix (most specific wins), so a file in
  `src/components/` lands in the `components` block even though the remainder
  block's broader `src/` prefix also matches.
- **Interfaces.** For each pair of blocks, if any symbol in block A imports,
  calls, or otherwise depends on a symbol in block B, then `B` is added to A's
  `interfaces` (the dependencies A is allowed to have). This is derived from the
  real dependency edges, so the declared direction matches reality.
- **Evidence.** Each proposed block carries file count, internal/inbound/outbound
  edge counts, confidence, and its most depended-on exported symbols (interface
  candidates) — surfaced so you can judge and adjust the proposal.

## Agent-assisted adoption

The MCP tool `arcbridge_propose_building_blocks` returns the same proposal with
evidence to a connected agent. The intended loop: call it to see the structure,
rewrite the auto-generated responsibilities using the agent's understanding of
the code, then `apply` and commit.

## Options

| Flag | Meaning |
|------|---------|
| `--apply` | Write to `.arcbridge/arc42/05-building-blocks.yaml` (default: write a reviewable copy to `.arcbridge/proposals/` only) |
| `--service <name>` | Limit to / subdivide one configured service |
| `--max-blocks <n>` | Cap blocks when subdividing a single service (default 12). No effect in multi-service mode — each service is one block. |
| `--json` | Emit the structured proposal |

## Known limitations (v1)

- **Monorepo per-service indexing covers TypeScript and C#/Python/Go.**
  Since 0.12.0, non-TypeScript services declared in `config.services` are
  indexed per-service too (scanned in their own directory, with stored paths —
  and symbol IDs — kept repo-root-relative so services can't collide and drift's
  repo-relative `code_paths` match). TypeScript services are still driven by
  their own tsconfig.
- **Cross-package edges.** In a monorepo each package is indexed as its own
  TypeScript program, so an import of another package resolves to the package
  name, not its source symbols. Interfaces are therefore accurate *within* a
  service but not derived *across* services.
- **Responsibilities are placeholders.** Adopt describes *what* the blocks are
  structurally, not *why* — that's the part to refine (by hand or with an agent).
- **Directory-shaped.** Adopt assumes the directory layout roughly reflects the
  architecture. If it doesn't, treat the proposal as a starting point.

## Re-adopting a model you have already curated

`arcbridge adopt --apply` rewrites `05-building-blocks.yaml` wholesale. That is
what you want the first time — it replaces the template's placeholder blocks with
something derived from your real code.

It is the wrong tool afterwards. A proposal cannot reconstruct what you wrote:
responsibilities, the interfaces you deliberately allowed between blocks, and the
links to quality scenarios and ADRs. Running it again to pick up a moved directory
would cost you all of it.

```bash
arcbridge adopt --apply --merge
```

`--merge` refreshes **only `code_paths`** — the part actually derived from code —
and keeps everything else from your existing model. It also:

- **never deletes a block** the proposal did not mention. A block can be missing
  because its code moved, was temporarily removed, or fell below the clustering
  threshold; drift will tell you if the code is genuinely gone.
- **skips proposals coarser than what you already have.** On a multi-service
  project adopt proposes one block per service, so merging naively into a model
  that already splits `api/` into controllers, services and models would add an
  overlapping `api/` block and make the model worse.

Blocks are matched by `id`. That is deliberate: matching on overlapping paths
would silently graft one block's prose onto another when a directory moves
between them, which is the exact loss this is meant to prevent.

Without `--merge`, `--apply` warns before replacing a model that shows signs of
having been edited by hand.
