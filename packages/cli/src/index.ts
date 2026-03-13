import { resolve } from "node:path";
import { sync } from "./commands/sync.js";
import { status } from "./commands/status.js";
import { drift } from "./commands/drift.js";
import { generateConfigs } from "./commands/generate-configs.js";
import { updateTask } from "./commands/update-task.js";

const USAGE = `Usage: archlens <command> [options]

Commands:
  sync              Run the sync loop: reindex, detect drift, infer tasks, propose updates
  status            Show project status (phase, tasks, drift)
  drift             Check for architecture drift
  update-task       Update a task's status (e.g. archlens update-task task-1.1 done)
  generate-configs  Regenerate platform agent configs from .archlens/agents/

Options:
  --dir <path>    Project directory (default: current directory)
  --json          Output as JSON (for CI integration)
  --help          Show this help message
  --version       Show version
`;

function parseArgs(args: string[]): {
  command: string | null;
  positional: string[];
  dir: string;
  json: boolean;
} {
  let command: string | null = null;
  const positional: string[] = [];
  let dir = process.cwd();
  let json = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--dir" && i + 1 < args.length) {
      dir = resolve(args[++i]!);
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else if (arg === "--version" || arg === "-v") {
      console.log("archlens 0.1.0");
      process.exit(0);
    } else if (!arg.startsWith("-") && !command) {
      command = arg;
    } else if (!arg.startsWith("-") && command) {
      positional.push(arg);
    }
  }

  return { command, positional, dir, json };
}

async function main(): Promise<void> {
  const { command, positional, dir, json } = parseArgs(process.argv.slice(2));

  if (!command) {
    console.log(USAGE);
    process.exit(1);
  }

  try {
    switch (command) {
      case "sync":
        await sync(dir, json);
        break;
      case "status":
        await status(dir, json);
        break;
      case "drift":
        await drift(dir, json);
        break;
      case "update-task": {
        const [taskId, taskStatus] = positional;
        if (!taskId || !taskStatus) {
          console.error("Usage: archlens update-task <task-id> <status>");
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
