import { describe, it, expect, vi } from "vitest";
import { createAgentSandboxBackendFactory } from "./factory.js";
import { resolveAgentSandboxPluginConfig } from "./config.js";
import { ASSIGNED_SANDBOX_NAME_ANNOTATION } from "./constants.js";
import type { SandboxK8sApi, SandboxClaimObject, PodLike } from "./k8s-client.js";

const cfg = resolveAgentSandboxPluginConfig({ readyTimeoutSeconds: 2, renewIntervalSeconds: 1 });
const createParams = {
  sessionKey: "agent:coding:main",
  scopeKey: "agent:coding",
  workspaceDir: "/ws",
  agentWorkspaceDir: "/ws/agent",
  cfg: { docker: { env: { FOO: "bar" }, image: "ignored" } } as any,
};

function fakeK8s(over: Partial<SandboxK8sApi>): SandboxK8sApi {
  return {
    getClaim: async () => null,
    createClaim: async (_ns: string, m: any) => ({ metadata: { name: m.metadata.name, annotations: {} } } as SandboxClaimObject),
    patchClaim: async () => {},
    deleteClaim: async () => {},
    getPod: async () => ({ status: { phase: "Running", conditions: [{ type: "Ready", status: "True" }] } } as PodLike),
    ...over,
  };
}

const handleStub = (args: any) => ({ id: "agent-sandbox", runtimeId: args.claimName, runtimeLabel: args.claimName, workdir: "/workspace", buildExecSpec: async () => ({ argv: [], env: {}, stdinMode: "pipe-open" as const }), runShellCommand: async () => ({ stdout: Buffer.from(""), stderr: Buffer.from(""), code: 0 }) });

it("creates a claim when none exists, waits for bound ready pod, returns handle with runtimeId=claimName", async () => {
  const createClaim = vi.fn(async (_ns: string, m: any) => ({ metadata: { name: m.metadata.name, annotations: { [ASSIGNED_SANDBOX_NAME_ANNOTATION]: "sb-1" } } }));
  // first getClaim returns null path: emulate not-exists then created with annotation
  const k8s2 = fakeK8s({
    getClaim: vi.fn().mockResolvedValueOnce(null).mockResolvedValue({ metadata: { name: "x", annotations: { [ASSIGNED_SANDBOX_NAME_ANNOTATION]: "sb-1" } } }) as any,
    createClaim,
  });
  const factory = createAgentSandboxBackendFactory({ pluginConfig: cfg, k8s: k8s2, wrapperPath: "/p/exec-wrapper.js", buildHandle: handleStub } as any);
  const handle = await factory(createParams as any);
  expect(createClaim).toHaveBeenCalledOnce();
  // buildClaimName("agent:coding") → "agent-sandbox-agent-coding-<hash>"
  expect(handle.runtimeId).toMatch(/^agent-sandbox-agent-coding-/);
  expect(handle.id).toBe("agent-sandbox");
});

it("adopts (patches shutdownTime) when the claim already exists, does NOT create", async () => {
  const createClaim = vi.fn();
  const patchClaim = vi.fn(async () => {});
  const k8s = fakeK8s({
    getClaim: async () => ({ metadata: { name: "x", annotations: { [ASSIGNED_SANDBOX_NAME_ANNOTATION]: "sb-1" } } } as any),
    createClaim: createClaim as any,
    patchClaim,
  });
  const factory = createAgentSandboxBackendFactory({ pluginConfig: cfg, k8s, wrapperPath: "/p", buildHandle: handleStub } as any);
  await factory(createParams as any);
  expect(createClaim).not.toHaveBeenCalled();
  expect(patchClaim).toHaveBeenCalled(); // adopt = extend shutdownTime
});

it("rolls back a self-created claim if the pod never becomes ready", async () => {
  const deleteClaim = vi.fn(async () => {});
  const k8s = fakeK8s({
    getClaim: vi.fn().mockResolvedValueOnce(null).mockResolvedValue({ metadata: { name: "x", annotations: {} } }) as any, // never gets sandbox-name
    getPod: async () => null,
    deleteClaim,
  });
  const factory = createAgentSandboxBackendFactory({ pluginConfig: cfg, k8s, wrapperPath: "/p", buildHandle: handleStub, sleep: async () => {}, now: () => new Date() } as any);
  await expect(factory(createParams as any)).rejects.toThrow(/ready|timeout/i);
  expect(deleteClaim).toHaveBeenCalledOnce(); // rolled back because WE created it
});

it("surfaces quota errors without rollback (nothing was created)", async () => {
  const { QuotaExceededError } = await import("./k8s-client.js");
  const deleteClaim = vi.fn();
  const k8s = fakeK8s({
    getClaim: async () => null,
    createClaim: async () => { throw new QuotaExceededError("quota"); },
    deleteClaim: deleteClaim as any,
  });
  const factory = createAgentSandboxBackendFactory({ pluginConfig: cfg, k8s, wrapperPath: "/p", buildHandle: handleStub } as any);
  await expect(factory(createParams as any)).rejects.toThrow(/quota/i);
  expect(deleteClaim).not.toHaveBeenCalled();
});
