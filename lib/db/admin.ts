import { requireUser } from "@/lib/auth";
import { cache } from "react";
import { createAdminClient, hasAdminSupabaseAccess } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { measureServerCall } from "@/lib/server/perf";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import type { AdminUser, CatalogHealth, Role } from "@/types/index";

type ProfileRow = {
  id: string;
  email: string;
  display_name: string;
  ptcgl_username: string;
  role: Role;
  auth_account_created_at: string | null;
  last_login_at: string | null;
  last_active_at: string | null;
  login_count: number;
  created_at: string;
};

type UserCountRow = {
  user_id: string;
};

type DeckCountRow = {
  user_id: string;
  deck_lists: unknown;
};

type UserLogStatsCountRow = {
  user_id: string;
  games_played: number | null;
};

type AdminUsersResult = {
  users: AdminUser[];
  roleUpdatesEnabled: boolean;
  warning?: string;
};

type AdminUserSummary = {
  userCount: number;
  adminCount: number;
};

type AdminDashboardOverview = AdminUserSummary & CatalogHealth;

type AdminDashboardOverviewRpcRow = {
  user_count: number | null;
  admin_count: number | null;
  pokemon_catalog_count: number | null;
  archetype_catalog_count: number | null;
  excluded_archetype_count: number | null;
  pokemon_last_synced_at: string | null;
  archetype_last_synced_at: string | null;
};

type AdminUsersOverviewRpcRow = ProfileRow & {
  deck_count: number | null;
  deck_list_count: number | null;
  tournament_count: number | null;
  log_count: number | null;
};

function sortUsers(users: AdminUser[]) {
  return [...users].sort((left, right) => {
    if (left.role !== right.role) {
      return left.role === "admin" ? -1 : 1;
    }

    const leftActivity = left.lastActiveAt || left.lastLoginAt || left.accountCreatedAt;
    const rightActivity = right.lastActiveAt || right.lastLoginAt || right.accountCreatedAt;
    return rightActivity.localeCompare(leftActivity);
  });
}

function mapCountRows(rows: UserCountRow[] | null) {
  const counts = new Map<string, number>();

  for (const row of rows ?? []) {
    const userId = String(row.user_id || "").trim();
    if (!userId) {
      continue;
    }

    counts.set(userId, (counts.get(userId) ?? 0) + 1);
  }

  return counts;
}

function mapDeckCounts(rows: DeckCountRow[] | null) {
  const deckCounts = new Map<string, number>();
  const deckListCounts = new Map<string, number>();

  for (const row of rows ?? []) {
    const userId = String(row.user_id || "").trim();
    if (!userId) {
      continue;
    }

    deckCounts.set(userId, (deckCounts.get(userId) ?? 0) + 1);
    const deckLists = Array.isArray(row.deck_lists) ? row.deck_lists : [];
    deckListCounts.set(userId, (deckListCounts.get(userId) ?? 0) + deckLists.length);
  }

  return {
    deckCounts,
    deckListCounts
  };
}

function mapLogStatsCounts(rows: UserLogStatsCountRow[] | null) {
  const counts = new Map<string, number>();

  for (const row of rows ?? []) {
    const userId = String(row.user_id || "").trim();
    if (!userId) {
      continue;
    }

    counts.set(userId, Math.max(0, Number(row.games_played ?? 0)));
  }

  return counts;
}

function mapAdminUsersOverviewRow(row: AdminUsersOverviewRpcRow): AdminUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    ptcglUsername: row.ptcgl_username,
    role: row.role,
    accountCreatedAt: row.auth_account_created_at || row.created_at,
    lastLoginAt: row.last_login_at ?? undefined,
    lastActiveAt: row.last_active_at ?? undefined,
    loginCount: Number.isFinite(row.login_count) ? row.login_count : 0,
    deckCount: Math.max(0, Number(row.deck_count ?? 0)),
    deckListCount: Math.max(0, Number(row.deck_list_count ?? 0)),
    tournamentCount: Math.max(0, Number(row.tournament_count ?? 0)),
    logCount: Math.max(0, Number(row.log_count ?? 0))
  };
}

function mapAdminUser(
  row: ProfileRow,
  deckCounts: Map<string, number>,
  deckListCounts: Map<string, number>,
  tournamentCounts: Map<string, number>,
  logCounts: Map<string, number>
): AdminUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    ptcglUsername: row.ptcgl_username,
    role: row.role,
    accountCreatedAt: row.auth_account_created_at || row.created_at,
    lastLoginAt: row.last_login_at ?? undefined,
    lastActiveAt: row.last_active_at ?? undefined,
    loginCount: Number.isFinite(row.login_count) ? row.login_count : 0,
    deckCount: deckCounts.get(row.id) ?? 0,
    deckListCount: deckListCounts.get(row.id) ?? 0,
    tournamentCount: tournamentCounts.get(row.id) ?? 0,
    logCount: logCounts.get(row.id) ?? 0
  };
}

