import { z } from "zod";

export const DESCRIPTION_MAX_LENGTH = 500;

// Computed once: the list is the same for the whole process. Aliases such as
// "UTC" are not in it, only the canonical IANA names ("Europe/Madrid")
const IANA_TIMEZONES = new Set(Intl.supportedValuesOf("timeZone"));

export const updateOrganizationSchema = z.object({
  // null removes the description (the column is optional)
  description: z.string().max(DESCRIPTION_MAX_LENGTH).nullable(),
  timezone: z.string().refine((zone) => IANA_TIMEZONES.has(zone), {
    message: "Not an IANA time zone",
  }),
});

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

// What the Admin gives to create a club: what a Manager can edit, plus the name
// and the first Managers (a club never exists without one)
export const createOrganizationSchema = updateOrganizationSchema.extend({
  name: z.string().trim().min(1),
  managerIds: z
    .array(
      // z.guid(), not z.uuid(): see org-role.ts
      z.guid(),
    )
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Duplicate Manager",
    }),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
