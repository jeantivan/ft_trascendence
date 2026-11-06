// Decides whether uploaded bytes are an image we accept (#23).
// The type comes ONLY from the first bytes (magic bytes): the client's Content-Type
// and file name can say anything.

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
// WebP is "RIFF" + 4 bytes of file size + "WEBP"
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46];
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50];

export type ImageCheck =
  | { ok: true; mimeType: "image/png" | "image/jpeg" | "image/webp"; extension: "png" | "jpg" | "webp" }
  | { ok: false; reason: "too_large" | "unsupported_type" };

// True if `signature` appears in `bytes` starting at `offset`
function startsWith(bytes: Uint8Array, signature: number[], offset: number): boolean {
  if (offset + signature.length > bytes.length) {
    return false;
  }
  for (let i = 0; i < signature.length; i++) {
    if (bytes[offset + i] !== signature[i]) {
      return false;
    }
  }
  return true;
}

export function checkImage(bytes: Uint8Array): ImageCheck {
  if (bytes.length > MAX_IMAGE_BYTES) {
    return { ok: false, reason: "too_large" };
  }
  if (startsWith(bytes, PNG_SIGNATURE, 0)) {
    return { ok: true, mimeType: "image/png", extension: "png" };
  }
  if (startsWith(bytes, JPEG_SIGNATURE, 0)) {
    return { ok: true, mimeType: "image/jpeg", extension: "jpg" };
  }
  if (startsWith(bytes, RIFF_SIGNATURE, 0) && startsWith(bytes, WEBP_SIGNATURE, 8)) {
    return { ok: true, mimeType: "image/webp", extension: "webp" };
  }
  return { ok: false, reason: "unsupported_type" };
}
