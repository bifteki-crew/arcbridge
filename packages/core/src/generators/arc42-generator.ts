import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { stringify } from "yaml";
import type { InitProjectInput } from "../templates/types.js";
import { introductionTemplate } from "../templates/arc42/01-introduction.js";
import { constraintsTemplate } from "../templates/arc42/02-constraints.js";
import { contextTemplate } from "../templates/arc42/03-context.js";
import { solutionStrategyTemplate } from "../templates/arc42/04-solution-strategy.js";
import { buildingBlocksTemplate } from "../templates/arc42/05-building-blocks.js";
import { runtimeViewsTemplate } from "../templates/arc42/06-runtime-views.js";
import { deploymentTemplate } from "../templates/arc42/07-deployment.js";
import { firstAdrTemplate } from "../templates/arc42/09-decisions.js";
import { qualityScenariosTemplate } from "../templates/arc42/10-quality-scenarios.js";
import { crosscuttingTemplate } from "../templates/arc42/08-crosscutting.js";
import { risksDebtTemplate } from "../templates/arc42/11-risks-debt.js";

function writeMarkdownWithFrontmatter(
  filePath: string,
  frontmatter: Record<string, unknown>,
  body: string,
): void {
  const content = matter.stringify(body, frontmatter);
  writeFileSync(filePath, content, "utf-8");
}

export function generateArc42(
  targetDir: string,
  input: InitProjectInput,
): void {
  const arc42Dir = join(targetDir, ".arcbridge", "arc42");
  const decisionsDir = join(arc42Dir, "09-decisions");

  mkdirSync(arc42Dir, { recursive: true });
  mkdirSync(decisionsDir, { recursive: true });

  // Standard markdown sections
  const sections = [
    { file: "01-introduction.md", template: introductionTemplate },
    { file: "02-constraints.md", template: constraintsTemplate },
    { file: "03-context.md", template: contextTemplate },
    { file: "04-solution-strategy.md", template: solutionStrategyTemplate },
    { file: "05-building-blocks.md", template: buildingBlocksTemplate },
    { file: "06-runtime-views.md", template: runtimeViewsTemplate },
    { file: "07-deployment.md", template: deploymentTemplate },
    { file: "08-crosscutting.md", template: crosscuttingTemplate },
    { file: "11-risks-debt.md", template: risksDebtTemplate },
  ];

  const inputWithRoot = { ...input, projectRoot: targetDir };
  for (const { file, template } of sections) {
    const { frontmatter, body } = template(inputWithRoot);
    writeMarkdownWithFrontmatter(join(arc42Dir, file), frontmatter, body);
  }

  // ADR (first decision)
  const adr = firstAdrTemplate(inputWithRoot);
  writeMarkdownWithFrontmatter(
    join(decisionsDir, adr.filename),
    adr.frontmatter,
    adr.body,
  );

  // Quality scenarios (YAML, not markdown)
  const qualityScenarios = qualityScenariosTemplate(input);
  writeFileSync(
    join(arc42Dir, "10-quality-scenarios.yaml"),
    stringify(qualityScenarios),
    "utf-8",
  );
}
