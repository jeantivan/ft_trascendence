// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildExportEmail } from "@/lib/gdpr/export/export-email";

const LINK = "https://example.test:8443/api/gdpr/export/abc/download?token=xyz";

describe("buildExportEmail", () => {
  it("has the link and a readable expiry date and time in UTC", () => {
    const { text } = buildExportEmail(LINK, new Date("2026-11-22T09:05:00.000Z"));

    expect(text).toContain(LINK);
    expect(text).toContain("22 de noviembre de 2026 a las 09:05 UTC");
  });

  it("says the link only works signed in as the same user", () => {
    const { text } = buildExportEmail(LINK, new Date("2026-11-22T09:05:00.000Z"));

    expect(text).toMatch(/sesión iniciada/);
  });

  it("is plain text (no HTML) with a fixed subject", () => {
    const { subject, text } = buildExportEmail(LINK, new Date("2026-11-22T09:05:00.000Z"));

    expect(subject).toBe("Tu exportación de datos de StrideSync está lista");
    expect(text).not.toMatch(/<[a-z]+/i);
  });

  it("puts no user data in the message", () => {
    const { subject, text } = buildExportEmail(LINK, new Date("2026-11-22T09:05:00.000Z"));

    expect(subject + text).not.toMatch(/runner-nick|@example\.test|99999999-9999-4999-8999-999999999999/);
  });
});
