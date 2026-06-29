import { describe, it, expect } from "vitest";
import { parseWrapperArgs } from "./wrapper-args.js";

const base = ["--ns", "openclaw", "--pod", "sb-1", "--container", "runner", "--claim", "c1"];

describe("parseWrapperArgs", () => {
  it("parses flags + inPodCommand after --, defaults no-tty", () => {
    expect(parseWrapperArgs([...base, "--no-tty", "--", "/bin/sh", "-c", "ls"])).toEqual({
      ns: "openclaw", pod: "sb-1", container: "runner", claim: "c1", usePty: false, inPodCommand: ["/bin/sh", "-c", "ls"],
    });
  });
  it("parses --tty and --workdir", () => {
    expect(parseWrapperArgs([...base, "--tty", "--workdir", "/w", "--", "bash"])).toEqual({
      ns: "openclaw", pod: "sb-1", container: "runner", claim: "c1", usePty: true, workdir: "/w", inPodCommand: ["bash"],
    });
  });
  it("throws when -- is missing", () => {
    expect(() => parseWrapperArgs([...base, "--no-tty"])).toThrow(/--/);
  });
  it("throws when a required flag is missing", () => {
    expect(() => parseWrapperArgs(["--pod", "p", "--", "ls"])).toThrow(/ns|claim|container/);
  });
});
