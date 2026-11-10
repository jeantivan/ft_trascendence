import { z } from "zod";

export const updateNickSchema = z.object({
  nick: z
    .string()
    .trim()
    .min(2, "El alias debe tener al menos 2 caracteres")
    .max(30, "El alias no puede superar los 30 caracteres"),
});

export const updateEmailSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Formato de email no válido")
    .toLowerCase(),
  currentPassword: z.string().optional(),
});

export const updatePasswordSchema = z.object({
  newPassword: z
    .string()
    .min(8, "La nueva contraseña debe tener al menos 8 caracteres"),
  currentPassword: z.string().optional(),
});

export type UpdateNickInput = z.infer<typeof updateNickSchema>;
export type UpdateEmailInput = z.infer<typeof updateEmailSchema>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;
