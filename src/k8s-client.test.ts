import { describe, it, expect } from "vitest";
import { isPodReady, classifyK8sError } from "./k8s-client.js";

describe("isPodReady", () => {
  it("true when Running and Ready=True", () => {
    expect(
      isPodReady({
        status: { phase: "Running", conditions: [{ type: "Ready", status: "True" }] },
      }),
    ).toBe(true);
  });
  it("false when Ready missing or not True", () => {
    expect(
      isPodReady({ status: { phase: "Running", conditions: [{ type: "Ready", status: "False" }] } }),
    ).toBe(false);
    expect(isPodReady({ status: { phase: "Pending" } })).toBe(false);
    expect(isPodReady({})).toBe(false);
  });
});

describe("classifyK8sError", () => {
  it("maps 404 to notfound", () => {
    expect(classifyK8sError({ statusCode: 404 })).toBe("notfound");
    expect(classifyK8sError({ response: { statusCode: 404 } })).toBe("notfound");
    expect(classifyK8sError({ code: 404 })).toBe("notfound");
  });
  it("maps 403 to quota", () => {
    expect(classifyK8sError({ statusCode: 403 })).toBe("quota");
    expect(classifyK8sError({ code: 403 })).toBe("quota");
  });
  it("maps 409 to alreadyexists", () => {
    expect(classifyK8sError({ statusCode: 409 })).toBe("alreadyexists");
    expect(classifyK8sError({ response: { statusCode: 409 } })).toBe("alreadyexists");
    expect(classifyK8sError({ code: 409 })).toBe("alreadyexists");
  });
  it("other otherwise", () => {
    expect(classifyK8sError({ statusCode: 500 })).toBe("other");
    expect(classifyK8sError(new Error("boom"))).toBe("other");
  });
});
