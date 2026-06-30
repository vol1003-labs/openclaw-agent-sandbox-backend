export const BACKEND_ID = "agent-sandbox" as const;

export const SANDBOX_CLAIM_GROUP = "extensions.agents.x-k8s.io" as const;
export const SANDBOX_CLAIM_VERSION = "v1beta1" as const;
export const SANDBOX_CLAIM_PLURAL = "sandboxclaims" as const;

/** Controller-set annotation on the claim naming the bound Sandbox (== Pod name). */
export const ASSIGNED_SANDBOX_NAME_ANNOTATION = "agents.x-k8s.io/sandbox-name" as const;

/** Identifies claims this plugin created (for diagnostics / selective cleanup). */
export const MANAGED_BY_LABEL = "agent-sandbox.openclaw.dev/managed-by" as const;
/** Value set on MANAGED_BY_LABEL; doubles as the plugin's package identity. */
export const MANAGED_BY_VALUE = "openclaw-agent-sandbox-backend" as const;
/** Records the originating OpenClaw scopeKey on the claim (exact, unmodified). */
export const SCOPE_KEY_ANNOTATION = "agent-sandbox.openclaw.dev/scope-key" as const;
/** Label-safe slug of the scopeKey for `kubectl get -l` selection (see toLabelSafe). */
export const SCOPE_KEY_LABEL = "agent-sandbox.openclaw.dev/scope-key" as const;
