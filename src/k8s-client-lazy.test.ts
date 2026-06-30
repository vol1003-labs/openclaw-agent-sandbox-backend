import { beforeEach, describe, expect, it, vi } from "vitest";

const loadFromCluster = vi.fn();
const readNamespacedPod = vi.fn(async () => ({ metadata: { name: "p" } }));
const makeApiClient = vi.fn(() => ({ readNamespacedPod }));

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

import { createSandboxK8sApi } from "./k8s-client.js";

describe("createSandboxK8sApi — lazy in-cluster client", () => {
  beforeEach(() => {
    loadFromCluster.mockClear();
    makeApiClient.mockClear();
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
});
