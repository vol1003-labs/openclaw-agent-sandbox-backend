import { describe, expect, it } from "vitest";
import { buildRunShellInPodCommand, createAgentSandboxBackend } from "./backend.js";
import { resolveAgentSandboxPluginConfig } from "./config.js";
import { EXEC_ENV_VAR } from "./exec-spec.js";

const cfg = resolveAgentSandboxPluginConfig(undefined);
const args = {
  pluginConfig: cfg,
  claimName: "agent-sandbox-coding-deadbeef",
  podName: "sb-1",
  createParams: {
    scopeKey: "agent:coding",
    cfg: { docker: { env: { FOO: "bar" }, image: "img" } },
  } as any,
  k8s: {} as any,
  wrapperPath: "/p/dist/exec-wrapper.js",
};

describe("createAgentSandboxBackend handle", () => {
  it("has the strict id, runtimeId=claimName, workdir from config", () => {
    const h = createAgentSandboxBackend(args as any);
    expect(h.id).toBe("agent-sandbox");
    expect(h.runtimeId).toBe("agent-sandbox-coding-deadbeef");
    expect(h.workdir).toBe("/workspace");
    expect(h.configLabel).toBe("openclaw-runner");
  });

  it("buildExecSpec emits wrapper argv targeting the pod and passes exec env as JSON (not argv)", async () => {
    const h = createAgentSandboxBackend(args as any);
    const spec = await h.buildExecSpec({
      command: "echo hi",
      workdir: "/workspace",
      env: { SECRETLESS: "1" },
      usePty: false,
    });
    expect(spec.argv[0]).toBe(process.execPath);
    expect(spec.argv).toContain("--pod");
    expect(spec.argv[spec.argv.indexOf("--pod") + 1]).toBe("sb-1");
    expect(spec.argv).toContain("--no-tty");
    expect(spec.argv.slice(spec.argv.indexOf("--") + 1)).toEqual(["/bin/sh", "-c", "echo hi"]);
    expect(spec.stdinMode).toBe("pipe-open");
    expect(JSON.parse(String(spec.env[EXEC_ENV_VAR]))).toEqual({ SECRETLESS: "1" });
    // the exec env must NOT leak into argv:
    expect(spec.argv.join(" ")).not.toContain("SECRETLESS");
  });

  it("buildExecSpec uses --tty when usePty", async () => {
    const h = createAgentSandboxBackend(args as any);
    const spec = await h.buildExecSpec({ command: "bash", env: {}, usePty: true });
    expect(spec.argv).toContain("--tty");
  });

  it("buildExecSpec env does NOT carry removed TTL vars", async () => {
    const h = createAgentSandboxBackend(args as any);
    const spec = await h.buildExecSpec({ command: "x", env: {}, usePty: false });
    expect(spec.env).not.toHaveProperty("AGENT_SANDBOX_TTL_ACTIVE_SECONDS");
    expect(spec.env).not.toHaveProperty("AGENT_SANDBOX_TTL_IDLE_SECONDS");
    expect(spec.env).not.toHaveProperty("AGENT_SANDBOX_RENEW_INTERVAL_SECONDS");
  });
});

describe("buildRunShellInPodCommand", () => {
  it("runs the script via /bin/sh -c with positional args after $0", () => {
    expect(buildRunShellInPodCommand({ script: "echo $1", args: ["a", "b"] })).toEqual([
      "/bin/sh",
      "-c",
      "echo $1",
      "agent-sandbox",
      "a",
      "b",
    ]);
  });
  it("handles no args", () => {
    expect(buildRunShellInPodCommand({ script: "id" })).toEqual([
      "/bin/sh",
      "-c",
      "id",
      "agent-sandbox",
    ]);
  });
});
