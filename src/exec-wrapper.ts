import * as k8s from "@kubernetes/client-node";
import { parseWrapperArgs } from "./wrapper-args.js";
import { composeInPodArgv } from "./inpod.js";
import { EXEC_ENV_VAR } from "./exec-spec.js";
import {
  SANDBOX_CLAIM_GROUP,
  SANDBOX_CLAIM_PLURAL,
  SANDBOX_CLAIM_VERSION,
} from "./constants.js";
import { buildLeasePatch, buildLeaseReleasePatch, computeRfc3339 } from "./lifecycle.js";

function intEnv(name: string, fallback: number): number {
  const v = process.env[name];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

async function main(): Promise<void> {
  const a = parseWrapperArgs(process.argv.slice(2));
  const execEnv = JSON.parse(process.env[EXEC_ENV_VAR] ?? "{}") as Record<string, string>;
  const ttlActive = intEnv("AGENT_SANDBOX_TTL_ACTIVE_SECONDS", 300);
  const ttlIdle = intEnv("AGENT_SANDBOX_TTL_IDLE_SECONDS", 1800);
  const renewInterval = intEnv("AGENT_SANDBOX_RENEW_INTERVAL_SECONDS", 60);

  const finalArgv = composeInPodArgv({
    base: a.inPodCommand,
    ...(Object.keys(execEnv).length ? { env: execEnv } : {}),
    ...(a.workdir ? { workdir: a.workdir } : {}),
  });

  const kc = new k8s.KubeConfig();
  kc.loadFromCluster();
  const custom = kc.makeApiClient(k8s.CustomObjectsApi);
  const g = { group: SANDBOX_CLAIM_GROUP, version: SANDBOX_CLAIM_VERSION, plural: SANDBOX_CLAIM_PLURAL };
  const patchOpts = k8s.setHeaderOptions("Content-Type", k8s.PatchStrategy.MergePatch);

  const renew = async () => {
    const now = new Date();
    const patch = buildLeasePatch({
      shutdownTimeRfc3339: computeRfc3339(now, ttlActive),
      leaseUntilRfc3339: computeRfc3339(now, ttlActive),
    });
    await custom
      .patchNamespacedCustomObject(
        { ...g, namespace: a.ns, name: a.claim, body: patch },
        patchOpts,
      )
      .catch(() => {}); // best-effort; controller reap is the backstop
  };

  await renew();
  const timer = setInterval(() => void renew(), renewInterval * 1000);

  const exec = new k8s.Exec(kc);
  const exitCode = await new Promise<number>((resolve, reject) => {
    exec
      .exec(
        a.ns,
        a.pod,
        a.container,
        finalArgv,
        process.stdout,
        process.stderr,
        process.stdin,
        a.usePty,
        (status: k8s.V1Status) => {
          // status.status === "Success" => 0; otherwise parse exit code from causes/message.
          if (status.status === "Success") return resolve(0);
          const causeCode = status.details?.causes?.find((c) => c.reason === "ExitCode")?.message;
          resolve(causeCode ? Number(causeCode) : 1);
        },
      )
      .catch(reject);
    // Note: PTY resize (when usePty && stdout.isTTY) is handled automatically by
    // the k8s Exec class via TerminalSizeQueue when stdout has rows/columns properties.
  });

  clearInterval(timer);
  // Release the lease and shorten to idle TTL so the claim reaps promptly when idle.
  await custom
    .patchNamespacedCustomObject(
      {
        ...g,
        namespace: a.ns,
        name: a.claim,
        body: buildLeaseReleasePatch(computeRfc3339(new Date(), ttlIdle)),
      },
      patchOpts,
    )
    .catch(() => {});
  process.exit(exitCode);
}

main().catch((err) => {
  process.stderr.write(
    `agent-sandbox exec-wrapper fatal: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
  );
  process.exit(1);
});
