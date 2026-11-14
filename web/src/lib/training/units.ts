import {
  addCalendarDays,
  clubMidnightToUtc,
  type CalendarDay,
} from "@/lib/time/club-time";

const KM_PATTERN = /^(\d+)(?:[.,](\d{1,3}))?$/;

export function parseKmToMeters(input: string): number {
  const normalized = input.trim();
  const match = KM_PATTERN.exec(normalized);
  if (!match) {
    throw new Error("Distancia en km inválida");
  }

  const wholeKm = Number.parseInt(match[1], 10);
  const fracStr = (match[2] ?? "").padEnd(3, "0");
  const fracMeters = Number.parseInt(fracStr, 10);
  const meters = wholeKm * 1000 + fracMeters;

  if (meters <= 0) {
    throw new Error("La distancia debe ser mayor que 0");
  }
  return meters;
}

export function formatMetersToKm(meters: number): string {
  if (!Number.isInteger(meters) || meters <= 0) {
    throw new Error("Los metros deben ser un entero positivo");
  }

  const whole = Math.floor(meters / 1000);
  const rem = meters % 1000;
  if (rem === 0) {
    return String(whole);
  }

  const frac = String(rem).padStart(3, "0").replace(/0+$/, "");
  return `${whole}.${frac}`;
}

const PACE_PATTERN = /^(\d{1,2}):([0-5]\d)$/;

export function parsePaceToSecondsPerKm(input: string): number {
  const match = PACE_PATTERN.exec(input.trim());
  if (!match) {
    throw new Error("Ritmo inválido (usa m:ss o mm:ss)");
  }
  const minutes = Number.parseInt(match[1], 10);
  const seconds = Number.parseInt(match[2], 10);
  const total = minutes * 60 + seconds;
  if (total <= 0) {
    throw new Error("El ritmo debe ser mayor que 0");
  }
  return total;
}

export function formatSecondsPerKmToPace(secondsPerKm: number): string {
  if (!Number.isInteger(secondsPerKm) || secondsPerKm <= 0) {
    throw new Error("El ritmo en segundos debe ser un entero positivo");
  }
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = secondsPerKm % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const DURATION_HMS_PATTERN = /^(\d+):([0-5]\d):([0-5]\d)$/;
const DURATION_MS_PATTERN = /^(\d+):([0-5]\d)$/;
const DURATION_MIN_PATTERN = /^(\d+)$/;

export function parseDurationToSeconds(input: string): number {
  const trimmed = input.trim();
  let total = 0;

  const hms = DURATION_HMS_PATTERN.exec(trimmed);
  const ms = DURATION_MS_PATTERN.exec(trimmed);
  const mins = DURATION_MIN_PATTERN.exec(trimmed);

  if (hms) {
    total =
      Number.parseInt(hms[1], 10) * 3600 +
      Number.parseInt(hms[2], 10) * 60 +
      Number.parseInt(hms[3], 10);
  } else if (ms) {
    total = Number.parseInt(ms[1], 10) * 60 + Number.parseInt(ms[2], 10);
  } else if (mins) {
    total = Number.parseInt(mins[1], 10) * 60;
  } else {
    throw new Error("Duración inválida (usa mm:ss, hh:mm:ss o minutos)");
  }

  if (total <= 0) {
    throw new Error("La duración debe ser mayor que 0");
  }
  return total;
}

export function formatSecondsToDuration(totalSeconds: number): string {
  if (!Number.isInteger(totalSeconds) || totalSeconds <= 0) {
    throw new Error("La duración en segundos debe ser un entero positivo");
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoCalendarDay(dateStr: string): CalendarDay {
  const match = ISO_DATE_PATTERN.exec(dateStr.trim());
  if (!match) {
    throw new Error("Fecha inválida (usa YYYY-MM-DD)");
  }
  return {
    year: Number.parseInt(match[1], 10),
    month: Number.parseInt(match[2], 10),
    day: Number.parseInt(match[3], 10),
  };
}

export function computeScheduledAtUtc(
  startDate: string,
  dayOffset: number,
  timezone: string,
): Date {
  if (!Number.isInteger(dayOffset) || dayOffset < 0) {
    throw new Error("dayOffset debe ser un entero >= 0");
  }
  const start = parseIsoCalendarDay(startDate);
  const targetDay = addCalendarDays(start, dayOffset);
  return clubMidnightToUtc(targetDay, timezone);
}
