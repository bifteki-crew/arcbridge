import type { AgentRole, ArcBridgeConfig } from "@arcbridge/core";

export interface PlatformAdapter {
  platform: string;
  generateProjectConfig(
    targetDir: string,
    config: ArcBridgeConfig,
  ): void;
  generateAgentConfigs(
    targetDir: string,
    roles: AgentRole[],
  ): void;
}
