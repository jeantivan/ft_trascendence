import { z } from "zod";
import { SessionType } from "@/generated/prisma/enums";

export const POSTGRES_INT_MAX = 2_147_483_647;

export const trainingTemplateNameSchema = z
  .string()
  .trim()
  .min(1, "El nombre es obligatorio")
  .max(100, "El nombre no puede superar los 100 caracteres");

export const sessionTypeSchema = z.enum(SessionType);

export type { SessionType };

export const templateSessionSchema = z.object({
  sessionType: sessionTypeSchema,
  dayOffset: z.number().int().min(0).max(POSTGRES_INT_MAX),
  position: z.number().int().min(0).max(POSTGRES_INT_MAX).optional(),
  targetDistanceM: z
    .number()
    .int()
    .positive()
    .max(POSTGRES_INT_MAX)
    .nullable()
    .optional(),
  targetDurationS: z
    .number()
    .int()
    .positive()
    .max(POSTGRES_INT_MAX)
    .nullable()
    .optional(),
  targetPaceSPerKm: z
    .number()
    .int()
    .positive()
    .max(POSTGRES_INT_MAX)
    .nullable()
    .optional(),
});

export type TemplateSessionInput = z.input<typeof templateSessionSchema>;
export type TemplateSession = z.infer<typeof templateSessionSchema>;

export const trainingTemplateSchema = z
  .object({
    name: trainingTemplateNameSchema,
    sessions: z
      .array(templateSessionSchema)
      .min(1, "La plantilla debe tener al menos una sesión"),
  })
  .transform((template) => ({
    ...template,
    sessions: template.sessions.map((session, index) => ({
      ...session,
      position: index,
    })),
  }));

export type TrainingTemplateInput = z.input<typeof trainingTemplateSchema>;
export type TrainingTemplate = z.infer<typeof trainingTemplateSchema>;
