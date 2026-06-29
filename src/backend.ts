import { spawn } from "node:child_process";
import type {
  SandboxBackendCommandParams,
  SandboxBackendCommandResult,
  SandboxBackendExecSpec,
  SandboxBackendHandle,
} from "openclaw/plugin-sdk/sandbox";
import { BACKEND_ID } from "./constants.js";
import { buildWrapperArgv, sanitizeExecEnv, EXEC_ENV_VAR } from "./exec-spec.js";
import type { AgentSandboxPluginConfig } from "./config.js";
import type { BuildHandleArgs } from "./factory.js";

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
      claim: claimName,
      usePty,
      ...(workdir ? { workdir } : {}),
      inPodCommand,
    });

  const dockerEnv = createParams.cfg.docker.env;

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
          ...sanitizeExecEnv(process.env),
          [EXEC_ENV_VAR]: JSON.stringify(env ?? {}),
          AGENT_SANDBOX_TTL_ACTIVE_SECONDS: String(cfg.ttlActiveSeconds),
          AGENT_SANDBOX_TTL_IDLE_SECONDS: String(cfg.ttlIdleSeconds),
          AGENT_SANDBOX_RENEW_INTERVAL_SECONDS: String(cfg.renewIntervalSeconds),
        },
        stdinMode: "pipe-open",
      };
    },

    async runShellCommand(params: SandboxBackendCommandParams): Promise<SandboxBackendCommandResult> {
      const inPodCommand = buildRunShellInPodCommand({
        script: params.script,
        ...(params.args ? { args: params.args } : {}),
      });
      const argv = wrapperArgvFor(inPodCommand, false);
      return runBufferedWrapper(argv, params, cfg);
    },
  };
}

function runBufferedWrapper(
  argv: string[],
  params: SandboxBackendCommandParams,
  cfg: AgentSandboxPluginConfig,
): Promise<SandboxBackendCommandResult> {
  return new Promise((resolve, reject) => {
    const [cmd, ...rest] = argv;
    const child = spawn(cmd as string, rest, {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...sanitizeExecEnv(process.env),
        [EXEC_ENV_VAR]: JSON.stringify({}),
        AGENT_SANDBOX_TTL_ACTIVE_SECONDS: String(cfg.ttlActiveSeconds),
        AGENT_SANDBOX_TTL_IDLE_SECONDS: String(cfg.ttlIdleSeconds),
        AGENT_SANDBOX_RENEW_INTERVAL_SECONDS: String(cfg.renewIntervalSeconds),
      },
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (d: Buffer) => out.push(d));
    child.stderr.on("data", (d: Buffer) => err.push(d));
    if (params.signal) {
      params.signal.addEventListener("abort", () => child.kill("SIGTERM"), { once: true });
    }
    if (params.stdin !== undefined) {
      child.stdin.end(typeof params.stdin === "string" ? Buffer.from(params.stdin) : params.stdin);
    } else {
      child.stdin.end();
    }
    child.on("error", reject);
    child.on("close", (code) => {
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
