import { describe, expect, it } from "vitest";
import { buildWrapperArgv, EXEC_ENV_VAR, sanitizeExecEnv } from "./exec-spec.js";

describe("buildWrapperArgv", () => {
  const common = {
    wrapperPath: "/p/dist/exec-wrapper.js",
    namespace: "openclaw",
    pod: "sb-1",
    container: "runner",
    claim: "agent-sandbox-x",
  };
  it("emits node + wrapper + flags + -- + inPodCommand (no-pty, no workdir)", () => {
    expect(
      buildWrapperArgv({ ...common, usePty: false, inPodCommand: ["/bin/sh", "-c", "ls"] }),
    ).toEqual([
      process.execPath,
      "/p/dist/exec-wrapper.js",
      "--ns",
      "openclaw",
      "--pod",
      "sb-1",
      "--container",
      "runner",
      "--claim",
      "agent-sandbox-x",
      "--no-tty",
      "--",
      "/bin/sh",
      "-c",
      "ls",
    ]);
  });
  it("uses --tty and includes --workdir when set", () => {
    const a = buildWrapperArgv({
      ...common,
      usePty: true,
      workdir: "/workspace",
      inPodCommand: ["echo", "hi"],
    });
    expect(a).toContain("--tty");
    expect(a.slice(a.indexOf("--workdir"), a.indexOf("--workdir") + 2)).toEqual([
      "--workdir",
      "/workspace",
    ]);
    expect(a.slice(a.indexOf("--") + 1)).toEqual(["echo", "hi"]);
  });
});

describe("sanitizeExecEnv", () => {
  it("keeps PATH/HOME and KUBERNETES_* but drops *_TOKEN/*_SECRET", () => {
    const out = sanitizeExecEnv({
      PATH: "/usr/bin",
      HOME: "/home/x",
      KUBERNETES_SERVICE_HOST: "10.0.0.1",
      DISCORD_TOKEN: "s3cr3t",
      MY_SECRET: "x",
      AWS_ACCESS_KEY_ID: "k",
    });
    expect(out.PATH).toBe("/usr/bin");
    expect(out.HOME).toBe("/home/x");
    expect(out.KUBERNETES_SERVICE_HOST).toBe("10.0.0.1");
    expect(out.DISCORD_TOKEN).toBeUndefined();
    expect(out.MY_SECRET).toBeUndefined();
    expect(out.AWS_ACCESS_KEY_ID).toBeUndefined();
  });

  it("drops SECRET_* prefix vars", () => {
    const out = sanitizeExecEnv({ SECRET_FOO: "leak" });
    expect(out.SECRET_FOO).toBeUndefined();
  });

  it("drops *_KEY suffix vars that are not AWS (non-AWS _KEY$ pattern)", () => {
    const out = sanitizeExecEnv({ PRIVATE_KEY: "pem-data" });
    expect(out.PRIVATE_KEY).toBeUndefined();
  });

  it("drops PASSWORD vars", () => {
    const out = sanitizeExecEnv({ DB_PASSWORD: "hunter2" });
    expect(out.DB_PASSWORD).toBeUndefined();
  });

  it("keeps arbitrary operational vars (e.g. LANG)", () => {
    const out = sanitizeExecEnv({ LANG: "en_US.UTF-8" });
    expect(out.LANG).toBe("en_US.UTF-8");
  });
});

describe("EXEC_ENV_VAR", () => {
  it("is the documented passthrough var", () => {
    expect(EXEC_ENV_VAR).toBe("AGENT_SANDBOX_EXEC_ENV");
  });
});
