"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { requireAuth, requireUser } from "@/lib/auth";
import { updateCurrentProfile, updateCurrentProfileAvatar } from "@/lib/db/profile";
import { PROFILE_AVATAR_COOKIE } from "@/lib/profile-avatar";
import { reportError } from "@/lib/server/report-error";
import type { AvatarColor } from "@/types/index";

export type ProfileActionState = {
  error: string | null;
  success: string | null;
};

function revalidateProfileWorkspace() {
  revalidatePath("/profile");
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
  await requireAuth();

  try {
    const displayName = String(formData.get("displayName") || "").trim();
    const firstName = String(formData.get("firstName") || "").trim();
    const lastName = String(formData.get("lastName") || "").trim();
    const ptcglUsername = String(formData.get("ptcglUsername") || "").trim();
    const avatarColor = String(formData.get("avatarColor") || "").trim();

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
      avatarColor
    });

    await setProfileAvatarCookie(profile.avatarColor);
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
      error: null
    };
  } catch (error) {
    reportError(error, {
      boundary: "profile-avatar-actions",
      route: "/profile"
    });

    return {
      avatarColor: null,
      error: "Unable to save your profile picture right now."
    };
  }
}
