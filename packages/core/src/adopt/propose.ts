import type { Database } from "../db/connection.js";

/**
 * Evidence backing a proposed building block — surfaced so a human or agent can
 * judge and refine the proposal.
 */
export interface BlockEvidence {
  fileCount: number;
  /** Dependency edges that stay within this block. */
  internalEdges: number;
  /** Edges from other blocks into this block (a signal it's an interface). */
  inboundEdges: number;
  /** Edges from this block out to other blocks. */
  outboundEdges: number;
  /** Most depended-on exported symbols in this block (interface candidates). */
  topSymbols: string[];
  routes: number;
  components: number;
}

export interface ProposedBlock {
  id: string;
  name: string;
  code_paths: string[];
  /** Other block ids this block depends on (derived from real edges). */
  interfaces: string[];
  responsibility: string;
  service: string;
  confidence: "high" | "medium" | "low";
  evidence: BlockEvidence;
}

export interface AdoptProposal {
  blocks: ProposedBlock[];
  /** Indexed files not covered by any block (should be empty by construction). */
  unassigned: string[];
  stats: { files: number; symbols: number; edges: number; services: string[] };
}

export interface ProposeOptions {
  /** Limit the proposal to a single service. */
  service?: string;
  /** Upper bound on the number of level-1 blocks (default 12). */
  maxBlocks?: number;
  /** Directories below this file count are rolled into their parent (default 3). */
  minFilesPerBlock?: number;
}

interface SymbolRow {
  id: string;
  file_path: string;
  service: string;
  name: string;
  is_exported: number;
}

const DEP_KINDS = "'imports','calls','extends','implements','uses_type','renders'";
// Pure scaffolding wrappers — always dropped from block ids, even as a leaf.
const STRICT_NOISE = new Set(["src", "source", "packages"]);
// Names that are usually wrappers but can be meaningful as a leaf directory
// (e.g. `src/lib/` → "lib", but `packages/core/src/lib/` drops the outer ones).
const SOFT_NOISE = new Set(["app", "lib", "apps"]);

function dirOf(file: string): string {
  const i = file.lastIndexOf("/");
  return i < 0 ? "" : file.slice(0, i + 1);
}

/** Longest common directory prefix of a set of files. */
function commonPrefix(files: string[]): string {
  if (files.length === 0) return "";
  let prefix = dirOf(files[0]!);
  for (const f of files.slice(1)) {
    while (prefix && !f.startsWith(prefix)) {
      prefix = prefix.slice(0, prefix.lastIndexOf("/", prefix.length - 2) + 1);
    }
    if (!prefix) break;
  }
  return prefix;
}

/**
 * Assign each file to the longest matching prefix (most specific wins),
 * mirroring drift's file→block mapping. Returns prefix → files.
 */
function assign(files: string[], prefixes: string[]): Map<string, string[]> {
  const sorted = [...prefixes].sort((a, b) => b.length - a.length || a.localeCompare(b));
  const owned = new Map<string, string[]>(prefixes.map((p) => [p, []]));
  for (const file of files) {
    const match = sorted.find((p) => file === p || file.startsWith(p));
    if (match) owned.get(match)!.push(file);
  }
  return owned;
}

/**
 * Partition a service's files into directory clusters by greedy top-down split:
 * start at the common root and repeatedly split the largest cluster into the
 * child directories that clear the min-files threshold, leaving the parent as a
 * remainder owner of loose files. Stops at maxBlocks. The result is a set of
 * directory prefixes that completely cover the files.
 */
function clusterFiles(files: string[], maxBlocks: number, minFiles: number): string[] {
  const root = commonPrefix(files);
  let prefixes = [root];

  for (;;) {
    if (prefixes.length >= maxBlocks) break;
    const owned = assign(files, prefixes);

    // Find the splittable prefix that owns the most files
    let best: { prefix: string; children: string[]; ownedCount: number } | null = null;
    for (const prefix of prefixes) {
      const mine = owned.get(prefix)!;
      // Group this prefix's loose files by their next path segment
      const bySeg = new Map<string, number>();
      for (const f of mine) {
        const rest = f.slice(prefix.length);
        const slash = rest.indexOf("/");
        if (slash < 0) continue; // file directly in prefix, not in a subdir
        const seg = rest.slice(0, slash);
        bySeg.set(seg, (bySeg.get(seg) ?? 0) + 1);
      }
      const children = [...bySeg.entries()]
        .filter(([, n]) => n >= minFiles)
        .map(([seg]) => `${prefix}${seg}/`);
      if (children.length === 0) continue;
      if (!best || mine.length > best.ownedCount) {
        best = { prefix, children, ownedCount: mine.length };
      }
    }

    if (!best) break;
    // Don't partially split — if the children won't all fit under maxBlocks, stop
    if (prefixes.length + best.children.length > maxBlocks) break;

    const next = new Set([...prefixes, ...best.children]);
    // Drop the parent if its children claimed all its files (no loose remainder)
    if (assign(files, [...next]).get(best.prefix)!.length === 0) next.delete(best.prefix);
    prefixes = [...next];
  }

  return prefixes;
}

