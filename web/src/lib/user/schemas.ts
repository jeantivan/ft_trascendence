import { z } from "zod";
import { emailSchema, nickSchema, passwordSchema } from "@/lib/auth/schemas";

export const updateNickSchema = z.object({
  nick: nickSchema,
});

export const updateEmailSchema = z.object({
  email: emailSchema,
  currentPassword: z.string().optional(),
});

export const updatePasswordSchema = z.object({
  newPassword: passwordSchema,
  currentPassword: z.string().optional(),
});

export type UpdateNickInput = z.infer<typeof updateNickSchema>;
export type UpdateEmailInput = z.infer<typeof updateEmailSchema>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;
