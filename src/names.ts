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
 * scopeKey → RFC1123/label-safe slug: lowercase [a-z0-9-], <= 32 chars,
 * no leading/trailing '-', never empty ("scope" fallback). Shared by the
 * claim-name body and the selectable scope-key label value.
 */
export function toLabelSafe(scopeKey: string): string {
  const safe = scopeKey
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/^-+|-+$/g, "");
  return safe.length > 0 ? safe : "scope";
}

/**
 * Deterministic, RFC1123-label-safe SandboxClaim name for a scopeKey
 * (e.g. "agent:coding"). Shape: agent-sandbox-<safe>-<hash8>, <= 63 chars.
 */
export function buildClaimName(scopeKey: string): string {
  const trimmed = scopeKey.trim();
  return `${PREFIX}-${toLabelSafe(trimmed)}-${hash8(trimmed)}`;
}
