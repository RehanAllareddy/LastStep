import "server-only";
import sharp from "sharp";

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // stays under serverless request-body limits
export const ACCEPTED_MIME = ["image/png", "image/jpeg", "image/webp"] as const;
const MAX_DIMENSION = 12_000;
const MAX_PIXELS = 50_000_000;
const OUTPUT_MAX_EDGE = 2400;

export type ImageCheck =
  | { ok: true; buffer: Buffer; width: number; height: number; mime: "image/webp" }
  | { ok: false; reason: "too_large" | "empty" | "unsupported_type" | "malformed" | "dimensions" };

/** Detects the real format from magic bytes (extensions and client MIME are not trusted). */
export function sniffImageType(buf: Uint8Array): "png" | "jpeg" | "webp" | null {
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  )
    return "png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  )
    return "webp";
  return null;
}

/**
 * Validates and re-encodes an uploaded screenshot to WebP. Re-encoding
 * drops EXIF/GPS/XMP metadata (sharp strips metadata unless asked to keep it)
 * and neutralizes polyglot payloads.
 */
export async function processScreenshot(input: Buffer): Promise<ImageCheck> {
  if (input.length === 0) return { ok: false, reason: "empty" };
  if (input.length > MAX_UPLOAD_BYTES) return { ok: false, reason: "too_large" };
  const sniffed = sniffImageType(input);
  if (!sniffed) return { ok: false, reason: "unsupported_type" };
  try {
    const meta = await sharp(input, { limitInputPixels: MAX_PIXELS, failOn: "error" }).metadata();
    if (meta.format !== sniffed && !(sniffed === "jpeg" && meta.format === "jpeg"))
      return { ok: false, reason: "malformed" };
    if (!meta.width || !meta.height || meta.width > MAX_DIMENSION || meta.height > MAX_DIMENSION) {
      return { ok: false, reason: "dimensions" };
    }
    const { data, info } = await sharp(input, { limitInputPixels: MAX_PIXELS, failOn: "error", animated: false })
      .rotate()
      .resize({ width: OUTPUT_MAX_EDGE, height: OUTPUT_MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return { ok: true, buffer: data, width: info.width, height: info.height, mime: "image/webp" };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}

export const IMAGE_ERROR_MESSAGES: Record<Exclude<ImageCheck, { ok: true }>["reason"], string> = {
  too_large: "That file is larger than 4 MB. Try a smaller screenshot.",
  empty: "That file is empty.",
  unsupported_type: "Upload a PNG, JPEG, or WebP image.",
  malformed: "We couldn't read that image. Try exporting the screenshot again.",
  dimensions: "That image's dimensions are too large.",
};
