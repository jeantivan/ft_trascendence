import {
  addCalendarDays,
  clubMidnightToUtc,
  type CalendarDay,
} from "@/lib/time/club-time";
import { POSTGRES_INT_MAX } from "./schemas";

function assertPositiveInt32(value: number, label: string): void {
  if (
    !Number.isInteger(value) ||
    value <= 0 ||
    value > POSTGRES_INT_MAX
  ) {
    throw new Error(`${label} debe ser un entero positivo (máx. ${POSTGRES_INT_MAX})`);
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

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

  assertPositiveInt32(meters, "La distancia en metros");
  return meters;
}

export function formatMetersToKm(meters: number): string {
  assertPositiveInt32(meters, "Los metros");

  const whole = Math.floor(meters / 1000);
  const rem = meters % 1000;
  if (rem === 0) {
    return String(whole);
  }

  const frac = pad2(rem).padStart(3, "0").replace(/0+$/, "");
  return `${whole}.${frac}`;
}

const PACE_PATTERN = /^(\d{1,2}):([0-5]\d)$/;
const MAX_PACE_SECONDS = 99 * 60 + 59; // 99:59 = 5999s

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
  if (
    !Number.isInteger(secondsPerKm) ||
    secondsPerKm <= 0 ||
    secondsPerKm > MAX_PACE_SECONDS
  ) {
    throw new Error(
      `El ritmo en segundos debe ser un entero positivo menor o igual a ${MAX_PACE_SECONDS}`,
    );
  }
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = secondsPerKm % 60;
  return `${minutes}:${pad2(seconds)}`;
}

const DURATION_HMS_PATTERN = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/;
const DURATION_MS_PATTERN = /^(\d{1,2}):([0-5]\d)$/;
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

  assertPositiveInt32(total, "La duración en segundos");
  return total;
}

export function formatSecondsToDuration(totalSeconds: number): string {
  assertPositiveInt32(totalSeconds, "La duración en segundos");

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
  }
  return `${pad2(minutes)}:${pad2(seconds)}`;
}

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoCalendarDay(dateStr: string): CalendarDay {
  const match = ISO_DATE_PATTERN.exec(dateStr.trim());
  if (!match) {
    throw new Error("Fecha inválida (usa YYYY-MM-DD)");
  }
  const parsed: CalendarDay = {
    year: Number.parseInt(match[1], 10),
    month: Number.parseInt(match[2], 10),
    day: Number.parseInt(match[3], 10),
  };

  if (parsed.year < 1) {
    throw new Error("Año inválido");
  }

  const normalized = addCalendarDays(parsed, 0);
  if (
    normalized.year !== parsed.year ||
    normalized.month !== parsed.month ||
    normalized.day !== parsed.day
  ) {
    throw new Error("Fecha inválida (día inexistente en el calendario)");
  }

  return parsed;
}

export function computeScheduledAtUtc(
  startDate: string,
  dayOffset: number,
  timezone: string,
): Date {
  if (
    !Number.isInteger(dayOffset) ||
    dayOffset < 0 ||
    dayOffset > POSTGRES_INT_MAX
  ) {
    throw new Error(
      `dayOffset debe ser un entero entre 0 y ${POSTGRES_INT_MAX}`,
    );
  }
  const start = parseIsoCalendarDay(startDate);
  const targetDay = addCalendarDays(start, dayOffset);
  return clubMidnightToUtc(targetDay, timezone);
}
