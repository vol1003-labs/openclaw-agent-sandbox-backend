export const EXEC_ENV_VAR = "AGENT_SANDBOX_EXEC_ENV" as const;

export function buildWrapperArgv(p: {
  wrapperPath: string;
  namespace: string;
  pod: string;
  container: string;
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
    p.usePty ? "--tty" : "--no-tty",
    ...(p.workdir ? ["--workdir", p.workdir] : []),
    "--",
    ...p.inPodCommand,
  ];
}
