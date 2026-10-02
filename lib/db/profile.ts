import { after } from "next/server";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth";
import { getProfileAvatarUrl, normalizeAvatarColor } from "@/lib/profile-avatar";
import { measureServerCall } from "@/lib/server/perf";
import { withProfileAvatarColumn, profileAvatarColumns } from "./profile-avatar-compatibility";
import { removePreviousProfileAvatar } from "@/lib/server/profile-avatar-storage";
import type { UserProfile } from "@/types/index";

type ProfileRow = {
  id: string;
  display_name: string;
  first_name: string;
  last_name: string;
  email: string;
  ptcgl_username: string;
  ptcgl_username_aliases: string[];
  role: "user" | "admin";
  avatar_color: string;
  avatar_path: string | null;
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
  ptcglUsernameAliases: string[];
};

type SidebarProfileRow = Pick<
  ProfileRow,
  "display_name" | "email" | "role" | "avatar_color" | "avatar_path" | "last_active_at"
>;

type CurrentSidebarProfile = {
  displayName: string;
  email: string;
  role: "user" | "admin";
  avatarColor: UserProfile["avatarColor"];
  avatarUrl: string | null;
};

const PROFILE_ACTIVITY_TOUCH_INTERVAL_MS = 15 * 60 * 1000;

function getFallbackDisplayName(user: Awaited<ReturnType<typeof requireUser>>) {
  return (
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "Trainer"
  );
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
    ptcglUsernameAliases: row?.ptcgl_username_aliases ?? [],
    role: row?.role === "admin" ? "admin" : "user",
    avatarPath: row?.avatar_path ?? null,
    avatarUrl: getProfileAvatarUrl(row?.avatar_path),
    avatarColor: normalizeAvatarColor(String(row?.avatar_color || "")),
    authAccountCreatedAt: row?.auth_account_created_at ?? undefined,
    lastLoginAt: row?.last_login_at ?? undefined,
    lastActiveAt: row?.last_active_at ?? undefined,
    loginCount: Number.isFinite(row?.login_count) ? (row?.login_count ?? 0) : 0,
    createdAt: row?.created_at || "",
    updatedAt: row?.updated_at || ""
  };
}

export async function syncCurrentProfileFromAuthUser(_authUser: Pick<
  User,
  "id" | "email" | "created_at" | "last_sign_in_at" | "user_metadata"
>) {
  // The database derives identity and auth metadata from the verified session.
  // Keep the argument for the existing callback/dev-login call contract.
  const supabase = await createClient();
  const { error } = await supabase.rpc("sync_current_profile");

  if (error) {
    throw error;
  }
}

function scheduleProfileActivityTouch(supabase: Awaited<ReturnType<typeof createClient>>) {
  after(async () => {
    const { error } = await supabase.rpc("touch_current_profile_activity");

    if (error) {
      console.error("[profile] failed to refresh last_active_at", error);
    }
  });
}

function mapSidebarProfile(
  user: Awaited<ReturnType<typeof requireUser>>,
  row: SidebarProfileRow | null
): CurrentSidebarProfile {
  return {
    displayName: String(row?.display_name || "").trim() || getFallbackDisplayName(user),
    email: String(row?.email || user.email || "").trim(),
    role: row?.role === "admin" ? "admin" : "user",
    avatarUrl: getProfileAvatarUrl(row?.avatar_path),
    avatarColor: normalizeAvatarColor(String(row?.avatar_color || user.user_metadata?.avatar_color || ""))
  };
}

export const getCurrentSidebarProfile = cache(async (): Promise<CurrentSidebarProfile> => {
  const [user, supabase] = await Promise.all([requireUser(), createClient()]);
  const loadSidebarProfile = async () =>
    await withProfileAvatarColumn(includeAvatar => supabase
      .from("profiles")
      .select(profileAvatarColumns("display_name,email,role,avatar_color,avatar_path,last_active_at", includeAvatar))
      .eq("id", user.id)
      .maybeSingle());

  const { data, error } = await measureServerCall("db.profile.sidebar", loadSidebarProfile);

  if (error) {
    throw error;
  }

  let profileRow = ((data ?? null) as unknown as SidebarProfileRow | null) ?? null;

  if (!profileRow) {
    const { data: authData, error: authError } = await measureServerCall(
      "db.profile.sidebarRepair.getUser",
      async () => await supabase.auth.getUser()
    );

    if (authError) {
      throw authError;
    }

    if (authData.user) {
      await measureServerCall("db.profile.sidebarRepair.sync", async () =>
        await syncCurrentProfileFromAuthUser(authData.user)
      );

      const refreshed = await measureServerCall("db.profile.sidebarRepair.reload", loadSidebarProfile);

      if (refreshed.error) {
        throw refreshed.error;
      }

      profileRow = ((refreshed.data ?? null) as unknown as SidebarProfileRow | null) ?? null;
    }
  }

  if (profileRow && shouldRefreshLastActive(profileRow.last_active_at)) {
    const nextLastActiveAt = new Date().toISOString();

    profileRow = {
      ...profileRow,
      last_active_at: nextLastActiveAt
    };

    scheduleProfileActivityTouch(supabase);
  }

  return mapSidebarProfile(user, profileRow);
});

