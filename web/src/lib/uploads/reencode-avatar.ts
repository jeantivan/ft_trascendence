// Turns an accepted avatar into a new image before it is stored (#223). A phone photo
// can carry GPS coordinates in its EXIF or XMP, and every club member can download
// an avatar: storing a freshly encoded image means nothing is copied unless we ask.

import sharp from "sharp";

// A file of a few KB can claim millions of pixels, and decoding them all takes memory
const MAX_INPUT_SIDE = 8000;
// Avatars show at 64 px at most: 512 leaves room for sharp screens and later designs
const MAX_OUTPUT_SIDE = 512;

// The reason is a value, not an exception: the route picks the HTTP status
export type ReencodedAvatar =
  | { ok: true; bytes: Uint8Array; mimeType: "image/webp"; extension: "webp" }
  | { ok: false; reason: "too_many_pixels" | "undecodable" };

// The input must have passed checkImage first, so sharp only ever sees PNG, JPEG or WebP
// (never SVG, TIFF or GIF, which it can read too).
export async function reencodeAvatar(input: Uint8Array): Promise<ReencodedAvatar> {
  try {
    // metadata() only reads the header, so a huge image is refused before decoding it.
    // Per side: turning the photo upright only swaps them. With no area limit here,
    // because sharp applies limitInputPixels when reading the header too: with it, an
    // 8001 × 8001 image would throw before this check and the route would answer 500.
    const { width, height } = await sharp(input, { limitInputPixels: false }).metadata();
    if (width > MAX_INPUT_SIDE || height > MAX_INPUT_SIDE) {
      return { ok: false, reason: "too_many_pixels" };
    }

    // Second barrier, for a header that lies about its size: sharp refuses to decode more
    // pixels than this. No test: such a file cannot be built without a tool of our own.
    const image = sharp(input, { limitInputPixels: MAX_INPUT_SIDE * MAX_INPUT_SIDE });

    // sharp drops all metadata unless told to keep it (keepMetadata, withMetadata,
    // withExif, withXmp): none of those may ever be called here. The EXIF orientation
    // goes too, so autoOrient turns the pixels first, or upright photos would be sideways.
    const bytes = await image
      .autoOrient()
      // Inside the box keeps the proportions without cropping; smaller images stay as they are
      .resize(MAX_OUTPUT_SIDE, MAX_OUTPUT_SIDE, { fit: "inside", withoutEnlargement: true })
      .webp()
      .toBuffer();
    return { ok: true, bytes, mimeType: "image/webp", extension: "webp" };
  } catch {
    // Any sharp error here comes from the bytes the client sent: broken data, a decode
    // warning (failOn's default, "warning"), or the second barrier. A missing sharp
    // binary is not caught: the import above fails and the route answers 500, our fault.
    return { ok: false, reason: "undecodable" };
  }
}
