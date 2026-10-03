"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { requireAuth } from "@/lib/auth";
import { updateCurrentProfile, updateCurrentProfileAvatar } from "@/lib/db/profile";
import { PROFILE_AVATAR_COOKIE } from "@/lib/profile-avatar";
import { reportError } from "@/lib/server/report-error";
import { invalidateBattleLogImportContext } from "@/lib/server/battle-log-import-context-cache";
import type { AvatarColor } from "@/types/index";

export type ProfileActionState = {
  error: string | null;
  success: string | null;
};

function revalidateProfileWorkspace() {
  revalidatePath("/profile");
  revalidatePath("/friends");
  revalidatePath("/players", "layout");
  revalidatePath("/logs", "layout");
  revalidatePath("/decks", "layout");
  revalidatePath("/tournaments", "layout");
  revalidatePath("/stats", "layout");
  revalidatePath("/calculator", "layout");
}

async function setProfileAvatarCookie(avatarColor: AvatarColor) {
  const cookieStore = await cookies();

  cookieStore.set(PROFILE_AVATAR_COOKIE, avatarColor, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax"
  });
}

export async function saveProfileAction(
  _previousState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  const user = await requireAuth();

  try {
    const displayName = String(formData.get("displayName") || "").trim();
    const firstName = String(formData.get("firstName") || "").trim();
    const lastName = String(formData.get("lastName") || "").trim();
    const ptcglUsername = String(formData.get("ptcglUsername") || "").trim();
    const ptcglUsernameAliases = Array.from(
      new Map(
        String(formData.get("ptcglUsernameAliases") || "")
          .split(/[\n,]/)
          .map((username) => username.trim())
          .filter((username) => username && username.toLowerCase() !== ptcglUsername.toLowerCase())
          .map((username) => [username.toLowerCase(), username])
      ).values()
    );

    if (ptcglUsernameAliases.length > 10 || ptcglUsernameAliases.some((username) => username.length > 64)) {
      return {
        error: "Add no more than 10 alternate usernames, with up to 64 characters each.",
        success: null
      };
    }

    if (!displayName && !firstName && !lastName) {
      return {
        error: "Enter a display name or your first and last name before saving.",
        success: null
      };
    }

    const profile = await updateCurrentProfile({
      displayName,
      firstName,
      lastName,
      ptcglUsername,
      ptcglUsernameAliases
    });

    await setProfileAvatarCookie(profile.avatarColor);
    invalidateBattleLogImportContext(user.id);
    revalidateProfileWorkspace();

    return {
      error: null,
      success: "Profile saved."
    };
  } catch (error) {
    reportError(error, {
      boundary: "profile-actions",
      route: "/profile"
    });

    return {
      error: "Unable to save your profile right now.",
      success: null
    };
  }
}

export type ProfileAvatarActionState = {
  avatarColor: AvatarColor | null;
  avatarUrl: string | null;
  error: string | null;
};

export async function saveProfileAvatarAction(avatarColor: string): Promise<ProfileAvatarActionState> {
  await requireAuth();

  try {
    const profile = await updateCurrentProfileAvatar(avatarColor);

    await setProfileAvatarCookie(profile.avatarColor);
    revalidateProfileWorkspace();

    return {
      avatarColor: profile.avatarColor,
      avatarUrl: null,
      error: null
    };
  } catch (error) {
    reportError(error, {
      boundary: "profile-avatar-actions",
      route: "/profile"
    });

    return {
      avatarColor: null,
      avatarUrl: null,
      error: "Unable to save your profile picture right now."
    };
  }
}
