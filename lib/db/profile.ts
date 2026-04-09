import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import type { AvatarColor, UserProfile } from "@/types/index";

type ProfileRow = {
  id: string;
  display_name: string;
  first_name: string;
  last_name: string;
  email: string;
  ptcgl_username: string;
  role: "user" | "admin";
  avatar_color: string;
  auth_account_created_at: string | null;
  last_login_at: string | null;
  last_active_at: string | null;
  login_count: number;
  created_at: string;
  updated_at: string;
};

type UpdateProfileInput = {
  displayName: string;
  firstName: string;
  lastName: string;
  ptcglUsername: string;
};

const DEFAULT_AVATAR_COLOR: AvatarColor = "red";

function normalizeAvatarColor(value: string): AvatarColor {
  switch (value) {
    case "red":
    case "blue":
    case "yellow":
    case "green":
    case "orange":
    case "pink":
    case "purple":
    case "white":
      return value;
    default:
      return DEFAULT_AVATAR_COLOR;
  }
}

function getFallbackDisplayName(user: Awaited<ReturnType<typeof requireUser>>) {
  return (
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "Trainer"
  );
}

function mapProfileRowToUserProfile(
  user: Awaited<ReturnType<typeof requireUser>>,
  row: ProfileRow | null
): UserProfile {
  const firstName = String(row?.first_name || user.user_metadata?.given_name || "").trim();
  const lastName = String(row?.last_name || user.user_metadata?.family_name || "").trim();
  const fallbackDisplayName = getFallbackDisplayName(user);
  const combinedName = [firstName, lastName].filter(Boolean).join(" ").trim();

  return {
    id: user.id,
    displayName: String(row?.display_name || "").trim() || combinedName || fallbackDisplayName,
    firstName,
    lastName,
    email: String(row?.email || user.email || "").trim(),
    ptcglUsername: String(row?.ptcgl_username || "").trim(),
    role: row?.role === "admin" ? "admin" : "user",
    avatarColor: normalizeAvatarColor(String(row?.avatar_color || "")),
    authAccountCreatedAt: row?.auth_account_created_at ?? undefined,
    lastLoginAt: row?.last_login_at ?? undefined,
    lastActiveAt: row?.last_active_at ?? undefined,
    loginCount: Number.isFinite(row?.login_count) ? (row?.login_count ?? 0) : 0,
    createdAt: row?.created_at || "",
    updatedAt: row?.updated_at || ""
  };
}

export async function getCurrentProfile(): Promise<UserProfile> {
  const user = await requireUser();
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(
      [
        "id",
        "display_name",
        "first_name",
        "last_name",
        "email",
        "ptcgl_username",
        "role",
        "avatar_color",
        "auth_account_created_at",
        "last_login_at",
        "last_active_at",
        "login_count",
        "created_at",
        "updated_at"
      ].join(",")
    )
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return mapProfileRowToUserProfile(user, ((data ?? null) as unknown as ProfileRow | null) ?? null);
}

export async function updateCurrentProfile(input: UpdateProfileInput): Promise<UserProfile> {
  const user = await requireUser();
  const supabase = createClient();

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const explicitDisplayName = input.displayName.trim();
  const combinedName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const displayName = explicitDisplayName || combinedName || getFallbackDisplayName(user);

  const payload = {
    id: user.id,
    display_name: displayName,
    first_name: firstName,
    last_name: lastName,
    email: user.email || "",
    ptcgl_username: input.ptcglUsername.trim(),
    last_active_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("profiles")
    .upsert(payload, { onConflict: "id" })
    .select(
      [
        "id",
        "display_name",
        "first_name",
        "last_name",
        "email",
        "ptcgl_username",
        "role",
        "avatar_color",
        "auth_account_created_at",
        "last_login_at",
        "last_active_at",
        "login_count",
        "created_at",
        "updated_at"
      ].join(",")
    )
    .single();

  if (error) {
    throw error;
  }

  return mapProfileRowToUserProfile(user, data as unknown as ProfileRow);
}
