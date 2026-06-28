import { join } from "node:path";
import { mkdirSync } from "node:fs";
import {
  loadConfig,
  indexConfiguredProject,
  proposeBuildingBlocks,
  proposalToBuildingBlocksMarkdown,
  refreshFromDocs,
  detectDrift,
  atomicWriteFileSync,
  type DriftOptions,
  type AdoptProposal,
} from "@arcbridge/core";
import { openProjectDb } from "../project.js";

interface AdoptOptions {
  apply?: boolean;
  service?: string;
  maxBlocks?: number;
}

export async function adopt(dir: string, options: AdoptOptions, json: boolean): Promise<void> {
  const db = openProjectDb(dir);

  try {
    const config = loadConfig(dir);

    // Reindex so the proposal reflects current code
    if (!json) console.log("Indexing codebase...");
    const { total, warnings } = await indexConfiguredProject(db, dir, {
      services: config.config?.services ?? [],
    });
    if (!json) {
      console.log(`  Indexed ${total.filesProcessed} files, ${total.symbolsIndexed} symbols`);
      for (const w of warnings) console.log(`  ${w}`);
    }

    const proposal = proposeBuildingBlocks(db, {
      service: options.service,
      maxBlocks: options.maxBlocks,
    });

    if (proposal.blocks.length === 0) {
      const msg =
        "No building blocks could be proposed — no indexed symbols. Ensure the project has a tsconfig (or configured services) and try again.";
      if (json) console.log(JSON.stringify({ error: msg, proposal }));
      else console.log(msg);
      return;
    }

    const markdown = proposalToBuildingBlocksMarkdown(proposal, new Date().toISOString());

    if (json) {
      console.log(JSON.stringify(proposal, null, 2));
    } else {
      printProposal(proposal);
    }

    if (options.apply) {
      // Overwrite the building blocks doc and reload
      const blocksPath = join(dir, ".arcbridge", "arc42", "05-building-blocks.md");
      atomicWriteFileSync(blocksPath, markdown);
      refreshFromDocs(db, dir);

      // Confirm the inverse property: no undocumented modules remain
      const driftOpts: DriftOptions = {
        projectType: config.config?.project_type,
        ignorePaths: config.config?.drift?.ignore_paths,
      };
      const undoc = detectDrift(db, driftOpts).filter((e) => e.kind === "undocumented_module");
      if (!json) {
        console.log(`\nApplied to .arcbridge/arc42/05-building-blocks.md.`);
        console.log(
          undoc.length === 0
            ? "  Every indexed file is now mapped to a block (0 undocumented modules)."
            : `  Note: ${undoc.length} file(s) still unmapped — review the building blocks.`,
        );
        console.log("  Review and refine responsibilities, then commit `.arcbridge/`.");
      }
    } else {
      // Write a reviewable proposal alongside, don't touch the live doc
      const proposalsDir = join(dir, ".arcbridge", "proposals");
      mkdirSync(proposalsDir, { recursive: true });
      const out = join(proposalsDir, "building-blocks.md");
      atomicWriteFileSync(out, markdown);
      if (!json) {
        console.log(`\nWrote proposal to .arcbridge/proposals/building-blocks.md (not applied).`);
        console.log("  Review it, then re-run with --apply to replace your building blocks.");
      }
    }
  } finally {
    db.close();
  }
}

function printProposal(proposal: AdoptProposal): void {
  console.log(
    `\nProposed ${proposal.blocks.length} building block(s) from ${proposal.stats.files} files, ` +
      `${proposal.stats.edges} dependency edges:\n`,
  );
  for (const b of proposal.blocks) {
    const deps = b.interfaces.length ? ` → ${b.interfaces.join(", ")}` : "";
    console.log(`  ${b.id}  [${b.service}]  ${b.evidence.fileCount} files  (${b.confidence})${deps}`);
    console.log(`      ${b.code_paths.map((p) => p || ".").join(", ")}`);
  }
  if (proposal.unassigned.length) {
    console.log(`\n  ${proposal.unassigned.length} file(s) unassigned.`);
  }
}
