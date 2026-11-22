import { z } from "zod";
import { SessionType } from "@/generated/prisma/enums";
import type { RpeValue } from "./rpe";

export const POSTGRES_INT_MAX = 2_147_483_647;
// Capped well below Date's +-100M-day limit so clubMidnightToUtc never overflows
export const MAX_DAY_OFFSET = 3650;
// Matches the 2-digit minute display cap (99:59) in formatSecondsPerKmToPace
export const MAX_PACE_SECONDS = 99 * 60 + 59;
// Matches the 2-digit hour display cap (99:59:59) in formatSecondsToDuration
export const MAX_DURATION_SECONDS = 99 * 3600 + 59 * 60 + 59;

export const trainingTemplateNameSchema = z
  .string()
  .trim()
  .min(1, "El nombre es obligatorio")
  .max(100, "El nombre no puede superar los 100 caracteres");

export const sessionTypeSchema = z.enum(SessionType);

export type { SessionType };

/** Builds a nullable positive integer target schema defaulting omitted fields to null. */
function optionalPositiveInt(max: number) {
  return z.number().int().positive().max(max).nullable().default(null);
}

export const templateSessionSchema = z
  .object({
    sessionType: sessionTypeSchema,
    dayOffset: z.number().int().min(0).max(MAX_DAY_OFFSET),
    targetDistanceM: optionalPositiveInt(POSTGRES_INT_MAX),
    targetDurationS: optionalPositiveInt(MAX_DURATION_SECONDS),
    targetPaceSPerKm: optionalPositiveInt(MAX_PACE_SECONDS),
  })
  .strict();

export type TemplateSessionInput = z.infer<typeof templateSessionSchema>;

export const trainingTemplateSchema = z
  .object({
    name: trainingTemplateNameSchema,
    sessions: z
      .array(templateSessionSchema)
      .min(1, "La plantilla debe tener al menos una sesión"),
  })
  .strict()
  .transform((template) => ({
    ...template,
    sessions: template.sessions.map((session, index) => ({
      ...session,
      position: index,
    })),
  }));

export type TrainingTemplateInput = z.infer<typeof trainingTemplateSchema>;
export type NormalizedTemplateSessionInput =
  TrainingTemplateInput["sessions"][number];

export const incompletionReasonSchema = z.enum([
  "time_constraints",
  "schedule_conflict",
  "route_unavailable",
  "equipment_issue",
  "other",
]);

export type IncompletionReason = z.infer<typeof incompletionReasonSchema>;

const heartRateBpmSchema = z.number().int().min(30).max(250).optional();

export const sessionLogExtraSchema = z
  .object({
    incompletion_reason: incompletionReasonSchema.optional(),
    avg_heart_rate_bpm: heartRateBpmSchema,
    max_heart_rate_bpm: heartRateBpmSchema,
  })
  .strict()
  .refine(
    (extra) =>
      extra.avg_heart_rate_bpm === undefined ||
      extra.max_heart_rate_bpm === undefined ||
      extra.max_heart_rate_bpm >= extra.avg_heart_rate_bpm,
    {
      message: "La frecuencia cardíaca máxima no puede ser menor que la media",
      path: ["max_heart_rate_bpm"],
    },
  );

export type SessionLogExtra = z.infer<typeof sessionLogExtraSchema>;

function isRpeValue(value: number): value is RpeValue {
  return Number.isInteger(value) && value >= 1 && value <= 10;
}

// Type guard narrows inferred type from number to RpeValue
export const rpeSchema = z.number().int().min(1).max(10).refine(isRpeValue);

export const sessionLogSchema = z
  .object({
    completed: z.boolean(),
    rpe: rpeSchema.nullable().default(null),
    distanceM: optionalPositiveInt(POSTGRES_INT_MAX),
    durationS: optionalPositiveInt(MAX_DURATION_SECONDS),
    extra: sessionLogExtraSchema.nullable().default(null),
  })
  .strict()
  .refine(
    (log) => !(log.completed && log.extra?.incompletion_reason !== undefined),
    {
      message:
        "Una sesión completada no puede incluir un motivo de no finalización",
      path: ["extra", "incompletion_reason"],
    },
  );

export type SessionLogInput = z.infer<typeof sessionLogSchema>;
