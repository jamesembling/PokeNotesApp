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
