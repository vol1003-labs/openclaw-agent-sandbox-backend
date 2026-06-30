import { describe, expect, it } from "vitest";
import { resolveAgentSandboxPluginConfig } from "./config.js";

describe("resolveAgentSandboxPluginConfig", () => {
  it("applies defaults when given undefined", () => {
    expect(resolveAgentSandboxPluginConfig(undefined)).toEqual({
      namespace: "openclaw",
      warmPool: "openclaw-runner",
      container: "runner",
      workdir: "/workspace",
      shutdownAfterSeconds: 86400,
      readyTimeoutSeconds: 120,
    });
  });

  it("overrides only provided fields", () => {
    const c = resolveAgentSandboxPluginConfig({ namespace: "ns2", shutdownAfterSeconds: 3600 });
    expect(c.namespace).toBe("ns2");
    expect(c.shutdownAfterSeconds).toBe(3600);
    expect(c.warmPool).toBe("openclaw-runner");
  });

  it("rejects wrong types", () => {
    expect(() => resolveAgentSandboxPluginConfig({ namespace: 5 })).toThrow(/namespace/);
    expect(() => resolveAgentSandboxPluginConfig({ shutdownAfterSeconds: "x" })).toThrow(
      /shutdownAfterSeconds/,
    );
  });

  it("rejects non-positive shutdownAfterSeconds", () => {
    expect(() => resolveAgentSandboxPluginConfig({ shutdownAfterSeconds: 0 })).toThrow(
      /shutdownAfterSeconds/,
    );
  });
});
