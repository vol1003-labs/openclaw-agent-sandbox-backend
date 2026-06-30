import { describe, expect, it } from "vitest";
import { resolveAgentSandboxPluginConfig } from "./config.js";
import type { SandboxK8sApi } from "./k8s-client.js";
import { buildRegistration } from "./registration.js";

const cfg = resolveAgentSandboxPluginConfig({ workdir: "/workspace" });
const k8s = {} as SandboxK8sApi;

describe("buildRegistration", () => {
  it("returns factory + manager + resolveWorkdir", () => {
    const reg = buildRegistration({ pluginConfig: cfg, k8s, wrapperPath: "/p/exec-wrapper.js" });
    expect(typeof reg).toBe("object");
    if (typeof reg === "object") {
      expect(typeof reg.factory).toBe("function");
      expect(typeof reg.manager).toBe("object");
      expect(typeof reg.resolveWorkdir).toBe("function");
      expect(reg.resolveWorkdir!({ scopeKey: "agent:coding" } as any)).toBe("/workspace");
    }
  });
});