function kebab(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase()
    .replace(/^-+|-+$/g, "");
}

/** Build a kebab-case id from a prefix's meaningful (non-wrapper) path segments. */
function prefixToId(prefix: string, service: string, used: Set<string>): string {
  const segs = prefix.split("/").filter(Boolean);
  const kept = segs.filter((s, i) => {
    const w = s.toLowerCase();
    if (STRICT_NOISE.has(w)) return false;
    if (SOFT_NOISE.has(w) && i !== segs.length - 1) return false;
    return true;
  });
  let base = kept.slice(-2).map(kebab).filter(Boolean).join("-");
  if (!base) base = kebab(service) || "root";
  let id = base;
  let n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}

function titleCase(id: string): string {
  return id
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Propose a set of building blocks for an already-indexed project by clustering
 * its files and deriving dependencies between clusters from the real symbol
 * graph. The inverse of drift's undocumented-module check: every indexed file
 * is covered, so applying the proposal yields zero undocumented_module drift.
 */
export function proposeBuildingBlocks(
  db: Database,
  opts: ProposeOptions = {},
): AdoptProposal {
  const maxBlocks = opts.maxBlocks ?? 12;
  const minFiles = opts.minFilesPerBlock ?? 3;

  const symbols = (
    opts.service
      ? db
          .prepare("SELECT id, file_path, service, name, is_exported FROM symbols WHERE service = ?")
          .all(opts.service)
      : db.prepare("SELECT id, file_path, service, name, is_exported FROM symbols").all()
  ) as SymbolRow[];

  const services = [...new Set(symbols.map((s) => s.service))].sort();
  const symbolFile = new Map(symbols.map((s) => [s.id, s.file_path]));

  // Cluster within each service, then concatenate — services are an explicit
  // architectural boundary, and cross-service edges aren't captured anyway.
  const blocks: ProposedBlock[] = [];
  const usedIds = new Set<string>();
  const fileToBlock = new Map<string, string>();

  // Pre-load dependency edges once
  const edges = db
    .prepare(
      `SELECT source_symbol AS s, target_symbol AS t FROM dependencies WHERE kind IN (${DEP_KINDS})`,
    )
    .all() as { s: string; t: string }[];

  // When a single service is in scope (single-service repo, or --service X),
  // subdivide it into directory blocks. When several services are present, each
  // service is itself a top-level block (services are an explicit boundary) —
  // run `adopt --service <name>` to subdivide one.
  const subdivide = services.length === 1;

  for (const service of services) {
    // Sort for determinism — SQLite row order isn't guaranteed, and we want
    // reproducible proposals (stable block ids and ordering) across runs.
    const svcFiles = [...new Set(symbols.filter((s) => s.service === service).map((s) => s.file_path))].sort();
    if (svcFiles.length === 0) continue;
    const prefixes = subdivide
      ? clusterFiles(svcFiles, maxBlocks, minFiles)
      : [commonPrefix(svcFiles)];
    const owned = assign(svcFiles, prefixes);

    // Drift assigns each file to its longest matching prefix (most specific
    // wins), so block order doesn't affect correctness. Emit narrowest first
    // anyway, purely so the generated doc reads child-before-parent.
    const ordered = [...prefixes].sort((a, b) => b.length - a.length || a.localeCompare(b));
    const prefixId = new Map<string, string>();
    for (const prefix of ordered) {
      prefixId.set(prefix, prefixToId(prefix, service, usedIds));
    }

    for (const file of svcFiles) {
      const match = ordered.find((p) => file === p || file.startsWith(p));
      if (match) fileToBlock.set(file, prefixId.get(match)!);
    }

    for (const prefix of ordered) {
      const id = prefixId.get(prefix)!;
      const files = owned.get(prefix) ?? [];
      blocks.push({
        id,
        name: titleCase(id),
        code_paths: [prefix],
        interfaces: [],
        responsibility: `(auto-generated — refine) Code under ${prefix}`,
        service,
        confidence: files.length >= minFiles * 3 ? "high" : files.length >= minFiles ? "medium" : "low",
        evidence: {
          fileCount: files.length,
          internalEdges: 0,
          inboundEdges: 0,
          outboundEdges: 0,
          topSymbols: [],
          routes: 0,
          components: 0,
        },
      });
    }
  }

  // Derive interfaces + edge evidence from the real symbol dependency graph
  const blockById = new Map(blocks.map((b) => [b.id, b]));
  const inbound = new Map<string, number>();
  const depTargets = new Map<string, Map<string, number>>(); // block → target block → count
  for (const b of blocks) depTargets.set(b.id, new Map());

  for (const { s, t } of edges) {
    const sf = symbolFile.get(s);
    const tf = symbolFile.get(t);
    if (!sf || !tf) continue;
    const sb = fileToBlock.get(sf);
    const tb = fileToBlock.get(tf);
    if (!sb || !tb) continue;
    const block = blockById.get(sb)!;
    if (sb === tb) {
      block.evidence.internalEdges++;
    } else {
      block.evidence.outboundEdges++;
      inbound.set(tb, (inbound.get(tb) ?? 0) + 1);
      const m = depTargets.get(sb)!;
      m.set(tb, (m.get(tb) ?? 0) + 1);
    }
  }
  for (const b of blocks) {
    b.evidence.inboundEdges = inbound.get(b.id) ?? 0;
    b.interfaces = [...depTargets.get(b.id)!.keys()].sort();
  }

  // Top depended-on exported symbols per block (interface candidates)
  const symInbound = new Map<string, number>();
  for (const { t } of edges) symInbound.set(t, (symInbound.get(t) ?? 0) + 1);
  const blockTopSyms = new Map<string, { name: string; n: number }[]>();
  for (const sym of symbols) {
    if (!sym.is_exported) continue;
    const b = fileToBlock.get(sym.file_path);
    if (!b) continue;
    const n = symInbound.get(sym.id) ?? 0;
    if (n === 0) continue;
    const arr = blockTopSyms.get(b) ?? [];
    arr.push({ name: sym.name, n });
    blockTopSyms.set(b, arr);
  }
  for (const b of blocks) {
    const arr = (blockTopSyms.get(b.id) ?? []).sort((x, y) => y.n - x.n).slice(0, 5);
    b.evidence.topSymbols = arr.map((x) => x.name);
  }

  // Route / component evidence (best-effort; tables may be empty)
  enrichRoutesAndComponents(db, blocks, fileToBlock, symbolFile);

  const allFiles = [...new Set(symbols.map((s) => s.file_path))];
  const unassigned = allFiles.filter((f) => !fileToBlock.has(f));

  return {
    blocks,
    unassigned,
    stats: { files: allFiles.length, symbols: symbols.length, edges: edges.length, services },
  };
}

function enrichRoutesAndComponents(
  db: Database,
  blocks: ProposedBlock[],
  fileToBlock: Map<string, string>,
  symbolFile: Map<string, string>,
): void {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  try {
    // Routes are service-scoped, not file-scoped, so they can only be
    // attributed unambiguously when a service maps to a single block. When a
    // service is subdivided, omit route evidence rather than dumping every
    // route on an arbitrary sub-block.
    const blocksByService = new Map<string, ProposedBlock[]>();
    for (const b of blocks) {
      const arr = blocksByService.get(b.service) ?? [];
      arr.push(b);
      blocksByService.set(b.service, arr);
    }
    const routes = db.prepare("SELECT service FROM routes").all() as { service: string }[];
    for (const r of routes) {
      const svcBlocks = blocksByService.get(r.service);
      if (svcBlocks && svcBlocks.length === 1) svcBlocks[0]!.evidence.routes++;
    }
  } catch {
    /* routes table shape varies; evidence is optional */
  }
  try {
    const comps = db.prepare("SELECT symbol_id FROM components").all() as { symbol_id: string }[];
    for (const c of comps) {
      const f = symbolFile.get(c.symbol_id);
      const b = f ? fileToBlock.get(f) : undefined;
      if (b) byId.get(b)!.evidence.components++;
    }
  } catch {
    /* components optional */
  }
}
