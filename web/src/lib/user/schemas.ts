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

export const updatePrivacySchema = z
  .object({
    statsPublic: z.boolean().optional(),
    showOnline: z.boolean().optional(),
    notificationsEnabled: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.statsPublic !== undefined ||
      data.showOnline !== undefined ||
      data.notificationsEnabled !== undefined,
    { message: "At least one privacy setting must be provided" }
  );

export const purgeHealthDataSchema = z.object({
  confirm: z.literal(true),
});

export type UpdateNickInput = z.infer<typeof updateNickSchema>;
export type UpdateEmailInput = z.infer<typeof updateEmailSchema>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;
export type UpdatePrivacyInput = z.infer<typeof updatePrivacySchema>;
export type PurgeHealthDataInput = z.infer<typeof purgeHealthDataSchema>;
