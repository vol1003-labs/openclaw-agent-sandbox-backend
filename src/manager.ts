import type { SandboxBackendManager } from "openclaw/plugin-sdk/sandbox";
import type { AgentSandboxPluginConfig } from "./config.js";
import type { SandboxK8sApi } from "./k8s-client.js";

export function createAgentSandboxBackendManager(deps: {
  pluginConfig: AgentSandboxPluginConfig;
  k8s: SandboxK8sApi;
}): SandboxBackendManager {
  const ns = deps.pluginConfig.namespace;

  return {
    async describeRuntime({ entry }) {
      const claim = await deps.k8s.getClaim(ns, entry.containerName);
      return {
        running: claim != null,
        actualConfigLabel: entry.image,
        configLabelMatch: entry.image === deps.pluginConfig.warmPool,
      };
    },
    async removeRuntime({ entry }) {
      await deps.k8s.deleteClaim(ns, entry.containerName); // NotFound-idempotent in the client
    },
  };
}
