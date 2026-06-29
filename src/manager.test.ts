import { describe, it, expect, vi } from "vitest";
import { createAgentSandboxBackendManager } from "./manager.js";
import { resolveAgentSandboxPluginConfig } from "./config.js";
import { ACTIVE_LEASE_ANNOTATION } from "./constants.js";
import type { SandboxK8sApi } from "./k8s-client.js";

const cfg = resolveAgentSandboxPluginConfig(undefined);
const NOW = new Date("2026-06-29T12:00:00.000Z");
const entry = { containerName: "agent-sandbox-coding-deadbeef", sessionKey: "agent:coding", createdAtMs: 0, lastUsedAtMs: 0, image: "openclaw-runner" } as any;

function fakeK8s(over: Partial<SandboxK8sApi>): SandboxK8sApi {
  return { getClaim: async () => null, createClaim: async () => ({} as any), patchClaim: async () => {}, deleteClaim: async () => {}, getPod: async () => null, ...over };
}

describe("describeRuntime", () => {
  it("running=false and NotFound treated as gone", async () => {
    const mgr = createAgentSandboxBackendManager({ pluginConfig: cfg, k8s: fakeK8s({ getClaim: async () => null }), now: () => NOW });
    const info = await mgr.describeRuntime({ entry, config: {} });
    expect(info.running).toBe(false);
    expect(info.configLabelMatch).toBe(true); // entry.image === warmPool
  });
  it("running=true when the claim exists", async () => {
    const mgr = createAgentSandboxBackendManager({ pluginConfig: cfg, k8s: fakeK8s({ getClaim: async () => ({ metadata: { name: entry.containerName } } as any) }), now: () => NOW });
    expect((await mgr.describeRuntime({ entry, config: {} })).running).toBe(true);
  });
});

describe("removeRuntime", () => {
  it("deletes an idle claim", async () => {
    const deleteClaim = vi.fn(async () => {});
    const mgr = createAgentSandboxBackendManager({ pluginConfig: cfg, k8s: fakeK8s({ getClaim: async () => ({ metadata: { name: entry.containerName, annotations: {} } } as any), deleteClaim }), now: () => NOW });
    await mgr.removeRuntime({ entry, config: {} });
    expect(deleteClaim).toHaveBeenCalledWith(cfg.namespace, entry.containerName);
  });
  it("does NOT delete a claim whose lease is in the future (busy guard)", async () => {
    const deleteClaim = vi.fn();
    const mgr = createAgentSandboxBackendManager({
      pluginConfig: cfg,
      k8s: fakeK8s({ getClaim: async () => ({ metadata: { name: entry.containerName, annotations: { [ACTIVE_LEASE_ANNOTATION]: "2026-06-29T12:05:00.000Z" } } } as any), deleteClaim: deleteClaim as any }),
      now: () => NOW,
    });
    await mgr.removeRuntime({ entry, config: {} });
    expect(deleteClaim).not.toHaveBeenCalled();
  });
  it("is idempotent when the claim is already gone", async () => {
    const deleteClaim = vi.fn();
    const mgr = createAgentSandboxBackendManager({ pluginConfig: cfg, k8s: fakeK8s({ getClaim: async () => null, deleteClaim: deleteClaim as any }), now: () => NOW });
    await expect(mgr.removeRuntime({ entry, config: {} })).resolves.toBeUndefined();
    expect(deleteClaim).not.toHaveBeenCalled();
  });
});
