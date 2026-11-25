import { describe, expect, it } from "vitest";
import { EXPORTS_DIR, exportZipPath } from "@/lib/gdpr/export/export-zip-path";

describe("exportZipPath", () => {
  it("is exports/<id>.zip, relative to the uploads directory", () => {
    expect(exportZipPath("abc")).toBe("exports/abc.zip");
  });

  it("lives inside EXPORTS_DIR", () => {
    expect(exportZipPath("abc").startsWith(`${EXPORTS_DIR}/`)).toBe(true);
  });
});
