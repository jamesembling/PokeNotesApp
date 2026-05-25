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

export const DEFAULT_AVATAR_COLOR: AvatarColor = "red";
export const PROFILE_AVATAR_COOKIE = "pn_avatar_color";

export function normalizeAvatarColor(value: string | null | undefined): AvatarColor {
  return AVATAR_COLORS.includes(value as AvatarColor)
    ? (value as AvatarColor)
    : DEFAULT_AVATAR_COLOR;
}

export function getAvatarIconSrc(color: AvatarColor) {
  return `/profile-icons/poke-ball-icon-${color}.svg`;
}
