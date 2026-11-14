import { z } from "zod";

export const trainingTemplateNameSchema = z
  .string()
  .trim()
  .min(1, "El nombre es obligatorio")
  .max(100, "El nombre no puede superar los 100 caracteres");

export const SESSION_TYPES = [
  "rodaje",
  "intervalos",
  "cuestas",
  "tirada_larga",
  "fartlek",
] as const;

export const sessionTypeSchema = z.enum(SESSION_TYPES);

export type SessionType = z.infer<typeof sessionTypeSchema>;

export const templateSessionSchema = z.object({
  sessionType: sessionTypeSchema,
  dayOffset: z.number().int().min(0),
  position: z.number().int().min(0).optional(),
  targetDistanceM: z.number().int().positive().nullable().optional(),
  targetDurationS: z.number().int().positive().nullable().optional(),
  targetPaceSPerKm: z.number().int().positive().nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export type TemplateSessionInput = z.infer<typeof templateSessionSchema>;

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

export type TrainingTemplateInput = z.infer<typeof trainingTemplateSchema>;
