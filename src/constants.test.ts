import { describe, expect, it } from "vitest";
import {
  BACKEND_ID,
  SANDBOX_CLAIM_GROUP,
  SANDBOX_CLAIM_PLURAL,
  SANDBOX_CLAIM_VERSION,
  SANDBOX_GROUP,
  SANDBOX_PLURAL,
  SANDBOX_POD_NAME_ANNOTATION,
  SANDBOX_VERSION,
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
  it("pins the Sandbox GVR and the controller's pod-name annotation", () => {
    expect(`${SANDBOX_GROUP}/${SANDBOX_VERSION}`).toBe("agents.x-k8s.io/v1beta1");
    expect(SANDBOX_PLURAL).toBe("sandboxes");
    expect(SANDBOX_POD_NAME_ANNOTATION).toBe("agents.x-k8s.io/pod-name");
  });
});
