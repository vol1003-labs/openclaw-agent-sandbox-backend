const PREFIX = "agent-sandbox";

/** djb2 hash → 8 lowercase hex chars; stable across runs. */
function hash8(input: string): string {
  let acc = 5381;
  for (const ch of input) {
    acc = ((acc * 33) ^ ch.charCodeAt(0)) >>> 0;
  }
  return acc.toString(16).padStart(8, "0").slice(0, 8);
}

/**
 * Deterministic, RFC1123-label-safe SandboxClaim name for a scopeKey
 * (e.g. "agent:coding"). Shape: agent-sandbox-<safe>-<hash8>, <= 63 chars.
 */
export function buildClaimName(scopeKey: string): string {
  const trimmed = scopeKey.trim();
  const safe = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  const body = safe.length > 0 ? safe : "scope";
  const name = `${PREFIX}-${body}-${hash8(trimmed)}`;
  // Trim trailing '-' that could appear if body ended at the slice boundary.
  return name.replace(/-+(?=-[0-9a-f]{8}$)/, "").replace(/^-+|-+$/g, "");
}
