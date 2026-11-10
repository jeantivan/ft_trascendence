import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .email("Formato de email no válido")
  .toLowerCase();

export const nickSchema = z
  .string()
  .trim()
  .min(2, "El nick debe tener al menos 2 caracteres")
  .max(30, "El nick no puede superar los 30 caracteres");

export const passwordSchema = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .max(72, "La contraseña no puede superar los 72 caracteres");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "La contraseña no puede estar vacía"),
});

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  nick: nickSchema,
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
