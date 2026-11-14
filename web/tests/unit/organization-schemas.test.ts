import { describe, expect, it } from "vitest";
import { createOrganizationSchema, NAME_MAX_LENGTH, updateOrganizationSchema } from "@/lib/org/schemas";

const VALID = { description: "Salimos los martes", timezone: "Europe/Madrid" };

describe("updateOrganizationSchema", () => {
  it("accepts a valid description and IANA time zone", () => {
    expect(updateOrganizationSchema.safeParse(VALID).success).toBe(true);
  });

  it("accepts a 500-character description and rejects a 501-character one", () => {
    const ok = updateOrganizationSchema.safeParse({ ...VALID, description: "a".repeat(500) });
    const tooLong = updateOrganizationSchema.safeParse({ ...VALID, description: "a".repeat(501) });

    expect(ok.success).toBe(true);
    expect(tooLong.success).toBe(false);
  });

  it("accepts null to remove the description", () => {
    expect(updateOrganizationSchema.safeParse({ ...VALID, description: null }).success).toBe(true);
  });

  it("rejects a time zone that does not exist", () => {
    expect(updateOrganizationSchema.safeParse({ ...VALID, timezone: "Mars/Olympus" }).success).toBe(
      false,
    );
  });

  it("rejects aliases such as UTC: only the Intl.supportedValuesOf list", () => {
    expect(updateOrganizationSchema.safeParse({ ...VALID, timezone: "UTC" }).success).toBe(false);
  });
});

const MANAGER_A = "00000000-0000-4000-8000-000000000001";
const MANAGER_B = "00000000-0000-4000-8000-000000000002";
const NEW_CLUB = { ...VALID, name: "Club de prueba", managerIds: [MANAGER_A] };

describe("createOrganizationSchema", () => {
  it("accepts a club with name, description, time zone and one Manager", () => {
    expect(createOrganizationSchema.safeParse(NEW_CLUB).success).toBe(true);
  });

  it("accepts several initial Managers", () => {
    const input = { ...NEW_CLUB, managerIds: [MANAGER_A, MANAGER_B] };

    expect(createOrganizationSchema.safeParse(input).success).toBe(true);
  });

  it("rejects a club without Managers", () => {
    expect(createOrganizationSchema.safeParse({ ...NEW_CLUB, managerIds: [] }).success).toBe(false);
  });

  it("rejects the same Manager twice", () => {
    const input = { ...NEW_CLUB, managerIds: [MANAGER_A, MANAGER_A] };

    expect(createOrganizationSchema.safeParse(input).success).toBe(false);
  });

  it("rejects the same Manager twice in different capitalization", () => {
    const input = { ...NEW_CLUB, managerIds: [MANAGER_A, MANAGER_A.toUpperCase()] };

    expect(createOrganizationSchema.safeParse(input).success).toBe(false);
  });

  it("lower-cases the Manager ids", () => {
    const parsed = createOrganizationSchema.parse({ ...NEW_CLUB, managerIds: [MANAGER_A.toUpperCase()] });

    expect(parsed.managerIds).toEqual([MANAGER_A]);
  });

  it("accepts a 100-character name and rejects a 101-character one", () => {
    expect(createOrganizationSchema.safeParse({ ...NEW_CLUB, name: "a".repeat(NAME_MAX_LENGTH) }).success).toBe(true);
    expect(createOrganizationSchema.safeParse({ ...NEW_CLUB, name: "a".repeat(NAME_MAX_LENGTH + 1) }).success).toBe(false);
  });

  it("counts the name after trimming", () => {
    const name = ` ${"a".repeat(NAME_MAX_LENGTH)} `;

    expect(createOrganizationSchema.safeParse({ ...NEW_CLUB, name }).success).toBe(true);
  });

  it("rejects a Manager id that is not a uuid", () => {
    const input = { ...NEW_CLUB, managerIds: ["no-es-un-id"] };

    expect(createOrganizationSchema.safeParse(input).success).toBe(false);
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(createOrganizationSchema.safeParse({ ...NEW_CLUB, name: "" }).success).toBe(false);
    expect(createOrganizationSchema.safeParse({ ...NEW_CLUB, name: "   " }).success).toBe(false);
  });

  it("trims the spaces at both ends of the name", () => {
    const parsed = createOrganizationSchema.parse({ ...NEW_CLUB, name: "  Club  " });

    expect(parsed.name).toBe("Club");
  });

  it("applies the same description and time zone rules as editing", () => {
    expect(
      createOrganizationSchema.safeParse({ ...NEW_CLUB, description: "a".repeat(501) }).success,
    ).toBe(false);
    expect(
      createOrganizationSchema.safeParse({ ...NEW_CLUB, timezone: "Mars/Olympus" }).success,
    ).toBe(false);
  });
});
