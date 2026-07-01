import type {
  RemoteShellSandboxHandle,
  SandboxBackendCommandParams,
  SandboxBackendCommandResult,
  SandboxFsBridge,
} from "openclaw/plugin-sdk/sandbox";
import { createRemoteShellSandboxFsBridge } from "openclaw/plugin-sdk/sandbox";

// SandboxFsBridgeContext is not re-exported from the public plugin-sdk/sandbox
// subpath, so we derive it from the function's own parameter type.
type SandboxFsBridgeContext = Parameters<typeof createRemoteShellSandboxFsBridge>[0]["sandbox"];

/** The buffered in-pod exec primitive every fs op runs through (the handle's runShellCommand). */
export type RunInPod = (p: SandboxBackendCommandParams) => Promise<SandboxBackendCommandResult>;

/**
 * Build OpenClaw's remote-shell fs bridge for our K8s Pod backend.
 *
 * We reuse `createRemoteShellSandboxFsBridge` (the same bridge OpenClaw's SSH
 * backend uses) instead of hand-rolling fs ops: our Pod backend is remote and
 * shares no filesystem with the host, exactly like SSH. The adapter maps the
 * bridge's minimal `RemoteShellSandboxHandle` contract onto the handle's own
 * `runShellCommand`. `remoteWorkspaceDir`/`remoteAgentWorkspaceDir` are both the
 * single container workspace (`cfg.workdir`); this backend has no separate agent
 * workspace.
 */
export function createAgentSandboxFsBridge(deps: {
  run: RunInPod;
  workdir: string;
  sandbox: SandboxFsBridgeContext;
}): SandboxFsBridge {
  const runtime: RemoteShellSandboxHandle = {
    remoteWorkspaceDir: deps.workdir,
    remoteAgentWorkspaceDir: deps.workdir,
    runRemoteShellScript: deps.run,
  };
  return createRemoteShellSandboxFsBridge({ sandbox: deps.sandbox, runtime });
}
