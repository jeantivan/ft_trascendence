import { z } from "zod";

export const createEventSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "El título no puede estar vacío")
    .max(100, "El título no puede superar los 100 caracteres"),
  location: z
    .string()
    .trim()
    .min(1, "El lugar no puede estar vacío")
    .max(200, "El lugar no puede superar los 200 caracteres"),
  // The club's wall clock, without a zone: the server converts it with organization.timezone.
  // The regex because local: true still accepts a final "Z"
  startsAt: z.iso
    .datetime({ local: true, precision: -1, error: "Fecha y hora no válidas" })
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Fecha y hora no válidas"),
  sessionId: z.guid().nullable(),
});
