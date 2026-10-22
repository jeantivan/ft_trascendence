import { z } from "zod";

export const loginSchema = z.object({
  email: z.email("Formato de email no válido").toLowerCase(),
  password: z.string().min(1, "La contraseña no puede estar vacía"),
});

export const registerSchema = z.object({
  email: z.email("Formato de email no válido").toLowerCase(),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  nick: z.string().trim().min(2, "El nick debe tener al menos 2 caracteres"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
