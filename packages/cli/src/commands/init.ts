import { resolve, basename, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import {
  generateConfig,
  generateArc42,
  generatePlan,
  generateAgentRoles,
  generateDatabase,
  generateSyncFiles,
  indexProject,
  type InitProjectInput,
} from "@arcbridge/core";
import { getAdapter } from "@arcbridge/adapters";

interface InitOptions {
  name?: string;
  template?: string;
  platforms?: string[];
  spec?: string;
}

type ProjectTemplate = "nextjs-app-router" | "react-vite" | "api-service";

interface DetectedInfo {
  name: string;
  template: ProjectTemplate;
  nameSource: string;
  templateSource: string;
}

const VALID_TEMPLATES: ProjectTemplate[] = [
  "nextjs-app-router",
  "react-vite",
  "api-service",
];

/**
 * Auto-detect project info from package.json and dependencies.
 */
function detectProjectInfo(projectRoot: string): DetectedInfo {
  const fallbackName = basename(projectRoot);
  let name = fallbackName;
  let nameSource = "directory name";
  let template: ProjectTemplate = "nextjs-app-router";
  let templateSource = "default";

  const pkgPath = join(projectRoot, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
        name?: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };

      if (pkg.name) {
        name = pkg.name;
        nameSource = "package.json";
      }

      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };

      if (allDeps["next"]) {
        template = "nextjs-app-router";
        templateSource = "detected (next in dependencies)";
      } else if (allDeps["vite"] && allDeps["react"]) {
        template = "react-vite";
        templateSource = "detected (vite + react in dependencies)";
      } else if (
        allDeps["express"] ||
        allDeps["fastify"] ||
        allDeps["hono"] ||
        allDeps["@hono/node-server"]
      ) {
        template = "api-service";
        templateSource = "detected (server framework in dependencies)";
      }
    } catch {
      // Ignore parse errors
    }
  }

  return { name, template, nameSource, templateSource };
}

