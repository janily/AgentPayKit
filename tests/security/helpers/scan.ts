export const credentialPatterns = [
  new RegExp("BEGIN [A-Z ]*PRIVATE KEY", "i"),
  new RegExp(
    "(?:CLOUDFLARE_API_TOKEN|CDP_API_SECRET|SEED_PHRASE|MNEMONIC)\\s*[:=]\\s*[\\\"'][^\\\"']+",
    "i",
  ),
  new RegExp("(?:sk|rk|pk)_(?:live|prod)_[A-Za-z0-9]{16,}", "i"),
  new RegExp("SENSITIVE_(?:INPUT|RESULT|PAYMENT|KEY)_MARKER"),
];

export function credentialMatches(bytes: Uint8Array | string): string[] {
  const text =
    typeof bytes === "string" ? bytes : new TextDecoder().decode(bytes);
  return credentialPatterns
    .filter((pattern) => pattern.test(text))
    .map((pattern) => pattern.source);
}
