import { describe, expect, it } from "vitest";
import { classifyK8sError, isClaimReady, isPodReady } from "./k8s-client.js";

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
      isPodReady({
        status: { phase: "Running", conditions: [{ type: "Ready", status: "False" }] },
      }),
    ).toBe(false);
    expect(isPodReady({ status: { phase: "Pending" } })).toBe(false);
    expect(isPodReady({})).toBe(false);
  });
});

describe("isClaimReady", () => {
  it("true when a Ready=True condition is present (forwarded from the bound Sandbox)", () => {
    expect(isClaimReady({ status: { conditions: [{ type: "Ready", status: "True" }] } })).toBe(
      true,
    );
  });
  it("false when Ready is False, missing, or there is no status", () => {
    expect(isClaimReady({ status: { conditions: [{ type: "Ready", status: "False" }] } })).toBe(
      false,
    );
    expect(isClaimReady({ status: { conditions: [] } })).toBe(false);
    expect(isClaimReady({})).toBe(false);
  });
});

describe("classifyK8sError", () => {
  it("maps 404 to notfound", () => {
    expect(classifyK8sError({ statusCode: 404 })).toBe("notfound");
    expect(classifyK8sError({ response: { statusCode: 404 } })).toBe("notfound");
    expect(classifyK8sError({ code: 404 })).toBe("notfound");
  });
  it("maps a quota-exceeded 403 to quota", () => {
    expect(
      classifyK8sError({ code: 403, message: "sandboxclaims is forbidden: exceeded quota: rq" }),
    ).toBe("quota");
    expect(classifyK8sError({ statusCode: 403, body: { message: "exceeded quota: rq" } })).toBe(
      "quota",
    );
  });
  it("maps a non-quota 403 (RBAC/forbidden) to other, not quota", () => {
    expect(
      classifyK8sError({
        code: 403,
        message: 'sandboxclaims is forbidden: User "sa" cannot create',
      }),
    ).toBe("other");
    expect(classifyK8sError({ statusCode: 403 })).toBe("other");
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
