import type { AgentRole, ArcBridgeConfig } from "@arcbridge/core";

export interface AdapterOptions {
  /** Force-regenerate files that would normally be preserved */
  force?: boolean;
}

export interface PlatformAdapter {
  platform: string;
  generateProjectConfig(
    targetDir: string,
    config: ArcBridgeConfig,
    options?: AdapterOptions,
  ): void;
  generateAgentConfigs(
    targetDir: string,
    roles: AgentRole[],
    options?: AdapterOptions,
  ): void;
}
