import { describe, it, expect } from "vitest";
import { buildClaimName, toLabelSafe } from "./names.js";

describe("buildClaimName", () => {
  it("is deterministic", () => {
    expect(buildClaimName("agent:coding")).toBe(buildClaimName("agent:coding"));
  });
  it("distinct scopeKeys map to distinct names", () => {
    expect(buildClaimName("agent:coding")).not.toBe(buildClaimName("agent:general"));
  });
  it("is RFC1123 label-safe and bounded", () => {
    const n = buildClaimName("agent:WeIrD/Scope key__with.dots:and:colons-and-a-very-long-suffix-xxxxxxxx");
    expect(n).toMatch(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/);
    expect(n.length).toBeLessThanOrEqual(63);
    expect(n.startsWith("agent-sandbox-")).toBe(true);
  });
  it("handles empty scopeKey without producing an invalid name", () => {
    const n = buildClaimName("");
    expect(n).toMatch(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/);
  });
});

describe("toLabelSafe", () => {
  it("sanitizes to a valid k8s label value", () => {
    const v = toLabelSafe("agent:Coding/Work");
    expect(v).toBe("agent-coding-work");
    expect(v).toMatch(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/);
  });
  it("falls back to 'scope' when nothing usable remains", () => {
    expect(toLabelSafe("")).toBe("scope");
    expect(toLabelSafe("///")).toBe("scope");
  });
  it("bounds length to 32 with no trailing dash", () => {
    const v = toLabelSafe(`${"x".repeat(31)}:tail`);
    expect(v.length).toBeLessThanOrEqual(32);
    expect(v.endsWith("-")).toBe(false);
  });
});
