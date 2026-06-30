import * as k8s from "@kubernetes/client-node";
import { SANDBOX_CLAIM_GROUP, SANDBOX_CLAIM_PLURAL, SANDBOX_CLAIM_VERSION } from "./constants.js";
import type { ClaimLike, SandboxClaimManifest } from "./lifecycle.js";

export type SandboxClaimObject = ClaimLike & {
  metadata: { name: string; namespace?: string; annotations?: Record<string, string> };
  status?: { conditions?: Array<{ type?: string; status?: string }> };
};

export type PodLike = {
  metadata?: { name?: string };
  status?: { phase?: string; conditions?: Array<{ type?: string; status?: string }> };
};

export class NotFoundError extends Error {}
export class QuotaExceededError extends Error {}
export class AlreadyExistsError extends Error {}

export function isPodReady(pod: PodLike): boolean {
  if (pod.status?.phase !== "Running") return false;
  return (pod.status.conditions ?? []).some((c) => c.type === "Ready" && c.status === "True");
}

/**
 * A SandboxClaim is "running" only when its forwarded Ready condition is True.
 * The controller does NOT recreate a dead Pod (singleton workload); the claim
 * lingers with Ready=False, so mere existence is not a liveness signal.
 */
export function isClaimReady(claim: {
  status?: { conditions?: Array<{ type?: string; status?: string }> };
}): boolean {
  return (claim.status?.conditions ?? []).some((c) => c.type === "Ready" && c.status === "True");
}

export function classifyK8sError(err: unknown): "notfound" | "quota" | "alreadyexists" | "other" {
  const e = err as {
    statusCode?: number;
    code?: number;
    response?: { statusCode?: number };
    message?: string;
    body?: unknown;
  };
  const status = e?.statusCode ?? e?.response?.statusCode ?? e?.code;
  if (status === 404) return "notfound";
  if (status === 409) return "alreadyexists";
  if (status === 403) {
    // 403 covers BOTH ResourceQuota violations and RBAC/admission denials;
    // only call it "quota" when the message says so, so an RBAC misconfig is
    // not mislabelled as quota-exceeded (acute during host environment RBAC wiring).
    const body = typeof e?.body === "string" ? e.body : e?.body ? JSON.stringify(e.body) : "";
    return /exceeded quota/i.test(`${e?.message ?? ""} ${body}`) ? "quota" : "other";
  }
  return "other";
}

export interface SandboxK8sApi {
  getClaim(ns: string, name: string): Promise<SandboxClaimObject | null>;
  createClaim(ns: string, manifest: SandboxClaimManifest): Promise<SandboxClaimObject>;
  patchClaim(ns: string, name: string, patch: Record<string, unknown>): Promise<void>;
  deleteClaim(ns: string, name: string): Promise<void>;
  getPod(ns: string, name: string): Promise<PodLike | null>;
}

export function createSandboxK8sApi(): SandboxK8sApi {
  const g = {
    group: SANDBOX_CLAIM_GROUP,
    version: SANDBOX_CLAIM_VERSION,
    plural: SANDBOX_CLAIM_PLURAL,
  };
  // Create the in-cluster clients lazily on first use so plugin (re-)registration
  // stays side-effect-free: no loadFromCluster() file reads until a sandbox is touched.
  // (OpenClaw rebuilds the whole plugin registry on any plugins.* config change.)
  let clients: { custom: k8s.CustomObjectsApi; core: k8s.CoreV1Api } | null = null;
  const get = () => {
    if (clients === null) {
      const kc = new k8s.KubeConfig();
      kc.loadFromCluster();
      clients = {
        custom: kc.makeApiClient(k8s.CustomObjectsApi),
        core: kc.makeApiClient(k8s.CoreV1Api),
      };
    }
    return clients;
  };

  return {
    async getClaim(ns, name) {
      const { custom } = get();
      try {
        const res = await custom.getNamespacedCustomObject({ ...g, namespace: ns, name });
        return res as unknown as SandboxClaimObject;
      } catch (err) {
        if (classifyK8sError(err) === "notfound") return null;
        throw err;
      }
    },

    async createClaim(ns, manifest) {
      const { custom } = get();
      try {
        const res = await custom.createNamespacedCustomObject({
          ...g,
          namespace: ns,
          body: manifest,
        });
        return res as unknown as SandboxClaimObject;
      } catch (err) {
        if (classifyK8sError(err) === "quota") {
          throw new QuotaExceededError(
            `ResourceQuota exceeded creating SandboxClaim ${manifest.metadata.name}`,
            { cause: err },
          );
        }
        if (classifyK8sError(err) === "alreadyexists") {
          throw new AlreadyExistsError(
            `SandboxClaim ${manifest.metadata.name} already exists (concurrent create race)`,
            { cause: err },
          );
        }
        throw err;
      }
    },

    async patchClaim(ns, name, patch) {
      const { custom } = get();
      await custom.patchNamespacedCustomObject(
        { ...g, namespace: ns, name, body: patch },
        k8s.setHeaderOptions("Content-Type", k8s.PatchStrategy.MergePatch),
      );
    },

    async deleteClaim(ns, name) {
      const { custom } = get();
      try {
        await custom.deleteNamespacedCustomObject({ ...g, namespace: ns, name });
      } catch (err) {
        if (classifyK8sError(err) === "notfound") return;
        throw err;
      }
    },

    async getPod(ns, name) {
      const { core } = get();
      try {
        const res = await core.readNamespacedPod({ namespace: ns, name });
        return res as unknown as PodLike;
      } catch (err) {
        if (classifyK8sError(err) === "notfound") return null;
        throw err;
      }
    },
  };
}
