import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth";
import { measureServerCall } from "@/lib/server/perf";
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
const PROFILE_ACTIVITY_TOUCH_INTERVAL_MS = 15 * 60 * 1000;

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

function getAuthUserDisplayName(user: Pick<User, "email" | "user_metadata">) {
  const metadata = user.user_metadata ?? {};

  return (
    (typeof metadata.full_name === "string" ? metadata.full_name : "") ||
    (typeof metadata.name === "string" ? metadata.name : "") ||
    user.email?.split("@")[0] ||
    "Trainer"
  );
}

function getAuthUserFirstName(user: Pick<User, "user_metadata">) {
  const metadata = user.user_metadata ?? {};
  return typeof metadata.given_name === "string" ? metadata.given_name.trim() : "";
}

function getAuthUserLastName(user: Pick<User, "user_metadata">) {
  const metadata = user.user_metadata ?? {};
  return typeof metadata.family_name === "string" ? metadata.family_name.trim() : "";
}

function shouldRefreshLastActive(lastActiveAt: string | null | undefined) {
  if (!lastActiveAt) {
    return true;
  }

  const lastActiveTime = Date.parse(lastActiveAt);

  if (Number.isNaN(lastActiveTime)) {
    return true;
  }

  return Date.now() - lastActiveTime >= PROFILE_ACTIVITY_TOUCH_INTERVAL_MS;
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

export async function syncCurrentProfileFromAuthUser(authUser: Pick<
  User,
  "id" | "email" | "created_at" | "last_sign_in_at" | "user_metadata"
>) {
  const supabase = await createClient();
  const { data: existingProfile, error: existingProfileError } = await supabase
    .from("profiles")
    .select("display_name,first_name,last_name,ptcgl_username,role,avatar_color")
    .eq("id", authUser.id)
    .maybeSingle();

  if (existingProfileError) {
    throw existingProfileError;
  }

  const fallbackDisplayName = getAuthUserDisplayName(authUser);
  const firstName = String(existingProfile?.first_name || "").trim() || getAuthUserFirstName(authUser);
  const lastName = String(existingProfile?.last_name || "").trim() || getAuthUserLastName(authUser);
  const displayName =
    String(existingProfile?.display_name || "").trim() ||
    [firstName, lastName].filter(Boolean).join(" ").trim() ||
    fallbackDisplayName;

  const { error } = await supabase.from("profiles").upsert(
    {
      id: authUser.id,
      display_name: displayName,
      first_name: firstName,
      last_name: lastName,
      email: authUser.email || "",
      auth_account_created_at: authUser.created_at || null,
      last_login_at: authUser.last_sign_in_at || null,
      last_active_at: new Date().toISOString()
    },
    { onConflict: "id" }
  );

  if (error) {
    throw error;
  }
}

export async function getCurrentProfile(): Promise<UserProfile> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await measureServerCall("db.profile.current", async () =>
    await supabase
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
      .maybeSingle()
  );

  if (error) {
    throw error;
  }

  let profileRow = ((data ?? null) as unknown as ProfileRow | null) ?? null;

  if (!profileRow || !profileRow.last_login_at || !profileRow.auth_account_created_at) {
    const { data: authData, error: authError } = await measureServerCall(
      "db.profile.authRepair.getUser",
      async () => await supabase.auth.getUser()
    );

    if (authError) {
      throw authError;
    }

    if (authData.user) {
      await measureServerCall("db.profile.authRepair.sync", async () =>
        await syncCurrentProfileFromAuthUser(authData.user)
      );

      const refreshed = await measureServerCall("db.profile.authRepair.reload", async () =>
        await supabase
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
          .maybeSingle()
      );

      if (refreshed.error) {
        throw refreshed.error;
      }

      profileRow = ((refreshed.data ?? null) as unknown as ProfileRow | null) ?? null;
    }
  }

  if (profileRow && shouldRefreshLastActive(profileRow.last_active_at)) {
    const nextLastActiveAt = new Date().toISOString();

    profileRow = {
      ...profileRow,
      last_active_at: nextLastActiveAt
    };

    after(async () => {
      const { error: activityError } = await supabase
        .from("profiles")
        .update({ last_active_at: nextLastActiveAt })
        .eq("id", user.id);

      if (activityError) {
        console.error("[profile] failed to refresh last_active_at", activityError);
      }
    });
  }

  return mapProfileRowToUserProfile(user, profileRow);
}

export async function updateCurrentProfile(input: UpdateProfileInput): Promise<UserProfile> {
  const user = await requireUser();
  const supabase = await createClient();

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
