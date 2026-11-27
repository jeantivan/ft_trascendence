import {
  MAX_DURATION_SECONDS,
  MAX_PACE_SECONDS,
  POSTGRES_INT_MAX,
} from "@/lib/training/schemas";
import {
  areSessionMetricsConsistent,
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

const ALL_FILLED_TARGET: Record<MetricField, MetricField> = {
  distanceKm: "duration",
  pace: "duration",
  duration: "pace",
};

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

  if (state[editedField].trim() === "") {
    return null;
  }

  const otherFields = METRIC_FIELDS.filter((field) => field !== editedField);
  const emptyTargets = otherFields.filter(
    (field) => state[field].trim() === "",
  );

  // Auto-fill the single empty field when two fields have input.
  if (emptyTargets.length === 1) {
    return emptyTargets[0];
  }

  // When all three fields are filled, keep metrics consistent instead of leaving stale values.
  if (emptyTargets.length === 0) {
    return ALL_FILLED_TARGET[editedField];
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
 * Never overwrites the field currently being edited, and keeps all three metrics consistent
 * when all fields are filled (editing duration updates pace; editing distance/pace updates duration).
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

/**
 * Infers which metric field should stay auto-computed when loading a saved
 * session for editing. If all three metrics are present and consistent under
 * rounding in any of the three calculation directions, marks "duration" so
 * editing distance or pace keeps the session coherent.
 */
export function inferInitialAutoField(
  distanceM: number | null | undefined,
  paceS: number | null | undefined,
  durationS: number | null | undefined,
): MetricField | null {
  if (
    distanceM === null || distanceM === undefined ||
    paceS === null || paceS === undefined ||
    durationS === null || durationS === undefined ||
    distanceM <= 0 ||
    paceS <= 0 ||
    durationS <= 0
  ) {
    return null;
  }

  return areSessionMetricsConsistent(distanceM, paceS, durationS)
    ? "duration"
    : null;
}
