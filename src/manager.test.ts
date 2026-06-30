import { describe, expect, it, vi } from "vitest";
import { resolveAgentSandboxPluginConfig } from "./config.js";
import type { SandboxK8sApi } from "./k8s-client.js";
import { createAgentSandboxBackendManager } from "./manager.js";

const cfg = resolveAgentSandboxPluginConfig(undefined);
const entry = {
  containerName: "agent-sandbox-coding-deadbeef",
  sessionKey: "agent:coding",
  createdAtMs: 0,
  lastUsedAtMs: 0,
  image: "openclaw-runner",
} as any;

function fakeK8s(over: Partial<SandboxK8sApi>): SandboxK8sApi {
  return {
    getClaim: async () => null,
    createClaim: async () => ({}) as any,
    patchClaim: async () => {},
    deleteClaim: async () => {},
    getPod: async () => null,
    ...over,
  };
}

describe("describeRuntime", () => {
  it("running=false and NotFound treated as gone", async () => {
    const mgr = createAgentSandboxBackendManager({
      pluginConfig: cfg,
      k8s: fakeK8s({ getClaim: async () => null }),
    });
    const info = await mgr.describeRuntime({ entry, config: {} });
    expect(info.running).toBe(false);
    expect(info.configLabelMatch).toBe(true); // entry.image === warmPool
  });
  it("running=true when the claim exists", async () => {
    const mgr = createAgentSandboxBackendManager({
      pluginConfig: cfg,
      k8s: fakeK8s({ getClaim: async () => ({ metadata: { name: entry.containerName } }) as any }),
    });
    expect((await mgr.describeRuntime({ entry, config: {} })).running).toBe(true);
  });
});

describe("removeRuntime", () => {
  it("deletes the claim unconditionally", async () => {
    const deleteClaim = vi.fn(async () => {});
    const mgr = createAgentSandboxBackendManager({
      pluginConfig: cfg,
      k8s: fakeK8s({ deleteClaim }),
    });
    await mgr.removeRuntime({ entry, config: {} });
    expect(deleteClaim).toHaveBeenCalledWith(cfg.namespace, entry.containerName);
  });
  it("is idempotent when the claim is already gone (NotFound-idempotent client)", async () => {
    const deleteClaim = vi.fn(async () => {});
    const mgr = createAgentSandboxBackendManager({
      pluginConfig: cfg,
      k8s: fakeK8s({ deleteClaim }),
    });
    await expect(mgr.removeRuntime({ entry, config: {} })).resolves.toBeUndefined();
    expect(deleteClaim).toHaveBeenCalledOnce();
  });
});
