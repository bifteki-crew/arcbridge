import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { sync } from "./commands/sync.js";
import { status } from "./commands/status.js";
import { drift } from "./commands/drift.js";
import { init } from "./commands/init.js";
import { generateConfigs } from "./commands/generate-configs.js";
import { updateTask } from "./commands/update-task.js";
import { refresh } from "./commands/refresh.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8"),
) as { version: string };

const USAGE = `Usage: arcbridge <command> [options]

Commands:
  init              Initialize ArcBridge in a project directory
  sync              Run the sync loop: reindex, detect drift, infer tasks, propose updates
  status            Show project status (phase, tasks, drift)
  drift             Check for architecture drift
  refresh           Rebuild the database from YAML/markdown sources
  update-task       Update a task's status (e.g. arcbridge update-task task-1.1 done)
  generate-configs  Regenerate platform agent configs from .arcbridge/agents/

Options:
  --dir <path>       Project directory (default: current directory)
  --json             Output as JSON (for CI integration)
  --help             Show this help message
  --version          Show version

Init options:
  --name <name>      Project name (default: auto-detect from package.json)
  --template <type>  Project template: nextjs-app-router, react-vite, api-service
  --platform <name>  Target platform (can be repeated, default: claude)
  --spec <file>      Path to a requirements/spec file to include
`;

interface ParsedArgs {
  command: string | null;
  positional: string[];
  dir: string;
  json: boolean;
  name?: string;
  template?: string;
  platforms?: string[];
  spec?: string;
}

function parseArgs(args: string[]): ParsedArgs {
  let command: string | null = null;
  const positional: string[] = [];
  let dir = process.cwd();
  let json = false;
  let name: string | undefined;
  let template: string | undefined;
  const platforms: string[] = [];
  let spec: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--dir" && i + 1 < args.length) {
      dir = resolve(args[++i]!);
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--name" && i + 1 < args.length) {
      name = args[++i]!;
    } else if (arg === "--template" && i + 1 < args.length) {
      template = args[++i]!;
    } else if (arg === "--platform" && i + 1 < args.length) {
      platforms.push(args[++i]!);
    } else if (arg === "--spec" && i + 1 < args.length) {
      spec = args[++i]!;
    } else if (arg === "--help" || arg === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else if (arg === "--version" || arg === "-v") {
      console.log(`arcbridge ${pkg.version}`);
      process.exit(0);
    } else if (!arg.startsWith("-") && !command) {
      command = arg;
    } else if (!arg.startsWith("-") && command) {
      positional.push(arg);
    }
  }

  return {
    command,
    positional,
    dir,
    json,
    name,
    template,
    platforms: platforms.length > 0 ? platforms : undefined,
    spec,
  };
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  const { command, positional, dir, json } = parsed;

  if (!command) {
    console.log(USAGE);
    process.exit(1);
  }

  try {
    switch (command) {
      case "init":
        await init(dir, {
          name: parsed.name,
          template: parsed.template,
          platforms: parsed.platforms,
          spec: parsed.spec,
        }, json);
        break;
      case "sync":
        await sync(dir, json);
        break;
      case "status":
        await status(dir, json);
        break;
      case "drift":
        await drift(dir, json);
        break;
      case "refresh":
        await refresh(dir, json);
        break;
      case "update-task": {
        const [taskId, taskStatus] = positional;
        if (!taskId || !taskStatus) {
          console.error("Usage: arcbridge update-task <task-id> <status>");
          console.error("Status values: todo, in-progress, done, blocked");
          process.exit(1);
        }
        await updateTask(dir, taskId, taskStatus, json);
        break;
      }
      case "generate-configs":
        await generateConfigs(dir, json);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        console.log(USAGE);
        process.exit(1);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (json) {
      console.log(JSON.stringify({ error: message }));
    } else {
      console.error(`Error: ${message}`);
    }
    process.exit(1);
  }
}

main();
