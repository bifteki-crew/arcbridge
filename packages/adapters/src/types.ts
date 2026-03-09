import type { AgentRole, ArchLensConfig } from "@archlens/core";

export interface PlatformAdapter {
  platform: string;
  generateProjectConfig(
    targetDir: string,
    config: ArchLensConfig,
  ): void;
  generateAgentConfigs(
    targetDir: string,
    roles: AgentRole[],
  ): void;
}
