import {
  ASSIGNED_SANDBOX_NAME_ANNOTATION,
  MANAGED_BY_LABEL,
  MANAGED_BY_VALUE,
  SANDBOX_CLAIM_GROUP,
  SANDBOX_CLAIM_VERSION,
  SANDBOX_POD_NAME_ANNOTATION,
  SCOPE_KEY_ANNOTATION,
  SCOPE_KEY_LABEL,
} from "./constants.js";
import { toLabelSafe } from "./names.js";

export type SandboxClaimManifest = {
  apiVersion: string;
  kind: "SandboxClaim";
  metadata: {
    name: string;
    namespace: string;
    labels: Record<string, string>;
    annotations: Record<string, string>;
  };
  spec: {
    warmPoolRef: { name: string };
    lifecycle: { shutdownTime: string; shutdownPolicy: "Delete" };
  };
};

export type ClaimLike = {
  metadata?: { annotations?: Record<string, string> };
  spec?: { lifecycle?: { shutdownTime?: string } };
};

export type SandboxLike = {
  metadata?: { name?: string; annotations?: Record<string, string> };
};

export function computeRfc3339(now: Date, plusSeconds: number): string {
  return new Date(now.getTime() + plusSeconds * 1000).toISOString();
}

export function buildClaimManifest(p: {
  name: string;
  namespace: string;
  warmPool: string;
  scopeKey: string;
  shutdownTimeRfc3339: string;
}): SandboxClaimManifest {
  return {
    apiVersion: `${SANDBOX_CLAIM_GROUP}/${SANDBOX_CLAIM_VERSION}`,
    kind: "SandboxClaim",
    metadata: {
      name: p.name,
      namespace: p.namespace,
      labels: {
        [MANAGED_BY_LABEL]: MANAGED_BY_VALUE,
        [SCOPE_KEY_LABEL]: toLabelSafe(p.scopeKey),
      },
      annotations: { [SCOPE_KEY_ANNOTATION]: p.scopeKey },
    },
    spec: {
      warmPoolRef: { name: p.warmPool },
      lifecycle: { shutdownTime: p.shutdownTimeRfc3339, shutdownPolicy: "Delete" },
    },
  };
}

export function buildShutdownPatch(shutdownTimeRfc3339: string): Record<string, unknown> {
  return { spec: { lifecycle: { shutdownTime: shutdownTimeRfc3339 } } };
}

export function readAssignedSandboxName(claim: ClaimLike): string | undefined {
  return claim.metadata?.annotations?.[ASSIGNED_SANDBOX_NAME_ANNOTATION];
}

/**
 * Resolve the Pod name for a bound Sandbox, mirroring the controller's
 * resolvePodName: the `agents.x-k8s.io/pod-name` annotation if present (warm-pool
 * adoption), otherwise the Sandbox's own name.
 */
export function resolvePodName(sandbox: SandboxLike): string | undefined {
  return sandbox.metadata?.annotations?.[SANDBOX_POD_NAME_ANNOTATION] ?? sandbox.metadata?.name;
}
