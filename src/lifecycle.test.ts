import { describe, it, expect } from "vitest";
import {
  computeRfc3339,
  buildClaimManifest,
  buildShutdownPatch,
  readAssignedSandboxName,
} from "./lifecycle.js";
import { ASSIGNED_SANDBOX_NAME_ANNOTATION } from "./constants.js";

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
