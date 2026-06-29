import type { SandboxBackendRegistration } from "openclaw/plugin-sdk/sandbox";
import type { AgentSandboxPluginConfig } from "./config.js";
import { createAgentSandboxBackendFactory } from "./factory.js";
import { createAgentSandboxBackendManager } from "./manager.js";
import type { SandboxK8sApi } from "./k8s-client.js";

export function buildRegistration(deps: {
  pluginConfig: AgentSandboxPluginConfig;
  k8s: SandboxK8sApi;
  wrapperPath: string;
}): SandboxBackendRegistration {
  return {
    factory: createAgentSandboxBackendFactory({ pluginConfig: deps.pluginConfig, k8s: deps.k8s, wrapperPath: deps.wrapperPath }),
    manager: createAgentSandboxBackendManager({ pluginConfig: deps.pluginConfig, k8s: deps.k8s }),
    resolveWorkdir: () => deps.pluginConfig.workdir,
  };
}
