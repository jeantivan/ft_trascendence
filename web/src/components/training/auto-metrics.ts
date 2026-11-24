import {
  MAX_DURATION_SECONDS,
  MAX_PACE_SECONDS,
  POSTGRES_INT_MAX,
} from "@/lib/training/schemas";
import {
  calculateAveragePaceSecondsPerKm,
  formatMetersToKm,
  formatSecondsPerKmToPace,
  formatSecondsToDuration,
  parseDurationToSeconds,
  parseKmToMeters,
  parsePaceToSecondsPerKm,
} from "@/lib/training/units";

export type MetricField = "distanceKm" | "pace" | "duration";

export interface SessionMetricsState {
  distanceKm: string;
  pace: string;
  duration: string;
  autoField: MetricField | null;
}

const METRIC_FIELDS: readonly MetricField[] = [
  "distanceKm",
  "pace",
  "duration",
];

function tryParse(
  rawValue: string,
  parser: (input: string) => number,
): number | null {
  if (rawValue.trim() === "") {
    return null;
  }
  try {
    return parser(rawValue);
  } catch {
    return null;
  }
}

function resolveTargetField(
  state: SessionMetricsState,
  editedField: MetricField,
): MetricField | null {
  if (state.autoField !== null && state.autoField !== editedField) {
    return state.autoField;
  }

  const otherFields = METRIC_FIELDS.filter((field) => field !== editedField);
  const emptyTargets = otherFields.filter(
    (field) => state[field].trim() === "",
  );

  // Only auto-fill when exactly one of the three fields is empty and two have input.
  if (emptyTargets.length === 1 && state[editedField].trim() !== "") {
    return emptyTargets[0];
  }

  return null;
}

type ComputeResult =
  | { status: "ok"; value: string }
  | { status: "incomplete" }
  | { status: "out-of-range" };

function computeTargetValue(
  state: SessionMetricsState,
  targetField: MetricField,
): ComputeResult {
  if (targetField === "duration") {
    const distanceM = tryParse(state.distanceKm, parseKmToMeters);
    const paceS = tryParse(state.pace, parsePaceToSecondsPerKm);
    if (distanceM === null || paceS === null) {
      return { status: "incomplete" };
    }

    const durationS = Math.round((distanceM * paceS) / 1000);
    if (durationS < 1 || durationS > MAX_DURATION_SECONDS) {
      return { status: "out-of-range" };
    }
    return { status: "ok", value: formatSecondsToDuration(durationS) };
  }

  if (targetField === "pace") {
    const distanceM = tryParse(state.distanceKm, parseKmToMeters);
    const durationS = tryParse(state.duration, parseDurationToSeconds);
    if (distanceM === null || durationS === null) {
      return { status: "incomplete" };
    }

    const paceS = calculateAveragePaceSecondsPerKm(distanceM, durationS);
    if (paceS === null || paceS < 1 || paceS > MAX_PACE_SECONDS) {
      return { status: "out-of-range" };
    }
    return { status: "ok", value: formatSecondsPerKmToPace(paceS) };
  }

  const durationS = tryParse(state.duration, parseDurationToSeconds);
  const paceS = tryParse(state.pace, parsePaceToSecondsPerKm);
  if (durationS === null || paceS === null) {
    return { status: "incomplete" };
  }

  const distanceM = Math.round((durationS * 1000) / paceS);
  if (distanceM < 1 || distanceM > POSTGRES_INT_MAX) {
    return { status: "out-of-range" };
  }
  return { status: "ok", value: formatMetersToKm(distanceM) };
}

/**
 * Recomputes the remaining metric field when two of (distance, pace, duration) are valid.
 * Never overwrites a manually entered field or the field currently being edited.
 */
export function recomputeSessionMetrics(
  current: SessionMetricsState,
  editedField: MetricField,
  nextValue: string,
): SessionMetricsState {
  const next: SessionMetricsState = {
    ...current,
    [editedField]: nextValue,
    autoField: current.autoField === editedField ? null : current.autoField,
  };

  const targetField = resolveTargetField(next, editedField);
  if (targetField === null) {
    return next;
  }

  const sourceFields = METRIC_FIELDS.filter((field) => field !== targetField);
  if (sourceFields.some((field) => next[field].trim() === "")) {
    return {
      ...next,
      [targetField]: "",
      autoField: null,
    };
  }

  const computed = computeTargetValue(next, targetField);
  if (computed.status === "incomplete") {
    return next;
  }
  if (computed.status === "out-of-range") {
    if (next.autoField === targetField) {
      return {
        ...next,
        [targetField]: "",
        autoField: null,
      };
    }
    return next;
  }

  return {
    ...next,
    [targetField]: computed.value,
    autoField: targetField,
  };
}
