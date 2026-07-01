import type { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import * as k8s from "@kubernetes/client-node";
import { EXEC_ENV_VAR } from "./exec-spec.js";
import { composeInPodArgv } from "./inpod.js";
import { parseWrapperArgs } from "./wrapper-args.js";

/** Minimal surface of the websocket returned by k8s.Exec.exec() that we listen on. */
type ExecConn = { on(event: string, listener: (arg?: unknown) => void): void };

/** Minimal surface of k8s.Exec needed here (also lets tests inject a fake). */
type ExecClient = {
  exec(
    namespace: string,
    podName: string,
    containerName: string,
    command: string[],
    stdout: Writable,
    stderr: Writable,
    stdin: Readable,
    tty: boolean,
    statusCallback: (status: k8s.V1Status) => void,
  ): Promise<ExecConn>;
};

/**
 * Drive a single pods/exec to completion and resolve its exit code.
 *
 * k8s.Exec.exec() resolves its promise at *connection* time and reports the exit
 * code later via the status callback. If the connection drops (close/error) before
 * any status frame arrives — pod deleted/evicted, apiserver restart, network blip —
 * the status callback never fires, so we must reject on close/error to avoid hanging
 * forever. A settled-guard ignores the close that always follows a normal status.
 */
export function runExecToExitCode(
  exec: ExecClient,
  p: {
    ns: string;
    pod: string;
    container: string;
    argv: string[];
    stdout: Writable;
    stderr: Writable;
    stdin: Readable;
    usePty: boolean;
  },
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    let settled = false;
    const ok = (code: number) => {
      if (!settled) {
        settled = true;
        resolve(code);
      }
    };
    const ng = (err: unknown) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    };

    exec
      .exec(
        p.ns,
        p.pod,
        p.container,
        p.argv,
        p.stdout,
        p.stderr,
        p.stdin,
        p.usePty,
        (status: k8s.V1Status) => {
          // status.status === "Success" => 0; otherwise parse exit code from causes/message.
          if (status.status === "Success") return ok(0);
          const causeCode = status.details?.causes?.find((c) => c.reason === "ExitCode")?.message;
          ok(causeCode ? Number(causeCode) : 1);
        },
      )
      // Note: PTY resize (when usePty && stdout.isTTY) is handled automatically by the
      // k8s Exec class via TerminalSizeQueue when stdout has rows/columns properties.
      .then((conn) => {
        conn.on("error", (err) => ng(err));
        conn.on("close", () =>
          ng(new Error("agent-sandbox exec: connection closed before an exit status was received")),
        );
      })
      .catch(ng);
  });
}

/** Parse the env map carried over `EXEC_ENV_VAR`, with clear errors for malformed input. */
export function parseExecEnv(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `agent-sandbox exec: ${EXEC_ENV_VAR} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`agent-sandbox exec: ${EXEC_ENV_VAR} must be a JSON object of string values`);
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v !== "string") {
      throw new Error(`agent-sandbox exec: ${EXEC_ENV_VAR} value for "${k}" must be a string`);
    }
    out[k] = v;
  }
  return out;
}

/**
 * Best-effort human-readable description of a thrown value.
 *
 * `String(err)` yields the useless `"[object Object]"` for non-`Error` throwables — most
 * notably the `ws` `ErrorEvent` that `k8s.Exec.exec()` surfaces on a websocket handshake
 * failure (e.g. an HTTP 403 on `pods/exec`). Its real message lives on the *non-enumerable*
 * `.error` / `.message`, so `Object.keys`/`JSON.stringify` see `{}`. Unwrap those first, then
 * fall back to an own-property JSON dump and finally `String()`.
 */
export function describeError(err: unknown): string {
  if (err instanceof Error) return err.stack ?? err.message;
  const anyErr = err as { message?: unknown; error?: unknown } | null | undefined;
  if (anyErr?.error instanceof Error) return anyErr.error.stack ?? anyErr.error.message;
  if (typeof anyErr?.message === "string" && anyErr.message) return anyErr.message;
  if (typeof err === "string" && err) return err;
  try {
    const json = JSON.stringify(err, Object.getOwnPropertyNames(err ?? {}));
    if (json && json !== "{}") return json;
  } catch {
    // circular / unserializable — fall through to String()
  }
  return String(err);
}

async function main(): Promise<void> {
  const a = parseWrapperArgs(process.argv.slice(2));
  const execEnv = parseExecEnv(process.env[EXEC_ENV_VAR]);

  const finalArgv = composeInPodArgv({
    base: a.inPodCommand,
    ...(Object.keys(execEnv).length ? { env: execEnv } : {}),
    ...(a.workdir ? { workdir: a.workdir } : {}),
  });

  const kc = new k8s.KubeConfig();
  kc.loadFromCluster();

  const exitCode = await runExecToExitCode(new k8s.Exec(kc), {
    ns: a.ns,
    pod: a.pod,
    container: a.container,
    argv: finalArgv,
    stdout: process.stdout,
    stderr: process.stderr,
    stdin: process.stdin,
    usePty: a.usePty,
  });
  process.exit(exitCode);
}

// Only run as a spawned binary, not when imported (e.g. by tests).
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(`agent-sandbox exec-wrapper fatal: ${describeError(err)}\n`);
    process.exit(1);
  });
}
