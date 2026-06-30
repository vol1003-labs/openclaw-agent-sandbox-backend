export type WrapperArgs = {
  ns: string;
  pod: string;
  container: string;
  claim: string;
  usePty: boolean;
  workdir?: string;
  inPodCommand: string[];
};

export function parseWrapperArgs(argv: string[]): WrapperArgs {
  const sep = argv.indexOf("--");
  if (sep < 0)
    throw new Error("agent-sandbox wrapper: missing '--' separator before the in-pod command");
  const flags = argv.slice(0, sep);
  const inPodCommand = argv.slice(sep + 1);
  if (inPodCommand.length === 0)
    throw new Error("agent-sandbox wrapper: empty in-pod command after '--'");

  const get = (name: string): string | undefined => {
    const i = flags.indexOf(name);
    return i >= 0 ? flags[i + 1] : undefined;
  };
  const required = (name: string): string => {
    const v = get(name);
    if (!v) throw new Error(`agent-sandbox wrapper: missing required flag ${name}`);
    return v;
  };
  const ns = required("--ns");
  const pod = required("--pod");
  const container = required("--container");
  const claim = required("--claim");
  const workdir = get("--workdir");
  const usePty = flags.includes("--tty");

  return {
    ns,
    pod,
    container,
    claim,
    usePty,
    ...(workdir ? { workdir } : {}),
    inPodCommand,
  };
}
