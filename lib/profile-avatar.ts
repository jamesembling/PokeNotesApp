import type { AvatarColor } from "@/types/index";

export const AVATAR_COLORS: AvatarColor[] = [
  "red",
  "blue",
  "yellow",
  "green",
  "orange",
  "pink",
  "purple",
  "white"
];

const DEFAULT_AVATAR_COLOR: AvatarColor = "red";
export const PROFILE_AVATAR_COOKIE = "pn_avatar_color";

export function normalizeAvatarColor(value: string | null | undefined): AvatarColor {
  return AVATAR_COLORS.includes(value as AvatarColor)
    ? (value as AvatarColor)
    : DEFAULT_AVATAR_COLOR;
}

export function getAvatarIconSrc(color: AvatarColor) {
  return `/profile-icons/poke-ball-icon-${color}.svg`;
}

export const PROFILE_AVATAR_BUCKET = "profile-avatars";
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export function getProfileAvatarUrl(path: string | null | undefined): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!path || !base || !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/.test(path)) return null;
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/${PROFILE_AVATAR_BUCKET}/${path}`;
}
