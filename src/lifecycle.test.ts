import { describe, it, expect } from "vitest";
import {
  computeRfc3339,
  buildClaimManifest,
  buildShutdownPatch,
  buildLeasePatch,
  buildLeaseReleasePatch,
  readAssignedSandboxName,
  isClaimInUse,
} from "./lifecycle.js";
import { ACTIVE_LEASE_ANNOTATION, ASSIGNED_SANDBOX_NAME_ANNOTATION } from "./constants.js";

const NOW = new Date("2026-06-29T12:00:00.000Z");

describe("computeRfc3339", () => {
  it("adds seconds and emits RFC3339 Z", () => {
    expect(computeRfc3339(NOW, 1800)).toBe("2026-06-29T12:30:00.000Z");
  });
});

describe("buildClaimManifest", () => {
  it("targets the warmPool and sets Delete shutdown policy + shutdownTime", () => {
    const m = buildClaimManifest({
      name: "agent-sandbox-coding-deadbeef",
      namespace: "openclaw",
      warmPool: "openclaw-runner",
      scopeKey: "agent:coding",
      shutdownTimeRfc3339: "2026-06-29T12:30:00.000Z",
    });
    expect(m.apiVersion).toBe("extensions.agents.x-k8s.io/v1beta1");
    expect(m.kind).toBe("SandboxClaim");
    expect(m.metadata.name).toBe("agent-sandbox-coding-deadbeef");
    expect(m.metadata.namespace).toBe("openclaw");
    expect(m.spec.warmPoolRef.name).toBe("openclaw-runner");
    expect(m.spec.lifecycle.shutdownPolicy).toBe("Delete");
    expect(m.spec.lifecycle.shutdownTime).toBe("2026-06-29T12:30:00.000Z");
  });
});

describe("patches", () => {
  it("buildShutdownPatch sets only spec.lifecycle.shutdownTime", () => {
    expect(buildShutdownPatch("2026-06-29T12:30:00.000Z")).toEqual({
      spec: { lifecycle: { shutdownTime: "2026-06-29T12:30:00.000Z" } },
    });
  });
  it("buildLeasePatch sets shutdownTime and the lease annotation", () => {
    const p = buildLeasePatch({ shutdownTimeRfc3339: "A", leaseUntilRfc3339: "B" });
    expect(p).toEqual({
      metadata: { annotations: { [ACTIVE_LEASE_ANNOTATION]: "B" } },
      spec: { lifecycle: { shutdownTime: "A" } },
    });
  });
  it("buildLeaseReleasePatch clears the lease annotation with null", () => {
    const p = buildLeaseReleasePatch("A") as any;
    expect(p.metadata.annotations[ACTIVE_LEASE_ANNOTATION]).toBeNull();
    expect(p.spec.lifecycle.shutdownTime).toBe("A");
  });
});

describe("readAssignedSandboxName", () => {
  it("returns the bound sandbox name annotation", () => {
    expect(
      readAssignedSandboxName({ metadata: { annotations: { [ASSIGNED_SANDBOX_NAME_ANNOTATION]: "sb-1" } } }),
    ).toBe("sb-1");
  });
  it("returns undefined when missing", () => {
    expect(readAssignedSandboxName({})).toBeUndefined();
  });
});

describe("isClaimInUse", () => {
  it("true when lease is in the future", () => {
    expect(isClaimInUse({ metadata: { annotations: { [ACTIVE_LEASE_ANNOTATION]: "2026-06-29T12:05:00.000Z" } } }, NOW)).toBe(true);
  });
  it("false when lease is in the past", () => {
    expect(isClaimInUse({ metadata: { annotations: { [ACTIVE_LEASE_ANNOTATION]: "2026-06-29T11:59:00.000Z" } } }, NOW)).toBe(false);
  });
  it("false when annotation missing or unparseable", () => {
    expect(isClaimInUse({}, NOW)).toBe(false);
    expect(isClaimInUse({ metadata: { annotations: { [ACTIVE_LEASE_ANNOTATION]: "not-a-date" } } }, NOW)).toBe(false);
  });
});
