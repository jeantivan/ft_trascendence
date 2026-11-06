import { describe, expect, it } from "vitest";
import { checkImage } from "@/lib/uploads/check-image";

// Written here, not imported, so changing the limit in the code breaks this test
const TWO_MB = 2 * 1024 * 1024;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
// "RIFF", 4 bytes of file size (any value), "WEBP"
const WEBP_SIGNATURE = [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50];

// A file of `length` bytes that starts with `signature`; the rest stays at 0
function fileStartingWith(signature: number[], length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  bytes.set(signature);
  return bytes;
}

describe("checkImage", () => {
  it("accepts a PNG", () => {
    expect(checkImage(fileStartingWith(PNG_SIGNATURE, 100))).toEqual({
      ok: true,
      mimeType: "image/png",
      extension: "png",
    });
  });

  it("accepts a JPEG", () => {
    expect(checkImage(fileStartingWith(JPEG_SIGNATURE, 100))).toEqual({
      ok: true,
      mimeType: "image/jpeg",
      extension: "jpg",
    });
  });

  it("accepts a WebP", () => {
    expect(checkImage(fileStartingWith(WEBP_SIGNATURE, 100))).toEqual({
      ok: true,
      mimeType: "image/webp",
      extension: "webp",
    });
  });

  it("rejects plain text", () => {
    const text = new TextEncoder().encode("hello, this is not an image");
    expect(checkImage(text)).toEqual({ ok: false, reason: "unsupported_type" });
  });

  it("rejects a RIFF file that is not WebP", () => {
    // "RIFF" + size + "WAVE": an audio file with the same first 4 bytes as WebP
    const wave = [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45];
    expect(checkImage(fileStartingWith(wave, 100))).toEqual({ ok: false, reason: "unsupported_type" });
  });

  it("rejects an empty file", () => {
    expect(checkImage(new Uint8Array(0))).toEqual({ ok: false, reason: "unsupported_type" });
  });

  it("rejects a file shorter than the signature", () => {
    // Only the first 4 bytes of a PNG: must not read past the end
    expect(checkImage(new Uint8Array(PNG_SIGNATURE.slice(0, 4)))).toEqual({
      ok: false,
      reason: "unsupported_type",
    });
  });

  it("accepts exactly 2 MB", () => {
    expect(checkImage(fileStartingWith(PNG_SIGNATURE, TWO_MB)).ok).toBe(true);
  });

  it("rejects one byte over 2 MB", () => {
    expect(checkImage(fileStartingWith(PNG_SIGNATURE, TWO_MB + 1))).toEqual({
      ok: false,
      reason: "too_large",
    });
  });
});
