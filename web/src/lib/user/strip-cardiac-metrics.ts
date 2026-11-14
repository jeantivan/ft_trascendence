// Only non-health keys explicitly allowed by docs/gdpr/export-spec.md survive purge.
// When #69 defines the full SessionLog.extra schema, review this allowlist.
const ALLOWED_EXTRA_KEYS = new Set(["incompletion_reason"]);

export function stripCardiacMetrics(
  extra: unknown
): Record<string, unknown> | null {
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) {
    return null;
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(extra as Record<string, unknown>)) {
    if (ALLOWED_EXTRA_KEYS.has(key)) {
      result[key] = value;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}
