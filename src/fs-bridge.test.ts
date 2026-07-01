import type {
  createRemoteShellSandboxFsBridge,
  SandboxBackendCommandParams,
  SandboxBackendCommandResult,
} from "openclaw/plugin-sdk/sandbox";
import { describe, expect, it, vi } from "vitest";
import { createAgentSandboxFsBridge } from "./fs-bridge.js";

// SandboxFsBridgeContext is not re-exported from the public plugin-sdk/sandbox
// subpath, so we derive it from the function's own parameter type.
type SandboxFsBridgeContext = Parameters<typeof createRemoteShellSandboxFsBridge>[0]["sandbox"];

function makeRun(result: Partial<SandboxBackendCommandResult> = {}) {
  const calls: SandboxBackendCommandParams[] = [];
  const run = vi.fn(async (p: SandboxBackendCommandParams) => {
    calls.push(p);
    return { stdout: Buffer.from(""), stderr: Buffer.from(""), code: 0, ...result };
  });
  return { run, calls };
}

// workspaceAccess: "ro" keeps reads/resolve working while skipping the rw-gated
// protected-skill mount probe, so these tests are deterministic on any machine.
const ctx = (over: Partial<SandboxFsBridgeContext> = {}): SandboxFsBridgeContext => ({
  workspaceDir: "/workspace",
  agentWorkspaceDir: "/workspace",
  workspaceAccess: "ro",
  containerName: "runner",
  containerWorkdir: "/workspace",
  docker: {},
  ...over,
});

describe("createAgentSandboxFsBridge", () => {
  it("returns a bridge exposing all 7 SandboxFsBridge methods", () => {
    const { run } = makeRun();
    const b = createAgentSandboxFsBridge({ run, workdir: "/workspace", sandbox: ctx() });
    for (const m of [
      "resolvePath",
      "readFile",
      "writeFile",
      "mkdirp",
      "remove",
      "rename",
      "stat",
    ]) {
      expect(typeof (b as unknown as Record<string, unknown>)[m]).toBe("function");
    }
  });

  it("resolvePath maps a relative path to a container path under workdir", () => {
    const { run } = makeRun();
    const b = createAgentSandboxFsBridge({ run, workdir: "/workspace", sandbox: ctx() });
    expect(b.resolvePath({ filePath: "a/b.txt" })).toMatchObject({
      containerPath: "/workspace/a/b.txt",
    });
  });

  it("readFile delegates to the injected run and propagates its stdout", async () => {
    const { run, calls } = makeRun({ stdout: Buffer.from("hello") });
    const b = createAgentSandboxFsBridge({ run, workdir: "/workspace", sandbox: ctx() });
    const out = await b.readFile({ filePath: "notes.md" });
    expect(out.toString()).toBe("hello");
    expect(run).toHaveBeenCalled();
    // the path reaches the shell layer as a positional arg (not interpolated):
    expect(calls[0]?.args).toContain("notes.md");
  });
});
