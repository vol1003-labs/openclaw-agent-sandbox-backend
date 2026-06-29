export type AgentSandboxPluginConfig = {
  namespace: string;
  warmPool: string;
  container: string;
  workdir: string;
  ttlIdleSeconds: number;
  ttlActiveSeconds: number;
  renewIntervalSeconds: number;
  readyTimeoutSeconds: number;
};

const DEFAULTS: AgentSandboxPluginConfig = {
  namespace: "openclaw",
  warmPool: "openclaw-runner",
  container: "runner",
  workdir: "/workspace",
  ttlIdleSeconds: 1800,
  ttlActiveSeconds: 300,
  renewIntervalSeconds: 60,
  readyTimeoutSeconds: 120,
};

const STRING_KEYS = ["namespace", "warmPool", "container", "workdir"] as const;
const POSITIVE_INT_KEYS = [
  "ttlIdleSeconds",
  "ttlActiveSeconds",
  "renewIntervalSeconds",
  "readyTimeoutSeconds",
] as const;

export function resolveAgentSandboxPluginConfig(raw: unknown): AgentSandboxPluginConfig {
  if (raw == null) return { ...DEFAULTS };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("agent-sandbox plugin config must be an object");
  }
  const input = raw as Record<string, unknown>;
  const out: AgentSandboxPluginConfig = { ...DEFAULTS };

  for (const key of STRING_KEYS) {
    const v = input[key];
    if (v === undefined) continue;
    if (typeof v !== "string" || v.length === 0) {
      throw new Error(`agent-sandbox config: "${key}" must be a non-empty string`);
    }
    out[key] = v;
  }
  for (const key of POSITIVE_INT_KEYS) {
    const v = input[key];
    if (v === undefined) continue;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 1) {
      throw new Error(`agent-sandbox config: "${key}" must be a number >= 1`);
    }
    out[key] = v;
  }
  return out;
}
