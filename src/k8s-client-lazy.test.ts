import { beforeEach, describe, expect, it, vi } from "vitest";

const loadFromCluster = vi.fn();
const readNamespacedPod = vi.fn(async () => ({ metadata: { name: "p" } }));
const createNamespacedCustomObject = vi.fn();
const makeApiClient = vi.fn(() => ({ readNamespacedPod, createNamespacedCustomObject }));

vi.mock("@kubernetes/client-node", () => ({
  KubeConfig: class {
    loadFromCluster = loadFromCluster;
    makeApiClient = makeApiClient;
  },
  CustomObjectsApi: class {},
  CoreV1Api: class {},
  setHeaderOptions: vi.fn(),
  PatchStrategy: { MergePatch: "merge" },
}));

import { createSandboxK8sApi, QuotaExceededError } from "./k8s-client.js";
import type { SandboxClaimManifest } from "./lifecycle.js";

const manifest = { metadata: { name: "sb-x" } } as unknown as SandboxClaimManifest;

describe("createSandboxK8sApi — lazy in-cluster client", () => {
  beforeEach(() => {
    loadFromCluster.mockClear();
    makeApiClient.mockClear();
    createNamespacedCustomObject.mockReset();
  });

  it("does NOT loadFromCluster at construction (register stays side-effect-free)", () => {
    createSandboxK8sApi();
    expect(loadFromCluster).not.toHaveBeenCalled();
    expect(makeApiClient).not.toHaveBeenCalled();
  });

  it("loads on first method call and memoizes across calls", async () => {
    const api = createSandboxK8sApi();
    await api.getPod("ns", "p");
    await api.getPod("ns", "p2");
    expect(loadFromCluster).toHaveBeenCalledTimes(1);
  });

  it("createClaim wraps a quota-exceeded 403 as QuotaExceededError, preserving the cause", async () => {
    const err = { code: 403, message: "sandboxclaims is forbidden: exceeded quota: openclaw-rq" };
    createNamespacedCustomObject.mockRejectedValueOnce(err);
    const caught = await createSandboxK8sApi()
      .createClaim("ns", manifest)
      .catch((e) => e);
    expect(caught).toBeInstanceOf(QuotaExceededError);
    expect(caught.cause).toBe(err);
  });

  it("createClaim rethrows a non-quota 403 (RBAC) raw, not as QuotaExceededError", async () => {
    const err = { code: 403, message: 'sandboxclaims is forbidden: User "sa" cannot create' };
    createNamespacedCustomObject.mockRejectedValueOnce(err);
    const caught = await createSandboxK8sApi()
      .createClaim("ns", manifest)
      .catch((e) => e);
    expect(caught).toBe(err);
    expect(caught).not.toBeInstanceOf(QuotaExceededError);
  });
});