export const getCurrentProfile = cache(async (): Promise<UserProfile> => {
  const [user, supabase] = await Promise.all([requireUser(), createClient()]);
  const { data, error } = await measureServerCall("db.profile.current", async () =>
    await withProfileAvatarColumn(includeAvatar => supabase
      .from("profiles")
      .select(profileAvatarColumns(
        [
          "id",
          "display_name",
          "first_name",
          "last_name",
          "email",
          "ptcgl_username",
          "ptcgl_username_aliases",
          "role",
          "avatar_color",
          "avatar_path",
          "auth_account_created_at",
          "last_login_at",
          "last_active_at",
          "login_count",
          "created_at",
          "updated_at"
        ].join(","), includeAvatar)
      )
      .eq("id", user.id)
      .maybeSingle())
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
        await withProfileAvatarColumn(includeAvatar => supabase
          .from("profiles")
          .select(profileAvatarColumns(
            [
              "id",
              "display_name",
              "first_name",
              "last_name",
              "email",
              "ptcgl_username",
              "ptcgl_username_aliases",
              "role",
              "avatar_color",
              "avatar_path",
              "auth_account_created_at",
              "last_login_at",
              "last_active_at",
              "login_count",
              "created_at",
              "updated_at"
            ].join(","), includeAvatar)
          )
          .eq("id", user.id)
          .maybeSingle())
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

    scheduleProfileActivityTouch(supabase);
  }

  return mapProfileRowToUserProfile(user, profileRow);
});

export async function updateCurrentProfile(input: UpdateProfileInput): Promise<UserProfile> {
  const [user, supabase] = await Promise.all([requireUser(), createClient()]);

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const explicitDisplayName = input.displayName.trim();
  const combinedName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const displayName = explicitDisplayName || combinedName || getFallbackDisplayName(user);
  const payload = {
    display_name: displayName,
    first_name: firstName,
    last_name: lastName,
    ptcgl_username: input.ptcglUsername.trim(),
    ptcgl_username_aliases: input.ptcglUsernameAliases
  };

  const { data, error } = await withProfileAvatarColumn(includeAvatar => supabase
    .from("profiles")
    .update(payload)
    .eq("id", user.id)
    .select(profileAvatarColumns(
      [
        "id",
        "display_name",
        "first_name",
        "last_name",
        "email",
        "ptcgl_username",
        "ptcgl_username_aliases",
        "role",
        "avatar_color",
        "avatar_path",
        "auth_account_created_at",
        "last_login_at",
        "last_active_at",
        "login_count",
        "created_at",
        "updated_at"
      ].join(","), includeAvatar)
    )
    .single());

  if (error) {
    throw error;
  }

  return mapProfileRowToUserProfile(user, data as unknown as ProfileRow);
}

export async function updateCurrentProfileAvatar(avatarColorInput: string): Promise<UserProfile> {
  const [user, supabase] = await Promise.all([requireUser(), createClient()]);
  const avatarColor = normalizeAvatarColor(avatarColorInput);
  const previous = await withProfileAvatarColumn(includeAvatar => supabase.from("profiles")
    .select(profileAvatarColumns("id,avatar_path", includeAvatar)).eq("id", user.id).single());
  if (previous.error) throw previous.error;
  const previousPath = (previous.data as unknown as { avatar_path?: string | null })?.avatar_path;

  const { error: authUpdateError } = await supabase.auth.updateUser({
    data: {
      avatar_color: avatarColor
    }
  });

  if (authUpdateError) {
    throw authUpdateError;
  }

  const { data, error } = await withProfileAvatarColumn(includeAvatar => supabase
    .from("profiles")
    .update({
      avatar_color: avatarColor,
      ...(includeAvatar ? { avatar_path: null } : {})
    })
    .eq("id", user.id)
    .select(profileAvatarColumns(
      [
        "id",
        "display_name",
        "first_name",
        "last_name",
        "email",
        "ptcgl_username",
        "ptcgl_username_aliases",
        "role",
        "avatar_color",
        "avatar_path",
        "auth_account_created_at",
        "last_login_at",
        "last_active_at",
        "login_count",
        "created_at",
        "updated_at"
      ].join(","), includeAvatar)
    )
    .single());

  if (error) {
    throw error;
  }

  await removePreviousProfileAvatar(supabase, user.id, previousPath);
  return mapProfileRowToUserProfile(user, data as unknown as ProfileRow);
}
