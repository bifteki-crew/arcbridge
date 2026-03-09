export type { PlatformAdapter } from "./types.js";
export { ClaudeAdapter } from "./claude/claude-adapter.js";
export { CopilotAdapter } from "./copilot/copilot-adapter.js";

import type { PlatformAdapter } from "./types.js";
import { ClaudeAdapter } from "./claude/claude-adapter.js";
import { CopilotAdapter } from "./copilot/copilot-adapter.js";

const adapters: Record<string, () => PlatformAdapter> = {
  claude: () => new ClaudeAdapter(),
  copilot: () => new CopilotAdapter(),
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
