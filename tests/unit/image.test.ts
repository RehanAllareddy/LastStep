import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { processScreenshot, sniffImageType, MAX_UPLOAD_BYTES } from "@/lib/submissions/image";

async function jpegWithExif() {
  return sharp({ create: { width: 64, height: 48, channels: 3, background: "#3d4bf5" } })
    .jpeg()
    .withExif({ IFD0: { Make: "SecretPhone", Artist: "Student Name" } })
    .toBuffer();
}

describe("screenshot processing", () => {
  it("detects real formats by magic bytes", async () => {
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#fff" } })
      .png()
      .toBuffer();
    expect(sniffImageType(png)).toBe("png");
    expect(sniffImageType(Buffer.from("GIF89a....."))).toBeNull();
    expect(sniffImageType(Buffer.from("<html>not an image</html>"))).toBeNull();
  });

  it("re-encodes to WebP and strips metadata", async () => {
    const input = await jpegWithExif();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const r = await processScreenshot(input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const meta = await sharp(r.buffer).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    expect(r.buffer.includes(Buffer.from("SecretPhone"))).toBe(false);
  });

  it("rejects disguised, truncated, empty and oversized files", async () => {
    expect(await processScreenshot(Buffer.from("not really a png"))).toEqual({ ok: false, reason: "unsupported_type" });
    const png = await sharp({ create: { width: 50, height: 50, channels: 3, background: "#fff" } })
      .png()
      .toBuffer();
    expect(await processScreenshot(png.subarray(0, 40))).toEqual({ ok: false, reason: "malformed" });
    expect(await processScreenshot(Buffer.alloc(0))).toEqual({ ok: false, reason: "empty" });
    expect(await processScreenshot(Buffer.alloc(MAX_UPLOAD_BYTES + 1))).toEqual({ ok: false, reason: "too_large" });
  });
});
