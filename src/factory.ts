import type {
  CreateSandboxBackendParams,
  SandboxBackendFactory,
  SandboxBackendHandle,
} from "openclaw/plugin-sdk/sandbox";
import { createAgentSandboxBackend } from "./backend.js";
import type { AgentSandboxPluginConfig } from "./config.js";
import {
  AlreadyExistsError,
  isPodReady,
  QuotaExceededError,
  type SandboxK8sApi,
} from "./k8s-client.js";
import {
  buildClaimManifest,
  buildShutdownPatch,
  computeRfc3339,
  readAssignedSandboxName,
  resolvePodName,
} from "./lifecycle.js";
import { buildClaimName } from "./names.js";

export type BuildHandleArgs = {
  pluginConfig: AgentSandboxPluginConfig;
  claimName: string;
  podName: string;
  createParams: CreateSandboxBackendParams;
  k8s: SandboxK8sApi;
  wrapperPath: string;
};

export type FactoryDeps = {
  pluginConfig: AgentSandboxPluginConfig;
  k8s: SandboxK8sApi;
  wrapperPath: string;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  buildHandle?: (args: BuildHandleArgs) => SandboxBackendHandle;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createAgentSandboxBackendFactory(deps: FactoryDeps): SandboxBackendFactory {
  const now = deps.now ?? (() => new Date());
  const sleep = deps.sleep ?? defaultSleep;
  const buildHandle = deps.buildHandle ?? createAgentSandboxBackend;
  const { pluginConfig: cfg, k8s } = deps;

  return async (createParams) => {
    const claimName = buildClaimName(createParams.scopeKey);
    const ns = cfg.namespace;
    const shutdownTime = computeRfc3339(now(), cfg.shutdownAfterSeconds);

    let createdByUs = false;
    const existing = await k8s.getClaim(ns, claimName);
    if (existing == null) {
      const manifest = buildClaimManifest({
        name: claimName,
        namespace: ns,
        warmPool: cfg.warmPool,
        scopeKey: createParams.scopeKey,
        shutdownTimeRfc3339: shutdownTime,
      });
      try {
        await k8s.createClaim(ns, manifest);
        createdByUs = true;
      } catch (err) {
        if (err instanceof QuotaExceededError) {
          // Quota errors: nothing was created, so no rollback needed.
          throw new Error(
            `agent-sandbox: cannot create sandbox for ${createParams.scopeKey}: ${err.message}`,
          );
        }
        if (err instanceof AlreadyExistsError) {
          // Lost a concurrent create race: another caller created the claim first.
          // Adopt the existing claim — do NOT set createdByUs so we never roll it back.
          const raced = await k8s.getClaim(ns, claimName);
          if (raced == null) {
            // Claim vanished immediately after the race — unusual, surface the error.
            throw err;
          }
          await k8s.patchClaim(ns, claimName, buildShutdownPatch(shutdownTime));
          // createdByUs stays false — fall through to waitForBoundReadyPod below.
        } else {
          throw err;
        }
      }
    } else {
      // Adopt: extend the idle shutdownTime so the controller does not reap it under us.
      await k8s.patchClaim(ns, claimName, buildShutdownPatch(shutdownTime));
    }

    try {
      // The bound Pod name is resolved from the Sandbox's pod-name annotation
      // (falling back to the Sandbox name): under warm-pool adoption the controller's
      // Pod name can differ from the Sandbox name. See waitForBoundReadyPod /
      // resolvePodName (mirrors the controller's resolvePodName).
      const podName = await waitForBoundReadyPod({ k8s, ns, claimName, cfg, now, sleep });
      return buildHandle({
        pluginConfig: cfg,
        claimName,
        podName,
        createParams,
        k8s,
        wrapperPath: deps.wrapperPath,
      });
    } catch (err) {
      if (createdByUs) {
        // Roll back: delete the claim we created. Best-effort — swallow errors.
        await k8s.deleteClaim(ns, claimName).catch(() => {});
      }
      // For adopted (pre-existing) claims we do NOT delete — we don't own them.
      throw err;
    }
  };
}

async function waitForBoundReadyPod(p: {
  k8s: SandboxK8sApi;
  ns: string;
  claimName: string;
  cfg: AgentSandboxPluginConfig;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
}): Promise<string> {
  const deadline = p.now().getTime() + p.cfg.readyTimeoutSeconds * 1000;
  let podName: string | undefined;

  while (p.now().getTime() < deadline) {
    // If we don't yet know the Pod name, re-read the claim to pick up the annotation.
    if (podName === undefined) {
      const claim = await p.k8s.getClaim(p.ns, p.claimName);
      if (claim == null) {
        throw new Error(`agent-sandbox: claim ${p.claimName} disappeared while waiting for bind`);
      }
      const sandboxName = readAssignedSandboxName(claim);
      if (sandboxName !== undefined) {
        const sandbox = await p.k8s.getSandbox(p.ns, sandboxName);
        if (sandbox !== null) podName = resolvePodName(sandbox);
      }
    }

    if (podName !== undefined) {
      const pod = await p.k8s.getPod(p.ns, podName);
      if (pod !== null && isPodReady(pod)) return podName;
    }

    await p.sleep(500);
  }

  throw new Error(
    `agent-sandbox: timeout (${p.cfg.readyTimeoutSeconds}s) waiting for sandbox Pod to become ready for claim ${p.claimName}`,
  );
}
