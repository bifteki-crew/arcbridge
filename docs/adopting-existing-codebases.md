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
arcbridge adopt --apply   # replace .arcbridge/arc42/05-building-blocks.md
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
  "remainder" block for its loose files, emitted after its narrower children so
  drift's first-match assignment lands each file in the most specific block.
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
| `--apply` | Write to `.arcbridge/arc42/05-building-blocks.md` (default: write a reviewable copy to `.arcbridge/proposals/` only) |
| `--service <name>` | Limit to / subdivide one configured service |
| `--max-blocks <n>` | Cap the number of blocks (default 12) |
| `--json` | Emit the structured proposal |

## Known limitations (v1)

- **TypeScript only.** Adopt clusters whatever the indexer captured; per-service
  indexing currently covers TypeScript. C#/Python/Go services aren't proposed.
- **Cross-package edges.** In a monorepo each package is indexed as its own
  TypeScript program, so an import of another package resolves to the package
  name, not its source symbols. Interfaces are therefore accurate *within* a
  service but not derived *across* services.
- **Responsibilities are placeholders.** Adopt describes *what* the blocks are
  structurally, not *why* — that's the part to refine (by hand or with an agent).
- **Directory-shaped.** Adopt assumes the directory layout roughly reflects the
  architecture. If it doesn't, treat the proposal as a starting point.
