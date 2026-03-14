import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { stringify } from "yaml";
import type { InitProjectInput } from "../templates/types.js";
import { introductionTemplate } from "../templates/arc42/01-introduction.js";
import { contextTemplate } from "../templates/arc42/03-context.js";
import { buildingBlocksTemplate } from "../templates/arc42/05-building-blocks.js";
import { runtimeViewsTemplate } from "../templates/arc42/06-runtime-views.js";
import { deploymentTemplate } from "../templates/arc42/07-deployment.js";
import { firstAdrTemplate } from "../templates/arc42/09-decisions.js";
import { qualityScenariosTemplate } from "../templates/arc42/10-quality-scenarios.js";
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
    { file: "03-context.md", template: contextTemplate },
    { file: "05-building-blocks.md", template: buildingBlocksTemplate },
    { file: "06-runtime-views.md", template: runtimeViewsTemplate },
    { file: "07-deployment.md", template: deploymentTemplate },
    { file: "11-risks-debt.md", template: risksDebtTemplate },
  ];

  for (const { file, template } of sections) {
    const { frontmatter, body } = template(input);
    writeMarkdownWithFrontmatter(join(arc42Dir, file), frontmatter, body);
  }

  // ADR (first decision)
  const adr = firstAdrTemplate(input);
  writeMarkdownWithFrontmatter(
    join(decisionsDir, "001-nextjs-app-router.md"),
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
