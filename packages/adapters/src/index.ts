export type { PlatformAdapter, AdapterOptions } from "./types.js";
export { ClaudeAdapter } from "./claude/claude-adapter.js";
export { CopilotAdapter } from "./copilot/copilot-adapter.js";
export { CodexAdapter } from "./codex/codex-adapter.js";
export { GeminiAdapter } from "./gemini/gemini-adapter.js";

import type { PlatformAdapter } from "./types.js";
import { ClaudeAdapter } from "./claude/claude-adapter.js";
import { CopilotAdapter } from "./copilot/copilot-adapter.js";
import { CodexAdapter } from "./codex/codex-adapter.js";
import { GeminiAdapter } from "./gemini/gemini-adapter.js";

const adapters: Record<string, () => PlatformAdapter> = {
  claude: () => new ClaudeAdapter(),
  copilot: () => new CopilotAdapter(),
  codex: () => new CodexAdapter(),
  gemini: () => new GeminiAdapter(),
};

export function getAdapter(platform: string): PlatformAdapter {
  const factory = adapters[platform];
  if (!factory) {
    throw new Error(
      `Unknown platform: ${platform}. Available: ${Object.keys(adapters).join(", ")}`,
    );
  }
  return factory();
}