function mapAdminDashboardOverview(row: AdminDashboardOverviewRpcRow): AdminDashboardOverview {
  return {
    userCount: Number(row.user_count ?? 0),
    adminCount: Number(row.admin_count ?? 0),
    pokemonCatalogCount: Number(row.pokemon_catalog_count ?? 0),
    archetypeCatalogCount: Number(row.archetype_catalog_count ?? 0),
    excludedArchetypeCount: Number(row.excluded_archetype_count ?? 0),
    pokemonLastSyncedAt: row.pokemon_last_synced_at
      ? String(row.pokemon_last_synced_at)
      : undefined,
    archetypeLastSyncedAt: row.archetype_last_synced_at
      ? String(row.archetype_last_synced_at)
      : undefined
  };
}

export const getAdminAccessContext = cache(async () => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("role,display_name,email")
    .eq("id", user.id)
    .single();

  if (error) {
    throw error;
  }

  return {
    user,
    profile: {
      displayName:
        String(data?.display_name || "").trim() ||
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email?.split("@")[0] ||
        "Trainer",
      email: String(data?.email || user.email || "").trim(),
      role: data?.role === "admin" ? "admin" : "user"
    },
    role: data?.role === "admin" ? "admin" : "user"
  } as const;
});

export const requireAdminAccess = cache(async () => {
  const { role, user } = await getAdminAccessContext();

  if (role !== "admin") {
    throw new Error("You do not have permission to use admin tools.");
  }

  return user;
});

export async function getAdminDashboardOverview(): Promise<AdminDashboardOverview> {
  await requireAdminAccess();

  const supabase = await createClient();
  const { data, error } = await measureServerCall("db.admin.dashboardOverviewRpc", async () =>
    await supabase.rpc("get_admin_dashboard_overview")
  );

  if (!error) {
    const row = Array.isArray(data)
      ? (((data[0] ?? null) as unknown) as AdminDashboardOverviewRpcRow | null)
      : (((data ?? null) as unknown) as AdminDashboardOverviewRpcRow | null);

    if (row) {
      return mapAdminDashboardOverview(row);
    }
  }

  const [userSummary, catalogHealth] = await Promise.all([
    getAdminUserSummary(),
    getCatalogHealth()
  ]);

  return {
    ...userSummary,
    ...catalogHealth
  };
}

export async function getAdminUserSummary(): Promise<AdminUserSummary> {
  await requireAdminAccess();

  return await measureServerCall("db.admin.userSummary", async () => {
    const supabase = await createClient();
    const [userCountResult, adminCountResult] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin")
    ]);

    if (userCountResult.error) {
      throw userCountResult.error;
    }

    if (adminCountResult.error) {
      throw adminCountResult.error;
    }

    return {
      userCount: userCountResult.count ?? 0,
      adminCount: adminCountResult.count ?? 0
    };
  });
}

export async function getAdminUsers(): Promise<AdminUsersResult> {
  await requireAdminAccess();

  const roleUpdatesEnabled = hasAdminSupabaseAccess();
  const supabase = await createClient();
  const rpcResult = await measureServerCall("db.admin.usersOverviewRpc", async () =>
    await supabase.rpc("get_admin_users_overview")
  );

  if (!rpcResult.error) {
    return {
      users: ((((rpcResult.data ?? null) as unknown) as AdminUsersOverviewRpcRow[] | null) ?? []).map(
        mapAdminUsersOverviewRow
      ),
      roleUpdatesEnabled,
      warning: roleUpdatesEnabled
        ? undefined
        : "Admin role updates are disabled until SUPABASE_SERVICE_ROLE_KEY is configured on the app."
    };
  }

  return await measureServerCall("db.admin.users", async () => {
    if (roleUpdatesEnabled) {
      const supabase = createAdminClient();
      const profileColumns = [
        "id",
        "email",
        "display_name",
        "ptcgl_username",
        "role",
        "auth_account_created_at",
        "last_login_at",
        "last_active_at",
        "login_count",
        "created_at"
      ].join(",");
      const [profiles, decks, tournaments, logStats] = await Promise.all([
        fetchAllRows<ProfileRow>(async (from, to) => {
          const { data, error } = await supabase
            .from("profiles")
            .select(profileColumns)
            .range(from, to);

          return { data: data as ProfileRow[] | null, error };
        }),
        fetchAllRows<DeckCountRow>(async (from, to) => {
          const { data, error } = await supabase
            .from("decks")
            .select("user_id,deck_lists")
            .range(from, to);

          return { data: data as DeckCountRow[] | null, error };
        }),
        fetchAllRows<UserCountRow>(async (from, to) => {
          const { data, error } = await supabase
            .from("tournaments")
            .select("user_id")
            .range(from, to);

          return { data: data as UserCountRow[] | null, error };
        }),
        fetchAllRows<UserLogStatsCountRow>(async (from, to) => {
          const { data, error } = await supabase
            .from("user_log_stats")
            .select("user_id,games_played")
            .range(from, to);

          return { data: data as UserLogStatsCountRow[] | null, error };
        })
      ]);

      const { deckCounts, deckListCounts } = mapDeckCounts(decks);
      const tournamentCounts = mapCountRows(tournaments);
      const logCounts = mapLogStatsCounts(logStats);
      const users = profiles.map((row) =>
        mapAdminUser(row, deckCounts, deckListCounts, tournamentCounts, logCounts)
      );

      return {
        users: sortUsers(users),
        roleUpdatesEnabled: true
      };
    }

    const supabase = await createClient();
    const data = await fetchAllRows<ProfileRow>(async (from, to) => {
      const result = await supabase
        .from("profiles")
        .select(
          [
            "id",
            "email",
            "display_name",
            "ptcgl_username",
            "role",
            "auth_account_created_at",
            "last_login_at",
            "last_active_at",
            "login_count",
            "created_at"
          ].join(",")
        )
        .range(from, to);

      return {
        data: result.data as ProfileRow[] | null,
        error: result.error
      };
    });

    const users = data.map((row) =>
      mapAdminUser(
        row,
        new Map<string, number>(),
        new Map<string, number>(),
        new Map<string, number>(),
        new Map<string, number>()
      )
    );

    return {
      users: sortUsers(users),
      roleUpdatesEnabled: false,
      warning:
        "Admin role updates are disabled until SUPABASE_SERVICE_ROLE_KEY is configured on the app."
    };
  });
}

