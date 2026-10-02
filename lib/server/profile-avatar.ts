import sharp from "sharp";
import { MAX_AVATAR_BYTES } from "../profile-avatar";

export class AvatarValidationError extends Error {}

/** Decode bytes rather than trusting the browser's filename or MIME header. */
export async function prepareProfileAvatar(file: File): Promise<Buffer> {
  if (file.size === 0 || file.size > MAX_AVATAR_BYTES) {
    throw new AvatarValidationError("Choose a photo no larger than 2 MB.");
  }
  const expectedFormat = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" }[file.type];
  if (!expectedFormat) throw new AvatarValidationError("Choose a JPEG, PNG or WebP photo.");
  try {
    const source = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 25_000_000, failOn: "warning" });
    const metadata = await source.metadata();
    if (metadata.format !== expectedFormat || (metadata.pages ?? 1) > 1) {
      throw new Error("Unsupported image format.");
    }
    // rotate respects orientation; default output strips EXIF and other metadata.
    const side = Math.min(512, metadata.width ?? 512, metadata.height ?? 512);
    return await source.rotate().resize(side, side, { fit: "cover" }).webp({ quality: 85 }).toBuffer();
  } catch {
    throw new AvatarValidationError("That photo could not be read. Choose a valid, still JPEG, PNG or WebP image.");
  }
}

/** Next may construct request.url from its bind address; Host is the browser-facing authority. */
export function isProfileAvatarUploadSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!origin || !host || (fetchSite && fetchSite !== "same-origin")) return false;
  if (!/^(?:\[[0-9a-f:]+\]|[a-z0-9.-]+)(?::\d{1,5})?$/i.test(host)) return false;
  try {
    const protocol = new URL(request.url).protocol;
    if (protocol !== "http:" && protocol !== "https:") return false;
    const expected = new URL(`${protocol}//${host}`);
    const supplied = new URL(origin);
    // Origin is an origin only, never a URL with credentials, a path or a fragment.
    // Forwarded host headers are deliberately not trusted here.
    return supplied.origin === origin && supplied.origin === expected.origin;
  } catch {
    return false;
  }
}
