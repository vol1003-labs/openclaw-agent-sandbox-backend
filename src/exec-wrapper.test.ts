import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { describeError, parseExecEnv, runExecToExitCode } from "./exec-wrapper.js";

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

describe("describeError", () => {
  /** Mimic a `ws` ErrorEvent: not an Error, no enumerable own props, real info is non-enumerable. */
  function fakeWsErrorEvent(msg: string, withInner: boolean): unknown {
    const ev: Record<string, unknown> = {};
    Object.defineProperty(ev, "type", { value: "error", enumerable: false });
    Object.defineProperty(ev, "message", { value: msg, enumerable: false });
    if (withInner) Object.defineProperty(ev, "error", { value: new Error(msg), enumerable: false });
    return ev;
  }

  it("returns the stack for an Error instance", () => {
    const err = new Error("boom");
    expect(describeError(err)).toBe(err.stack);
  });

  it("unwraps a ws ErrorEvent via its non-enumerable .error (real pods/exec 403)", () => {
    const ev = fakeWsErrorEvent("Unexpected server response: 403", true);
    // Sanity: this is exactly the shape that used to serialize to "[object Object]".
    expect(ev instanceof Error).toBe(false);
    expect(Object.keys(ev as object)).toEqual([]);
    expect(describeError(ev)).toContain("Unexpected server response: 403");
    expect(describeError(ev)).not.toBe("[object Object]");
  });

  it("falls back to a non-enumerable .message when there is no inner error", () => {
    const ev = fakeWsErrorEvent("Unexpected server response: 403", false);
    expect(describeError(ev)).toBe("Unexpected server response: 403");
  });

  it("returns a plain string throwable as-is", () => {
    expect(describeError("kaboom")).toBe("kaboom");
  });

  it("dumps own enumerable properties for an opaque object", () => {
    expect(describeError({ code: 403, reason: "Forbidden" })).toBe(
      '{"code":403,"reason":"Forbidden"}',
    );
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