export async function getCatalogHealth(): Promise<CatalogHealth> {
  await requireAdminAccess();

  return await measureServerCall("db.admin.catalogHealth", async () => {
    const supabase = await createClient();
    const [
      pokemonCountResult,
      archetypeCountResult,
      excludedCountResult,
      pokemonLastSyncedResult,
      archetypeLastSyncedResult
    ] = await Promise.all([
      supabase.from("pokemon_catalog").select("slug", { count: "exact", head: true }),
      supabase.from("archetype_catalog").select("id", { count: "exact", head: true }),
      supabase
        .from("archetype_catalog")
        .select("id", { count: "exact", head: true })
        .eq("is_excluded", true),
      supabase
        .from("pokemon_catalog")
        .select("last_synced_at")
        .order("last_synced_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("archetype_catalog")
        .select("last_synced_at")
        .order("last_synced_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ]);

    if (pokemonCountResult.error) {
      throw pokemonCountResult.error;
    }

    if (archetypeCountResult.error) {
      throw archetypeCountResult.error;
    }

    if (excludedCountResult.error) {
      throw excludedCountResult.error;
    }

    if (pokemonLastSyncedResult.error) {
      throw pokemonLastSyncedResult.error;
    }

    if (archetypeLastSyncedResult.error) {
      throw archetypeLastSyncedResult.error;
    }

    return {
      pokemonCatalogCount: pokemonCountResult.count ?? 0,
      archetypeCatalogCount: archetypeCountResult.count ?? 0,
      pokemonLastSyncedAt:
        pokemonLastSyncedResult.data?.last_synced_at
          ? String(pokemonLastSyncedResult.data.last_synced_at)
          : undefined,
      archetypeLastSyncedAt:
        archetypeLastSyncedResult.data?.last_synced_at
          ? String(archetypeLastSyncedResult.data.last_synced_at)
          : undefined,
      excludedArchetypeCount: excludedCountResult.count ?? 0
    };
  });
}

export async function updateAdminUserRole(userId: string, role: Role) {
  const actingUser = await requireAdminAccess();

  if (!userId) {
    throw new Error("User id is required.");
  }

  if (role !== "user" && role !== "admin") {
    throw new Error("Choose a valid role.");
  }

  const supabase = createAdminClient();

  const syncAuthRoleMetadata = async () => {
    const { data: authUser, error: authUserError } = await supabase.auth.admin.getUserById(userId);

    if (authUserError) {
      throw authUserError;
    }

    const appMetadata =
      authUser.user?.app_metadata && typeof authUser.user.app_metadata === "object"
        ? authUser.user.app_metadata
        : {};

    if (appMetadata.role === role) {
      return;
    }

    const { error: updateAuthError } = await supabase.auth.admin.updateUserById(userId, {
      app_metadata: {
        ...appMetadata,
        role
      }
    });

    if (updateAuthError) {
      throw updateAuthError;
    }
  };

  if (actingUser.id === userId && role !== "admin") {
    const { count: adminCount, error } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");

    if (error) {
      throw error;
    }

    if ((adminCount ?? 0) <= 1) {
      throw new Error("You cannot remove admin access from the only admin account.");
    }
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId)
    .select(
      [
        "id",
        "email",
        "display_name",
        "ptcgl_username",
        "role",
        "auth_account_created_at",
        "last_login_at",
        "last_active_at",
        "login_count",
        "created_at"
      ].join(",")
    )
    .single();

  if (error) {
    throw error;
  }

  await syncAuthRoleMetadata();

  return mapAdminUser(
    data as unknown as ProfileRow,
    new Map<string, number>(),
    new Map<string, number>(),
    new Map<string, number>(),
    new Map<string, number>()
  );
}
