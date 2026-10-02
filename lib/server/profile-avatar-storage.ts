import type { createClient } from "@/lib/supabase/server";
import { PROFILE_AVATAR_BUCKET } from "@/lib/profile-avatar";
import { reportError } from "./report-error";

/** Best-effort deletion follows a successful profile update; never undo the new photo. */
export async function removePreviousProfileAvatar(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ownerId: string,
  path: string | null | undefined
) {
  if (!path || !path.startsWith(`${ownerId}/`)) return;
  try {
    const { error } = await supabase.storage.from(PROFILE_AVATAR_BUCKET).remove([path]);
    if (error) throw error;
  } catch (error) {
    reportError(error, { boundary: "profile-avatar-cleanup", route: "/profile" });
  }
}
