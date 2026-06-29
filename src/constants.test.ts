import { describe, it, expect } from "vitest";
import { BACKEND_ID, SANDBOX_CLAIM_GROUP, SANDBOX_CLAIM_VERSION, SANDBOX_CLAIM_PLURAL } from "./constants.js";

describe("constants", () => {
  it("pins the backend id verbatim", () => {
    expect(BACKEND_ID).toBe("agent-sandbox");
  });
  it("pins the SandboxClaim GVR", () => {
    expect(`${SANDBOX_CLAIM_GROUP}/${SANDBOX_CLAIM_VERSION}`).toBe("extensions.agents.x-k8s.io/v1beta1");
    expect(SANDBOX_CLAIM_PLURAL).toBe("sandboxclaims");
  });
});
