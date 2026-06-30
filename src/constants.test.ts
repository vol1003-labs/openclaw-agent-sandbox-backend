import { describe, expect, it } from "vitest";
import {
  BACKEND_ID,
  SANDBOX_CLAIM_GROUP,
  SANDBOX_CLAIM_PLURAL,
  SANDBOX_CLAIM_VERSION,
} from "./constants.js";

describe("constants", () => {
  it("pins the backend id verbatim", () => {
    expect(BACKEND_ID).toBe("agent-sandbox");
  });
  it("pins the SandboxClaim GVR", () => {
    expect(`${SANDBOX_CLAIM_GROUP}/${SANDBOX_CLAIM_VERSION}`).toBe(
      "extensions.agents.x-k8s.io/v1beta1",
    );
    expect(SANDBOX_CLAIM_PLURAL).toBe("sandboxclaims");
  });
});
