import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { parseExecEnv, runExecToExitCode } from "./exec-wrapper.js";

type StatusCb = (status: {
  status?: string;
  details?: { causes?: Array<{ reason?: string; message?: string }> };
}) => void;

/** A fake k8s.Exec whose exec() captures the status callback and returns a controllable conn. */
function fakeExec(onExec: (cb: StatusCb, conn: EventEmitter) => void) {
  const conn = new EventEmitter();
  const exec = {
    exec: (...a: unknown[]) => {
      onExec(a[8] as StatusCb, conn);
      return Promise.resolve(conn);
    },
  };
  return { exec: exec as unknown as Parameters<typeof runExecToExitCode>[0], conn };
}

const params = {
  ns: "ns",
  pod: "pod",
  container: "c",
  argv: ["/bin/sh", "-c", "true"],
  stdout: process.stdout,
  stderr: process.stderr,
  stdin: process.stdin,
  usePty: false,
};

describe("parseExecEnv", () => {
  it("returns an empty object when the value is unset or empty", () => {
    expect(parseExecEnv(undefined)).toEqual({});
    expect(parseExecEnv("")).toEqual({});
  });

  it("parses a JSON object of string values", () => {
    expect(parseExecEnv('{"FOO":"bar","BAZ":"qux"}')).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("throws a clear error on invalid JSON", () => {
    expect(() => parseExecEnv("{not json")).toThrow(/AGENT_SANDBOX_EXEC_ENV.*valid JSON/);
  });

  it("throws when the JSON is not a plain object", () => {
    expect(() => parseExecEnv("[]")).toThrow(/must be a JSON object/);
    expect(() => parseExecEnv("42")).toThrow(/must be a JSON object/);
    expect(() => parseExecEnv("null")).toThrow(/must be a JSON object/);
  });

  it("throws when a value is not a string", () => {
    expect(() => parseExecEnv('{"FOO":1}')).toThrow(/value for "FOO" must be a string/);
  });
});

describe("runExecToExitCode", () => {
  it("resolves 0 when the command finishes with status Success", async () => {
    const { exec } = fakeExec((cb) => cb({ status: "Success" }));
    await expect(runExecToExitCode(exec, params)).resolves.toBe(0);
  });

  it("resolves the ExitCode cause value on a non-success status", async () => {
    const { exec } = fakeExec((cb) =>
      cb({ status: "Failure", details: { causes: [{ reason: "ExitCode", message: "137" }] } }),
    );
    await expect(runExecToExitCode(exec, params)).resolves.toBe(137);
  });

  it("rejects when the connection closes before any exit status is received", async () => {
    const { exec, conn } = fakeExec(() => {
      /* never delivers a status frame */
    });
    const p = runExecToExitCode(exec, params);
    await Promise.resolve(); // let the .then() attach close/error listeners
    conn.emit("close");
    await expect(p).rejects.toThrow(/closed before an exit status/);
  });

  it("rejects when the connection errors before any exit status is received", async () => {
    const { exec, conn } = fakeExec(() => {
      /* never delivers a status frame */
    });
    const p = runExecToExitCode(exec, params);
    await Promise.resolve();
    conn.emit("error", new Error("socket boom"));
    await expect(p).rejects.toThrow(/socket boom/);
  });

  it("ignores a close emitted after a status already settled the result", async () => {
    const { exec, conn } = fakeExec((cb) => cb({ status: "Success" }));
    const p = runExecToExitCode(exec, params);
    await expect(p).resolves.toBe(0);
    expect(() => conn.emit("close")).not.toThrow();
  });
});
