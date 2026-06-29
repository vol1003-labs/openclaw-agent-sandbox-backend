import { describe, it, expect } from "vitest";
import { buildWrapperArgv, sanitizeExecEnv, EXEC_ENV_VAR } from "./exec-spec.js";

describe("buildWrapperArgv", () => {
  const common = { wrapperPath: "/p/dist/exec-wrapper.js", namespace: "openclaw", pod: "sb-1", container: "runner", claim: "agent-sandbox-x" };
  it("emits node + wrapper + flags + -- + inPodCommand (no-pty, no workdir)", () => {
    expect(
      buildWrapperArgv({ ...common, usePty: false, inPodCommand: ["/bin/sh", "-c", "ls"] }),
    ).toEqual([
      process.execPath,
      "/p/dist/exec-wrapper.js",
      "--ns", "openclaw",
      "--pod", "sb-1",
      "--container", "runner",
      "--claim", "agent-sandbox-x",
      "--no-tty",
      "--",
      "/bin/sh", "-c", "ls",
    ]);
  });
  it("uses --tty and includes --workdir when set", () => {
    const a = buildWrapperArgv({ ...common, usePty: true, workdir: "/workspace", inPodCommand: ["echo", "hi"] });
    expect(a).toContain("--tty");
    expect(a.slice(a.indexOf("--workdir"), a.indexOf("--workdir") + 2)).toEqual(["--workdir", "/workspace"]);
    expect(a.slice(a.indexOf("--") + 1)).toEqual(["echo", "hi"]);
  });
});

describe("sanitizeExecEnv", () => {
  it("keeps PATH/HOME and KUBERNETES_* but drops *_TOKEN/*_SECRET", () => {
    const out = sanitizeExecEnv({
      PATH: "/usr/bin", HOME: "/home/x", KUBERNETES_SERVICE_HOST: "10.0.0.1",
      DISCORD_TOKEN: "s3cr3t", MY_SECRET: "x", AWS_ACCESS_KEY_ID: "k",
    });
    expect(out.PATH).toBe("/usr/bin");
    expect(out.HOME).toBe("/home/x");
    expect(out.KUBERNETES_SERVICE_HOST).toBe("10.0.0.1");
    expect(out.DISCORD_TOKEN).toBeUndefined();
    expect(out.MY_SECRET).toBeUndefined();
    expect(out.AWS_ACCESS_KEY_ID).toBeUndefined();
  });
});

describe("EXEC_ENV_VAR", () => {
  it("is the documented passthrough var", () => {
    expect(EXEC_ENV_VAR).toBe("AGENT_SANDBOX_EXEC_ENV");
  });
});
