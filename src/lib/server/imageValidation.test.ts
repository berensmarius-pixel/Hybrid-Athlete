import { describe, expect, it } from "vitest";
import { detectImageMime } from "@/lib/server/imageValidation";

function jpeg(): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
    0x49, 0x46, 0x00, 0x01,
  ]);
}

describe("detectImageMime", () => {
  it("erkennt JPEG an den Magic Bytes", () => {
    expect(detectImageMime(jpeg())).toBe("image/jpeg");
  });

  it("erkennt PNG", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
    expect(detectImageMime(png)).toBe("image/png");
  });

  it("erkennt GIF87a/GIF89a", () => {
    const gif = new Uint8Array([...new TextEncoder().encode("GIF89a"), 1, 2, 3, 4, 5, 6]);
    expect(detectImageMime(gif)).toBe("image/gif");
  });

  it("erkennt WEBP (RIFF....WEBP)", () => {
    const webp = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50,
    ]);
    expect(detectImageMime(webp)).toBe("image/webp");
  });

  it("erkennt HEIC über die ftyp-Box", () => {
    const heic = new Uint8Array([
      0x00, 0x00, 0x00, 0x18,
      0x66, 0x74, 0x79, 0x70, // 'ftyp'
      0x68, 0x65, 0x69, 0x63, // 'heic'
      0, 0, 0, 0,
    ]);
    expect(detectImageMime(heic)).toBe("image/heic");
  });

  it("lehnt HTML-Payload ab (getarnte Uploads)", () => {
    const html = new TextEncoder().encode("<!DOCTYPE html><script>alert(1)</script>");
    expect(detectImageMime(html)).toBeNull();
  });

  it("lehnt zu kurze Buffers ab", () => {
    expect(detectImageMime(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });
});
