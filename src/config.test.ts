import { describe, it, expect } from "vitest";
import { resolveAgentSandboxPluginConfig } from "./config.js";

describe("resolveAgentSandboxPluginConfig", () => {
  it("applies defaults when given undefined", () => {
    expect(resolveAgentSandboxPluginConfig(undefined)).toEqual({
      namespace: "openclaw",
      warmPool: "openclaw-runner",
      container: "runner",
      workdir: "/workspace",
      ttlIdleSeconds: 1800,
      ttlActiveSeconds: 300,
      renewIntervalSeconds: 60,
      readyTimeoutSeconds: 120,
    });
  });

  it("overrides only provided fields", () => {
    const c = resolveAgentSandboxPluginConfig({ namespace: "ns2", ttlIdleSeconds: 60 });
    expect(c.namespace).toBe("ns2");
    expect(c.ttlIdleSeconds).toBe(60);
    expect(c.warmPool).toBe("openclaw-runner");
  });

  it("rejects wrong types", () => {
    expect(() => resolveAgentSandboxPluginConfig({ namespace: 5 })).toThrow(/namespace/);
    expect(() => resolveAgentSandboxPluginConfig({ ttlIdleSeconds: "x" })).toThrow(/ttlIdleSeconds/);
  });

  it("rejects non-positive ttl", () => {
    expect(() => resolveAgentSandboxPluginConfig({ ttlActiveSeconds: 0 })).toThrow(/ttlActiveSeconds/);
  });
});
