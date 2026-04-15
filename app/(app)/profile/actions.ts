"use server";

import { revalidatePath } from "next/cache";
import { updateCurrentProfile } from "@/lib/db/profile";
import { reportError } from "@/lib/server/report-error";

export type ProfileActionState = {
  error: string | null;
  success: string | null;
};

export const initialProfileActionState: ProfileActionState = {
  error: null,
  success: null
};

function revalidateProfileWorkspace() {
  revalidatePath("/profile");
  revalidatePath("/logs", "layout");
  revalidatePath("/decks", "layout");
  revalidatePath("/stats", "layout");
  revalidatePath("/calculator", "layout");
}

export async function saveProfileAction(
  _previousState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  try {
    const displayName = String(formData.get("displayName") || "").trim();
    const firstName = String(formData.get("firstName") || "").trim();
    const lastName = String(formData.get("lastName") || "").trim();
    const ptcglUsername = String(formData.get("ptcglUsername") || "").trim();

    if (!displayName && !firstName && !lastName) {
      return {
        error: "Enter a display name or your first and last name before saving.",
        success: null
      };
    }

    await updateCurrentProfile({
      displayName,
      firstName,
      lastName,
      ptcglUsername
    });

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
