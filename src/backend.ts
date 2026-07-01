import { spawn } from "node:child_process";
import type {
  SandboxBackendCommandParams,
  SandboxBackendCommandResult,
  SandboxBackendExecSpec,
  SandboxBackendHandle,
} from "openclaw/plugin-sdk/sandbox";
import { sanitizeEnvVars } from "openclaw/plugin-sdk/sandbox";
import { BACKEND_ID } from "./constants.js";
import { buildWrapperArgv, EXEC_ENV_VAR } from "./exec-spec.js";
import type { BuildHandleArgs } from "./factory.js";
import { createAgentSandboxFsBridge } from "./fs-bridge.js";

export function buildRunShellInPodCommand(p: { script: string; args?: string[] }): string[] {
  return ["/bin/sh", "-c", p.script, "agent-sandbox", ...(p.args ?? [])];
}

export function createAgentSandboxBackend(args: BuildHandleArgs): SandboxBackendHandle {
  const { pluginConfig: cfg, claimName, podName, createParams, wrapperPath } = args;

  const wrapperArgvFor = (inPodCommand: string[], usePty: boolean, workdir?: string): string[] =>
    buildWrapperArgv({
      wrapperPath,
      namespace: cfg.namespace,
      pod: podName,
      container: cfg.container,
      usePty,
      ...(workdir ? { workdir } : {}),
      inPodCommand,
    });

  const dockerEnv = createParams.cfg.docker.env;

  const runShellCommand = async (
    params: SandboxBackendCommandParams,
  ): Promise<SandboxBackendCommandResult> => {
    const inPodCommand = buildRunShellInPodCommand({
      script: params.script,
      ...(params.args ? { args: params.args } : {}),
    });
    const argv = wrapperArgvFor(inPodCommand, false);
    return runBufferedWrapper(argv, params);
  };

  return {
    id: BACKEND_ID,
    runtimeId: claimName,
    runtimeLabel: claimName,
    workdir: cfg.workdir,
    ...(dockerEnv !== undefined ? { env: dockerEnv } : {}),
    configLabel: cfg.warmPool,
    configLabelKind: "WarmPool",

    async buildExecSpec({ command, workdir, env, usePty }): Promise<SandboxBackendExecSpec> {
      const inPodCommand = ["/bin/sh", "-c", command];
      return {
        argv: wrapperArgvFor(inPodCommand, usePty, workdir),
        env: {
          ...sanitizeEnvVars(process.env).allowed,
          [EXEC_ENV_VAR]: JSON.stringify(env ?? {}),
        },
        stdinMode: "pipe-open",
      };
    },

    runShellCommand,
    createFsBridge: ({ sandbox }) =>
      createAgentSandboxFsBridge({ run: runShellCommand, workdir: cfg.workdir, sandbox }),
  };
}

/** Grace period after SIGTERM before escalating to SIGKILL on abort. */
const SIGKILL_GRACE_MS = 2000;

function runBufferedWrapper(
  argv: string[],
  params: SandboxBackendCommandParams,
): Promise<SandboxBackendCommandResult> {
  return new Promise((resolve, reject) => {
    const [cmd, ...rest] = argv;
    if (cmd === undefined) {
      reject(new Error("agent-sandbox runShellCommand: empty wrapper argv"));
      return;
    }
    const child = spawn(cmd, rest, {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...sanitizeEnvVars(process.env).allowed,
        [EXEC_ENV_VAR]: JSON.stringify({}),
      },
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (d: Buffer) => out.push(d));
    child.stderr.on("data", (d: Buffer) => err.push(d));

    // Abort: SIGTERM, then escalate to SIGKILL if the process ignores it.
    const signal = params.signal;
    let killTimer: NodeJS.Timeout | undefined;
    const onAbort = () => {
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), SIGKILL_GRACE_MS);
      killTimer.unref();
    };
    const cleanup = () => {
      if (killTimer) clearTimeout(killTimer);
      signal?.removeEventListener("abort", onAbort);
    };
    if (signal?.aborted) {
      onAbort();
    } else {
      signal?.addEventListener("abort", onAbort, { once: true });
    }

    // Ignore stdin write errors (EPIPE) when the command exits without reading stdin.
    child.stdin.on("error", () => {});
    if (params.stdin !== undefined) {
      child.stdin.end(typeof params.stdin === "string" ? Buffer.from(params.stdin) : params.stdin);
    } else {
      child.stdin.end();
    }

    child.on("error", (e) => {
      cleanup();
      reject(e);
    });
    child.on("close", (code) => {
      cleanup();
      const result = { stdout: Buffer.concat(out), stderr: Buffer.concat(err), code: code ?? -1 };
      if (result.code !== 0 && !params.allowFailure) {
        reject(
          new Error(
            `agent-sandbox runShellCommand exited ${result.code}: ${result.stderr.toString().slice(0, 500)}`,
          ),
        );
        return;
      }
      resolve(result);
    });
  });
}
