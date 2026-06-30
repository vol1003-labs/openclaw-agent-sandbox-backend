import { describe, expect, it } from "vitest";
import { composeInPodArgv } from "./inpod.js";

describe("composeInPodArgv", () => {
  it("returns base unchanged with no env/workdir", () => {
    expect(composeInPodArgv({ base: ["/bin/sh", "-c", "ls"] })).toEqual(["/bin/sh", "-c", "ls"]);
  });
  it("prepends env pairs", () => {
    expect(
      composeInPodArgv({ base: ["/bin/sh", "-c", "echo $FOO"], env: { FOO: "bar baz" } }),
    ).toEqual(["env", "--", "FOO=bar baz", "/bin/sh", "-c", "echo $FOO"]);
  });
  it('wraps with cd <workdir> && exec "$@" using argv (no interpolation of base into the script)', () => {
    expect(composeInPodArgv({ base: ["/bin/sh", "-c", "pwd"], workdir: "/work dir" })).toEqual([
      "/bin/sh",
      "-c",
      "cd '/work dir' && exec \"$@\"",
      "_",
      "/bin/sh",
      "-c",
      "pwd",
    ]);
  });
  it("escapes single quotes in workdir using the '\\'' POSIX technique", () => {
    expect(composeInPodArgv({ base: ["/bin/sh", "-c", "pwd"], workdir: "/it's/dir" })).toEqual([
      "/bin/sh",
      "-c",
      "cd '/it'\\''s/dir' && exec \"$@\"",
      "_",
      "/bin/sh",
      "-c",
      "pwd",
    ]);
  });

  it("combines env + workdir (env outermost)", () => {
    expect(composeInPodArgv({ base: ["echo", "hi"], env: { A: "1" }, workdir: "/w" })).toEqual([
      "env",
      "--",
      "A=1",
      "/bin/sh",
      "-c",
      "cd '/w' && exec \"$@\"",
      "_",
      "echo",
      "hi",
    ]);
  });

  it("inserts -- so an env name starting with - is not parsed as an env option", () => {
    expect(composeInPodArgv({ base: ["echo", "hi"], env: { "-i": "x" } })).toEqual([
      "env",
      "--",
      "-i=x",
      "echo",
      "hi",
    ]);
  });

  it("keeps env values literal (shell metacharacters are not interpreted)", () => {
    expect(
      composeInPodArgv({ base: ["echo", "hi"], env: { FOO: "$(reboot) && rm -rf /" } }),
    ).toEqual(["env", "--", "FOO=$(reboot) && rm -rf /", "echo", "hi"]);
  });
});
