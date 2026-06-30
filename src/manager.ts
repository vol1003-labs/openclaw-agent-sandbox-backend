import type { SandboxBackendManager } from "openclaw/plugin-sdk/sandbox";
import type { AgentSandboxPluginConfig } from "./config.js";
import { isClaimReady, type SandboxK8sApi } from "./k8s-client.js";

export function createAgentSandboxBackendManager(deps: {
  pluginConfig: AgentSandboxPluginConfig;
  k8s: SandboxK8sApi;
}): SandboxBackendManager {
  const ns = deps.pluginConfig.namespace;

  return {
    async describeRuntime({ entry }) {
      const claim = await deps.k8s.getClaim(ns, entry.containerName);
      return {
        // Existence alone is not liveness: a dead Pod is never recreated and the
        // claim lingers with Ready=False, so gate on the forwarded Ready condition.
        running: claim != null && isClaimReady(claim),
        actualConfigLabel: entry.image,
        configLabelMatch: entry.image === deps.pluginConfig.warmPool,
      };
    },
    async removeRuntime({ entry }) {
      await deps.k8s.deleteClaim(ns, entry.containerName); // NotFound-idempotent in the client
    },
  };
}
