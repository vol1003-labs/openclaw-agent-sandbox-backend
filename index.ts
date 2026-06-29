import { fileURLToPath } from "node:url";
import { definePluginEntry, type OpenClawPluginApi, type OpenClawPluginDefinition } from "openclaw/plugin-sdk/plugin-entry";
import { registerSandboxBackend } from "openclaw/plugin-sdk/sandbox";
import { BACKEND_ID } from "./src/constants.js";
import { resolveAgentSandboxPluginConfig } from "./src/config.js";
import { createSandboxK8sApi } from "./src/k8s-client.js";
import { buildRegistration } from "./src/registration.js";

export function register(api: OpenClawPluginApi): void {
  if (api.registrationMode !== "full") return;
  const pluginConfig = resolveAgentSandboxPluginConfig(api.pluginConfig);
  const wrapperPath = fileURLToPath(new URL("./src/exec-wrapper.js", import.meta.url));
  registerSandboxBackend(BACKEND_ID, buildRegistration({ pluginConfig, k8s: createSandboxK8sApi(), wrapperPath }));
}

const pluginEntry: OpenClawPluginDefinition = definePluginEntry({
  id: BACKEND_ID,
  name: "Agent Sandbox (Kubernetes/gVisor)",
  description: "Runs agent terminal/exec inside gVisor agent-sandbox Pods via in-cluster pods/exec.",
  register,
});

export default pluginEntry;
