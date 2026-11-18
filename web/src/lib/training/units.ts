import { z } from "zod";
import {
  addCalendarDays,
  clubMidnightToUtc,
  type CalendarDay,
} from "@/lib/time/club-time";
import {
  MAX_DAY_OFFSET,
  MAX_DURATION_SECONDS,
  MAX_PACE_SECONDS,
  POSTGRES_INT_MAX,
} from "./schemas";

function assertIntRange(
  value: number,
  min: number,
  max: number,
  message: string,
): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(message);
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function stringParserSchema<T>(parser: (input: string) => T) {
  return z.string().transform((value, ctx) => {
    try {
      return parser(value);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "Valor inválido",
      });
      return z.NEVER;
    }
  });
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

  if (meters <= 0) {
    throw new Error("La distancia debe ser mayor que 0 km");
  }
  assertIntRange(
    meters,
    1,
    POSTGRES_INT_MAX,
    "La distancia supera el máximo permitido",
  );
  return meters;
}

export const kmToMetersSchema = stringParserSchema(parseKmToMeters);

export function formatMetersToKm(meters: number): string {
  assertIntRange(
    meters,
    1,
    POSTGRES_INT_MAX,
    `Los metros deben ser un entero positivo (máx. ${POSTGRES_INT_MAX})`,
  );

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

export const paceToSecondsSchema = stringParserSchema(parsePaceToSecondsPerKm);

export function formatSecondsPerKmToPace(secondsPerKm: number): string {
  assertIntRange(
    secondsPerKm,
    1,
    MAX_PACE_SECONDS,
    `El ritmo en segundos debe ser un entero positivo menor o igual a ${MAX_PACE_SECONDS}`,
  );
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = secondsPerKm % 60;
  return `${minutes}:${pad2(seconds)}`;
}

const DURATION_HMS_PATTERN = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/;
// Restrict mm:ss minutes to 00-59 so values like "75:00" are not confused with hh:mm
const DURATION_MS_PATTERN = /^([0-5]?\d):([0-5]\d)$/;
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
    throw new Error(
      "Duración inválida (usa mm:ss, hh:mm:ss o minutos, p. ej. 75 o 1:15:00)",
    );
  }

  if (total <= 0) {
    throw new Error("La duración debe ser mayor que 0");
  }
  assertIntRange(
    total,
    1,
    MAX_DURATION_SECONDS,
    "La duración máxima es de 99:59:59",
  );
  return total;
}

export const durationToSecondsSchema = stringParserSchema(parseDurationToSeconds);

export function formatSecondsToDuration(totalSeconds: number): string {
  assertIntRange(
    totalSeconds,
    1,
    MAX_DURATION_SECONDS,
    `La duración en segundos debe ser un entero entre 1 y ${MAX_DURATION_SECONDS}`,
  );

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
  }
  return `${pad2(minutes)}:${pad2(seconds)}`;
}

// Unix epoch start: avoids pre-1970 edge cases and Date.UTC's 0..99 -> 1900..1999 quirk
const MIN_CALENDAR_YEAR = 1970;
const isoDateSchema = z.iso.date();

export function parseIsoCalendarDay(dateStr: string): CalendarDay {
  const result = isoDateSchema.safeParse(dateStr.trim());
  if (!result.success) {
    throw new Error("Fecha inválida (usa YYYY-MM-DD válido)");
  }
  const [year, month, day] = result.data.split("-").map(Number);
  if (year < MIN_CALENDAR_YEAR) {
    throw new Error(
      `El año debe ser igual o posterior a ${MIN_CALENDAR_YEAR}`,
    );
  }
  return { year, month, day };
}

export const isoCalendarDaySchema = stringParserSchema(parseIsoCalendarDay);

export function computeScheduledAtUtc(
  startDate: string,
  dayOffset: number,
  timezone: string,
): Date {
  assertIntRange(
    dayOffset,
    0,
    MAX_DAY_OFFSET,
    `dayOffset debe ser un entero entre 0 y ${MAX_DAY_OFFSET}`,
  );
  const start = parseIsoCalendarDay(startDate);
  const targetDay = addCalendarDays(start, dayOffset);
  return clubMidnightToUtc(targetDay, timezone);
}
