import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireApiUser } from "@/lib/server/api-auth";
import { privateError, privateJson, reportApiError } from "@/lib/server/api-response";
import { AvatarValidationError, isProfileAvatarUploadSameOrigin, prepareProfileAvatar } from "@/lib/server/profile-avatar";
import { removePreviousProfileAvatar } from "@/lib/server/profile-avatar-storage";
import { createClient } from "@/lib/supabase/server";
import { getProfileAvatarUrl, MAX_AVATAR_BYTES, PROFILE_AVATAR_BUCKET } from "@/lib/profile-avatar";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    if (!isProfileAvatarUploadSameOrigin(request)) {
      return privateError("Upload your photo from your Profile page.", 403);
    }
    // Bound the streamed multipart body too: Content-Length is optional and untrusted.
    const limit = MAX_AVATAR_BYTES + 64 * 1024;
    if (Number(request.headers.get("content-length")) > limit) return privateError("Choose a photo no larger than 2 MB.", 413);
    const reader = request.body?.getReader();
    if (!reader) return privateError("Choose a photo to upload.", 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return privateError("Choose a photo no larger than 2 MB.", 413);
      }
      chunks.push(value);
    }
    const body = Buffer.concat(chunks);
    let form: FormData;
    try {
      form = await new Response(body, { headers: { "content-type": request.headers.get("content-type") || "" } }).formData();
    } catch {
      return privateError("Choose a JPEG, PNG or WebP photo.", 400);
    }
    const file = form.get("file");
    if (!(file instanceof File)) return privateError("Choose a photo to upload.", 400);
    const bytes = await prepareProfileAvatar(file);
    const supabase = await createClient();
    const previous = await supabase.from("profiles").select("avatar_path").eq("id", user.id).single();
    if (previous.error) throw previous.error;
    const avatarPath = `${user.id}/${randomUUID()}.webp`;
    const bucket = supabase.storage.from(PROFILE_AVATAR_BUCKET);
    const { error: uploadError } = await bucket.upload(avatarPath, bytes, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
    if (uploadError) throw uploadError;
    const { data, error } = await supabase.from("profiles").update({ avatar_path: avatarPath }).eq("id", user.id).select("id").single();
    if (error || !data) {
      await bucket.remove([avatarPath]);
      throw error || new Error("Profile unavailable.");
    }
    await removePreviousProfileAvatar(supabase, user.id, previous.data.avatar_path);
    revalidatePath("/profile");
    revalidatePath("/friends");
    revalidatePath("/players", "layout");
    return privateJson({ avatarPath, avatarUrl: getProfileAvatarUrl(avatarPath) });
  } catch (error) {
    if (error instanceof AvatarValidationError) return privateError(error.message, 400);
    return reportApiError(error, { boundary: "profile-avatar-upload", route: "/api/profile/avatar" }, "Unable to save your photo right now. Try again.");
  }
}
