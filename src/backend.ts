/**
 * Task 9 stub: createAgentSandboxBackend will be implemented in Task 9.
 * This file exists so that factory.ts can import from "./backend.js" without
 * breaking the build/typecheck while Tasks 7 and 8 are implemented first.
 */
import type { SandboxBackendHandle } from "openclaw/plugin-sdk/sandbox";
import type { BuildHandleArgs } from "./factory.js";

export function createAgentSandboxBackend(_args: BuildHandleArgs): SandboxBackendHandle {
  throw new Error("createAgentSandboxBackend: not yet implemented (Task 9)");
}
