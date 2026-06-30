import * as k8s from "@kubernetes/client-node";
import { EXEC_ENV_VAR } from "./exec-spec.js";
import { composeInPodArgv } from "./inpod.js";
import { parseWrapperArgs } from "./wrapper-args.js";

async function main(): Promise<void> {
  const a = parseWrapperArgs(process.argv.slice(2));
  const execEnv = JSON.parse(process.env[EXEC_ENV_VAR] ?? "{}") as Record<string, string>;

  const finalArgv = composeInPodArgv({
    base: a.inPodCommand,
    ...(Object.keys(execEnv).length ? { env: execEnv } : {}),
    ...(a.workdir ? { workdir: a.workdir } : {}),
  });

  const kc = new k8s.KubeConfig();
  kc.loadFromCluster();

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
  process.exit(exitCode);
}

main().catch((err) => {
  process.stderr.write(
    `agent-sandbox exec-wrapper fatal: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
  );
  process.exit(1);
});
