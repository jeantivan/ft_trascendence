import { z } from "zod";
import { SessionType } from "@/generated/prisma/enums";
import { idSchema } from "@/lib/org/schemas";

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

export const assignTrainingTemplateSchema = z
  .object({
    templateId: idSchema,
    groupId: idSchema,
    startDate: z
      .string()
      .trim()
      .pipe(z.iso.date("Fecha inválida (usa YYYY-MM-DD válido)"))
      .refine((value) => Number(value.slice(0, 4)) >= 1970, {
        message: "El año debe ser igual o posterior a 1970",
      }),
  })
  .strict();

export type AssignTrainingTemplatePayload = z.infer<
  typeof assignTrainingTemplateSchema
>;
