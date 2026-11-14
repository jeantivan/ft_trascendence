import { z } from "zod";

export const DESCRIPTION_MAX_LENGTH = 500;

// No project rule covers a club name (nick is 30, password 72), so 100 for this form:
// room for a long club name, short enough to fit a catalog row
export const NAME_MAX_LENGTH = 100;

// Postgres compares uuids case-insensitively, JavaScript strings do not: every id is
// lower-cased before it is compared, deduplicated or stored
export function normalizeId(id: string): string {
  return id.toLowerCase();
}

// z.guid(), not z.uuid(): see org-role.ts
export const idSchema = z.guid().transform(normalizeId);

// Computed once: the list is the same for the whole process. It holds the canonical IANA
// names ("Europe/Madrid") but not "UTC", which is accepted on its own below
const IANA_TIMEZONES = new Set(Intl.supportedValuesOf("timeZone"));

export const updateOrganizationSchema = z.object({
  // null removes the description (the column is optional)
  description: z.string().max(DESCRIPTION_MAX_LENGTH).nullable(),
  timezone: z.string().refine((zone) => zone === "UTC" || IANA_TIMEZONES.has(zone), {
    message: "Not an IANA time zone",
  }),
});

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

// What the Admin gives to create a club: what a Manager can edit, plus the name
// and the first Managers (a club never exists without one)
export const createOrganizationSchema = updateOrganizationSchema.extend({
  name: z.string().trim().min(1).max(NAME_MAX_LENGTH),
  managerIds: z
    .array(idSchema)
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Duplicate Manager",
    }),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
