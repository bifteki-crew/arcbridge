# @arcbridge/adapters

Platform adapters for ArcBridge — generate AI agent configurations for Claude Code and GitHub Copilot.

## Install

```bash
npm install @arcbridge/adapters
```

## What It Does

Translates ArcBridge's canonical agent role definitions (`.arcbridge/agents/*.md`) into platform-specific configurations:

- **Claude Code** — Generates `CLAUDE.md` project instructions and `.claude/agents/*.md` agent files
- **GitHub Copilot** — Generates `.github/copilot-instructions.md` and `.github/agents/*.md` agent files

## Usage

```typescript
import { getAdapter, ClaudeAdapter, CopilotAdapter } from "@arcbridge/adapters";

// By name
const adapter = getAdapter("claude"); // or "copilot"
const files = adapter.generate(projectRoot, roles, projectName);
// files: { path: string, content: string }[]

// Or directly
const claude = new ClaudeAdapter();
const copilot = new CopilotAdapter();
```

Each adapter implements the `PlatformAdapter` interface:

```typescript
interface PlatformAdapter {
  generate(
    projectRoot: string,
    roles: AgentRole[],
    projectName: string,
  ): { path: string; content: string }[];
}
```

## Supported Platforms

| Platform | Output Files |
|----------|-------------|
| Claude Code | `CLAUDE.md`, `.claude/agents/*.md` |
| GitHub Copilot | `.github/copilot-instructions.md`, `.github/agents/*.md` |

## License

[MIT](../../LICENSE)
