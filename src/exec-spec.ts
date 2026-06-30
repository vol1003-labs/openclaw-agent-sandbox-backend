export const EXEC_ENV_VAR = "AGENT_SANDBOX_EXEC_ENV" as const;

const SENSITIVE_PATTERNS = [/_TOKEN$/i, /_SECRET$/i, /SECRET_/i, /_KEY$/i, /^AWS_/i, /PASSWORD/i];

/** Allow-list the host env passed to the spawned wrapper: keep operational vars, drop secrets. */
export function sanitizeExecEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(base)) {
    if (v === undefined) continue;
    if (SENSITIVE_PATTERNS.some((re) => re.test(k))) continue;
    out[k] = v;
  }
  return out;
}

export function buildWrapperArgv(p: {
  wrapperPath: string;
  namespace: string;
  pod: string;
  container: string;
  claim: string;
  usePty: boolean;
  workdir?: string;
  inPodCommand: string[];
}): string[] {
  return [
    process.execPath,
    p.wrapperPath,
    "--ns",
    p.namespace,
    "--pod",
    p.pod,
    "--container",
    p.container,
    "--claim",
    p.claim,
    p.usePty ? "--tty" : "--no-tty",
    ...(p.workdir ? ["--workdir", p.workdir] : []),
    "--",
    ...p.inPodCommand,
  ];
}
