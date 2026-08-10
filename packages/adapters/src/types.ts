import type { AgentRole, ArcBridgeConfig } from "@arcbridge/core";

export interface AdapterOptions {
  /** Force-regenerate files that would normally be preserved */
  force?: boolean;
  /**
   * Pre-rendered architecture map, embedded into the instruction file so an agent
   * has the block layout without having to ask for it. Rendered by the caller
   * (which has the database) to keep adapters free of storage concerns.
   */
  architecture?: string;
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
