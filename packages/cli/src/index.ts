import { resolve } from "node:path";
import { sync } from "./commands/sync.js";
import { status } from "./commands/status.js";
import { drift } from "./commands/drift.js";

const USAGE = `Usage: archlens <command> [options]

Commands:
  sync       Run the sync loop: reindex, detect drift, infer tasks, propose updates
  status     Show project status (phase, tasks, drift)
  drift      Check for architecture drift

Options:
  --dir <path>    Project directory (default: current directory)
  --json          Output as JSON (for CI integration)
  --help          Show this help message
  --version       Show version
`;

function parseArgs(args: string[]): {
  command: string | null;
  dir: string;
  json: boolean;
} {
  let command: string | null = null;
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
    }
  }

  return { command, dir, json };
}

async function main(): Promise<void> {
  const { command, dir, json } = parseArgs(process.argv.slice(2));

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
