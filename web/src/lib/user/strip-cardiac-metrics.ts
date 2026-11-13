const CARDIAC_KEYS = new Set([
  "heartRate",
  "heart_rate",
  "avgHeartRate",
  "avg_heart_rate",
  "maxHeartRate",
  "max_heart_rate",
  "hr",
  "avgHr",
  "avg_hr",
  "maxHr",
  "max_hr",
  "bpm",
  "cardiac",
]);

export function stripCardiacMetrics(
  extra: unknown
): Record<string, unknown> | null {
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) {
    return null;
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(extra as Record<string, unknown>)) {
    if (!CARDIAC_KEYS.has(key)) {
      result[key] = value;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}
