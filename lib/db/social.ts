import { cache } from "react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { normalizeAvatarColor } from "@/lib/profile-avatar";
import { getCurrentSidebarProfile } from "@/lib/db/profile";
import { buildPokemonSpriteUrlFromSlug } from "@/lib/pokemon/sprites";
import { isSocialSchemaUnavailable } from "@/lib/social/availability";
import type { FavouriteCardArt, FriendConnections, FriendshipOperation, ShowcaseInput, SocialProfile } from "@/lib/social/types";

type ProfileProjection = Omit<SocialProfile, "favouritePokemon"> & { favouritePokemon: string | null };

async function mapProfiles(rows: ProfileProjection[]): Promise<SocialProfile[]> {
  const slugs = [...new Set(rows.map((row) => row.favouritePokemon).filter((slug): slug is string => !!slug))];
  const pokemon = new Map<string, { slug: string; name: string; spriteUrl: string }>();
  if (slugs.length) {
    const db = await createClient();
    const { data, error } = await db.from("pokemon_catalog").select("slug,label,sprite_url").in("slug", slugs);
    if (error) throw error;
    for (const row of data ?? []) pokemon.set(row.slug, { slug: row.slug, name: row.label, spriteUrl: row.sprite_url || buildPokemonSpriteUrlFromSlug(row.slug) });
  }
  return rows.map((row) => ({
    id: row.id,
    trainerName: row.trainerName,
    avatarColor: normalizeAvatarColor(row.avatarColor),
    enabled: row.enabled,
    favouritePokemon: row.favouritePokemon ? pokemon.get(row.favouritePokemon) ?? null : null,
    favouriteCards: row.favouriteCards,
    stats: row.stats,
    lastLoginAt: row.lastLoginAt,
    relationship: row.relationship,
    shareLastLogin: row.shareLastLogin
  }));
}

export const getPlayerProfile = cache(async (id: string): Promise<SocialProfile | null> => {
  const user = await requireUser();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  // Password sessions and first visits may precede account-profile creation.
  // The existing owner repair path must finish before the self projection is cached.
  if (id === user.id) await getCurrentSidebarProfile();
  const db = await createClient();
  const { data, error } = await db.rpc("get_player_profile", { p_user_id: id });
  if (error) throw error;
  if (!data) return null;
  return (await mapProfiles([data as unknown as ProfileProjection]))[0];
});

export async function getCurrentShowcase(): Promise<SocialProfile> {
  const user = await requireUser();
  const profile = await getPlayerProfile(user.id);
  if (!profile) throw new Error("Your player profile could not be loaded.");
  return profile;
}

export async function getCurrentShowcaseIfAvailable(): Promise<SocialProfile | null> {
  try { return await getCurrentShowcase(); }
  catch (error) {
    if (isSocialSchemaUnavailable(error)) return null;
    throw error;
  }
}

export async function searchPlayers(query: string): Promise<SocialProfile[]> {
  await requireUser();
  const normalized = query.trim();
  if (normalized.length < 2 || normalized.length > 40) return [];
  const db = await createClient();
  const { data, error } = await db.rpc("search_players", { p_query: normalized });
  if (error) throw error;
  return mapProfiles((data ?? []) as unknown as ProfileProjection[]);
}

export async function getFriendConnections(): Promise<FriendConnections> {
  await requireUser();
  const db = await createClient();
  const { data, error } = await db.rpc("get_friend_connections");
  if (error) throw error;
  const connections = data as unknown as Record<keyof FriendConnections, ProfileProjection[]>;
  const groups = ["friends", "incoming", "outgoing", "blocked"] as const;
  const rows = await mapProfiles(groups.flatMap((key) => connections[key]));
  let offset = 0;
  return Object.fromEntries(groups.map((key) => {
    const group = rows.slice(offset, offset + connections[key].length);
    offset += connections[key].length;
    return [key, group];
  })) as FriendConnections;
}

export async function updateShowcase(input: ShowcaseInput, cards: FavouriteCardArt[]) {
  await requireUser();
  const db = await createClient();
  const { error } = await db.rpc("update_player_showcase", {
    p_enabled: input.enabled,
    p_trainer_name: input.trainerName,
    p_favourite_pokemon: input.favouritePokemonSlug,
    p_favourite_cards: cards,
    p_share_last_login: input.shareLastLogin
  });
  if (error) throw error;
}

export async function manageFriendship(targetUserId: string, operation: FriendshipOperation) {
  await requireUser();
  const db = await createClient();
  const { error } = await db.rpc("manage_friend_connection", { p_target_user_id: targetUserId, p_action: operation });
  if (error) throw error;
}
