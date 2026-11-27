import { z } from "zod";
import { SessionType } from "@/generated/prisma/enums";
import { idSchema } from "@/lib/org/schemas";
import type { RpeValue } from "./rpe";
import {
  areSessionMetricsConsistent,
  MAX_DAY_OFFSET,
  MAX_DURATION_SECONDS,
  MAX_PACE_SECONDS,
  POSTGRES_INT_MAX,
} from "./units";

export {
  MAX_DAY_OFFSET,
  MAX_DURATION_SECONDS,
  MAX_PACE_SECONDS,
  POSTGRES_INT_MAX,
};

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

/** Builds a nullable positive integer target schema for partial updates (omitted stays undefined). */
function updatablePositiveInt(max: number) {
  return z.number().int().positive().max(max).nullable().optional();
}

export const templateSessionSchema = z
  .object({
    sessionType: sessionTypeSchema,
    dayOffset: z.number().int().min(0).max(MAX_DAY_OFFSET),
    targetDistanceM: optionalPositiveInt(POSTGRES_INT_MAX),
    targetDurationS: optionalPositiveInt(MAX_DURATION_SECONDS),
    targetPaceSPerKm: optionalPositiveInt(MAX_PACE_SECONDS),
  })
  .strict()
  .refine(
    (session) =>
      areSessionMetricsConsistent(
        session.targetDistanceM,
        session.targetPaceSPerKm,
        session.targetDurationS,
      ),
    {
      message: "La distancia, el ritmo y la duración no son coherentes entre sí",
      path: ["targetDurationS"],
    },
  );

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

export const calendarDateSchema = z
  .string()
  .trim()
  .pipe(z.iso.date("Fecha inválida (usa YYYY-MM-DD válido)"))
  .refine((value) => Number(value.slice(0, 4)) >= 1970, {
    message: "El año debe ser igual o posterior a 1970",
  });

export const assignTrainingTemplateSchema = z
  .object({
    templateId: idSchema,
    groupId: idSchema,
    // Past startDates (>= 1970) are intentionally allowed (#135) so managers can backfill blocks.
    startDate: calendarDateSchema,
  })
  .strict();

export type AssignTrainingTemplatePayload = z.infer<
  typeof assignTrainingTemplateSchema
>;

export const createCustomizedSessionSchema = z
  .object({
    athleteId: idSchema,
    customizesSessionId: idSchema.nullable().default(null),
    sessionType: sessionTypeSchema,
    scheduledAt: calendarDateSchema,
    targetDistanceM: optionalPositiveInt(POSTGRES_INT_MAX),
    targetDurationS: optionalPositiveInt(MAX_DURATION_SECONDS),
    targetPaceSPerKm: optionalPositiveInt(MAX_PACE_SECONDS),
  })
  .strict();

export type CreateCustomizedSessionPayload = z.infer<
  typeof createCustomizedSessionSchema
>;

export const updateManagerSessionSchema = z
  .object({
    sessionType: sessionTypeSchema.optional(),
    scheduledAt: calendarDateSchema.optional(),
    targetDistanceM: updatablePositiveInt(POSTGRES_INT_MAX),
    targetDurationS: updatablePositiveInt(MAX_DURATION_SECONDS),
    targetPaceSPerKm: updatablePositiveInt(MAX_PACE_SECONDS),
  })
  .strict()
  .refine(
    (data) =>
      data.sessionType !== undefined ||
      data.scheduledAt !== undefined ||
      data.targetDistanceM !== undefined ||
      data.targetDurationS !== undefined ||
      data.targetPaceSPerKm !== undefined,
    { message: "Debe proporcionar al menos un campo para actualizar" },
  );

export type UpdateManagerSessionPayload = z.infer<
  typeof updateManagerSessionSchema
>;

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
