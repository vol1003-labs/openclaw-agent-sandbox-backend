import {
  ACTIVE_LEASE_ANNOTATION,
  ASSIGNED_SANDBOX_NAME_ANNOTATION,
  MANAGED_BY_LABEL,
  SANDBOX_CLAIM_GROUP,
  SANDBOX_CLAIM_VERSION,
  SCOPE_KEY_ANNOTATION,
} from "./constants.js";

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
      labels: { [MANAGED_BY_LABEL]: "openclaw-agent-sandbox-backend" },
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

export function buildLeasePatch(p: {
  shutdownTimeRfc3339: string;
  leaseUntilRfc3339: string;
}): Record<string, unknown> {
  return {
    metadata: { annotations: { [ACTIVE_LEASE_ANNOTATION]: p.leaseUntilRfc3339 } },
    spec: { lifecycle: { shutdownTime: p.shutdownTimeRfc3339 } },
  };
}

export function buildLeaseReleasePatch(shutdownTimeRfc3339: string): Record<string, unknown> {
  // null value in a strategic/merge patch removes the annotation key.
  return {
    metadata: { annotations: { [ACTIVE_LEASE_ANNOTATION]: null } },
    spec: { lifecycle: { shutdownTime: shutdownTimeRfc3339 } },
  };
}

export function readAssignedSandboxName(claim: ClaimLike): string | undefined {
  return claim.metadata?.annotations?.[ASSIGNED_SANDBOX_NAME_ANNOTATION];
}

export function isClaimInUse(claim: ClaimLike, now: Date): boolean {
  const raw = claim.metadata?.annotations?.[ACTIVE_LEASE_ANNOTATION];
  if (!raw) return false;
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return false;
  return t > now.getTime();
}
