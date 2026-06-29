import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("openclaw/plugin-sdk/sandbox", () => ({
  registerSandboxBackend: vi.fn(),
}));

import { registerSandboxBackend } from "openclaw/plugin-sdk/sandbox";
import { register } from "./index.js";

describe("plugin register — registrationMode guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does NOT call registerSandboxBackend when registrationMode is 'discovery'", () => {
    const api = { registrationMode: "discovery", pluginConfig: undefined } as any;
    register(api);
    expect(registerSandboxBackend).not.toHaveBeenCalled();
  });

  it("does NOT call registerSandboxBackend when registrationMode is 'cli-metadata'", () => {
    const api = { registrationMode: "cli-metadata", pluginConfig: undefined } as any;
    register(api);
    expect(registerSandboxBackend).not.toHaveBeenCalled();
  });
});
