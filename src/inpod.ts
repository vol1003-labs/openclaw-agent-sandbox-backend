/** Single-quote a string for POSIX sh (only used for the workdir path). */
function shSingleQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * Build the exact argv to run inside the Pod via pods/exec.
 * - `env` is injected with the `env` coreutil (values are argv items, not interpolated).
 * - `workdir` is applied via `sh -c 'cd <q(workdir)> && exec "$@"' _ <base...>` so the
 *   base argv is passed positionally and never string-interpolated (injection-safe).
 */
export function composeInPodArgv(p: { base: string[]; env?: Record<string, string>; workdir?: string }): string[] {
  let argv = [...p.base];
  if (p.workdir) {
    argv = ["/bin/sh", "-c", `cd ${shSingleQuote(p.workdir)} && exec "$@"`, "_", ...argv];
  }
  if (p.env && Object.keys(p.env).length > 0) {
    const pairs = Object.entries(p.env).map(([k, v]) => `${k}=${v}`);
    argv = ["env", ...pairs, ...argv];
  }
  return argv;
}
