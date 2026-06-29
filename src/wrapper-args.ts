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
  if (sep < 0) throw new Error("agent-sandbox wrapper: missing '--' separator before the in-pod command");
  const flags = argv.slice(0, sep);
  const inPodCommand = argv.slice(sep + 1);
  if (inPodCommand.length === 0) throw new Error("agent-sandbox wrapper: empty in-pod command after '--'");

  const get = (name: string): string | undefined => {
    const i = flags.indexOf(name);
    return i >= 0 ? flags[i + 1] : undefined;
  };
  const ns = get("--ns");
  const pod = get("--pod");
  const container = get("--container");
  const claim = get("--claim");
  const workdir = get("--workdir");
  const usePty = flags.includes("--tty");

  for (const [k, v] of [["--ns", ns], ["--pod", pod], ["--container", container], ["--claim", claim]] as const) {
    if (!v) throw new Error(`agent-sandbox wrapper: missing required flag ${k}`);
  }
  return { ns: ns!, pod: pod!, container: container!, claim: claim!, usePty, ...(workdir ? { workdir } : {}), inPodCommand };
}