export async function init(
  dir: string,
  options: InitOptions,
  json: boolean,
): Promise<void> {
  const projectRoot = resolve(dir);

  // Check if already initialized
  if (existsSync(join(projectRoot, ".arcbridge", "config.yaml"))) {
    const msg = "ArcBridge is already initialized in this directory. Use `arcbridge status` to see current state.";
    if (json) {
      console.log(JSON.stringify({ error: msg }));
    } else {
      console.error(msg);
    }
    process.exitCode = 1;
    return;
  }

  // Detect project info
  const detected = detectProjectInfo(projectRoot);

  // Apply overrides from flags
  const projectName = options.name ?? detected.name;
  const templateStr = options.template ?? detected.template;
  const platforms = options.platforms ?? ["claude"];

  if (!VALID_TEMPLATES.includes(templateStr as ProjectTemplate)) {
    const msg = `Unknown template "${templateStr}". Valid values: ${VALID_TEMPLATES.join(", ")}`;
    if (json) {
      console.log(JSON.stringify({ error: msg }));
    } else {
      console.error(`Error: ${msg}`);
    }
    process.exitCode = 1;
    return;
  }

  const template = templateStr as ProjectTemplate;

  // Show what we detected
  if (!json) {
    console.log(`Initializing ArcBridge in ${projectRoot}\n`);
    console.log(`  Project:  ${projectName} (${detected.nameSource})`);
    console.log(`  Template: ${template} (${detected.templateSource})`);
    console.log(`  Platform: ${platforms.join(", ")}`);
    if (options.spec) {
      console.log(`  Spec:     ${options.spec}`);
    }
    console.log();
  }

  const input: InitProjectInput = {
    name: projectName,
    template,
    features: [],
    quality_priorities: ["security", "performance", "accessibility"],
    platforms,
  };

  // 1. Generate config
  if (!json) console.log("Creating .arcbridge/config.yaml...");
  const config = generateConfig(projectRoot, input);

  // 2. Generate arc42 documentation
  if (!json) console.log("Creating arc42 documentation...");
  generateArc42(projectRoot, input);

  // 3. Generate phase plan
  if (!json) console.log("Creating phase plan...");
  generatePlan(projectRoot, input);

  // 4. Generate agent roles
  if (!json) console.log("Creating agent roles...");
  const roles = generateAgentRoles(projectRoot);

  // 5. Initialize database from generated files
  if (!json) console.log("Initializing database...");
  const { db, warnings } = generateDatabase(projectRoot, input);

  // 6. Generate sync loop files
  if (!json) console.log("Creating sync triggers...");
  const syncFiles = generateSyncFiles(projectRoot, config);

  // 7. Generate platform-specific configs
  if (!json) console.log("Generating platform configs...");
  const platformWarnings: string[] = [];
  for (const platform of platforms) {
    try {
      const adapter = getAdapter(platform);
      adapter.generateProjectConfig(projectRoot, config);
      adapter.generateAgentConfigs(projectRoot, roles);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      platformWarnings.push(`Platform '${platform}': ${msg}`);
    }
  }

  // 8. Copy spec file into .arcbridge/ if provided
  if (options.spec) {
    const specPath = resolve(options.spec);
    if (existsSync(specPath)) {
      const specContent = readFileSync(specPath, "utf-8");
      const { writeFileSync } = await import("node:fs");
      writeFileSync(join(projectRoot, ".arcbridge", "spec.md"), specContent, "utf-8");
      if (!json) console.log("Copied spec file to .arcbridge/spec.md");
    } else {
      platformWarnings.push(`Spec file not found: ${specPath}`);
    }
  }

  // 9. Index TypeScript symbols (if tsconfig exists)
  let indexResult: {
    filesProcessed: number;
    symbolsIndexed: number;
    dependenciesIndexed: number;
    componentsAnalyzed: number;
    routesAnalyzed: number;
  } | null = null;
  try {
    if (!json) console.log("Indexing codebase...");
    const result = indexProject(db, { projectRoot });
    indexResult = {
      filesProcessed: result.filesProcessed,
      symbolsIndexed: result.symbolsIndexed,
      dependenciesIndexed: result.dependenciesIndexed,
      componentsAnalyzed: result.componentsAnalyzed,
      routesAnalyzed: result.routesAnalyzed,
    };
  } catch {
    // Indexing is optional — project may not have tsconfig.json yet
  }

  // Get counts
  const blockCount = db
    .prepare("SELECT COUNT(*) as count FROM building_blocks")
    .get() as { count: number };
  const scenarioCount = db
    .prepare("SELECT COUNT(*) as count FROM quality_scenarios")
    .get() as { count: number };
  const phaseCount = db
    .prepare("SELECT COUNT(*) as count FROM phases")
    .get() as { count: number };
  const taskCount = db
    .prepare("SELECT COUNT(*) as count FROM tasks")
    .get() as { count: number };

  db.close();

  const allWarnings = [...warnings, ...platformWarnings];

  if (json) {
    console.log(
      JSON.stringify(
        {
          name: projectName,
          template,
          platforms,
          blocks: blockCount.count,
          scenarios: scenarioCount.count,
          phases: phaseCount.count,
          tasks: taskCount.count,
          roles: roles.length,
          index: indexResult,
          syncFiles,
          warnings: allWarnings,
        },
        null,
        2,
      ),
    );
  } else {
    console.log("\nArcBridge initialized successfully!\n");
    console.log(`  Building blocks:    ${blockCount.count}`);
    console.log(`  Quality scenarios:  ${scenarioCount.count}`);
    console.log(`  Phases:             ${phaseCount.count}`);
    console.log(`  Tasks:              ${taskCount.count}`);
    console.log(`  Agent roles:        ${roles.length}`);
    if (indexResult) {
      console.log(
        `  Indexed:            ${indexResult.filesProcessed} files, ${indexResult.symbolsIndexed} symbols`,
      );
    } else {
      console.log("  Indexed:            skipped (no tsconfig.json)");
    }

    if (allWarnings.length > 0) {
      console.log("\nWarnings:");
      for (const w of allWarnings) {
        console.log(`  - ${w}`);
      }
    }

    console.log("\nNext steps:");
    console.log("  1. Review .arcbridge/config.yaml and adjust as needed");
    console.log("  2. Start your AI agent (e.g. Claude Code) in this directory");
    console.log("  3. The agent will see the architecture context and can help");
    console.log("     refine building blocks, quality scenarios, and the plan");
    console.log("  4. Run `arcbridge sync` periodically to keep docs in sync with code");
  }
}
