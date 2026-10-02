import type { AvatarColor } from "@/types/index";

export type FavouriteCardArt = { set: string; number: string; name: string };
export type FriendshipOperation = "request" | "accept" | "decline" | "cancel" | "remove" | "block" | "unblock";
export type SocialProfile = {
  id: string;
  trainerName: string;
  avatarColor: AvatarColor;
  enabled: boolean;
  favouritePokemon: { slug: string; name: string; spriteUrl: string } | null;
  favouriteCards: FavouriteCardArt[];
  stats: { wins: number; losses: number; draws: number; total: number } | null;
  lastLoginAt: string | null;
  relationship: "self" | "none" | "incoming" | "outgoing" | "friends" | "blocked";
  shareLastLogin: boolean;
};
export type FriendConnections = {
  friends: SocialProfile[];
  incoming: SocialProfile[];
  outgoing: SocialProfile[];
  blocked: SocialProfile[];
};
export type SocialActionState = { error?: string; success?: string };
export type ShowcaseInput = {
  enabled: boolean;
  trainerName: string;
  favouritePokemonSlug: string | null;
  favouriteCards: FavouriteCardArt[];
  shareLastLogin: boolean;
};
