import { normalizeLimitlessSetCode } from "@/lib/deck-lists/limitless";
import { buildDeckListCardImageUrl } from "@/lib/deck-lists/render";

export function buildFavouriteCardArtImageUrl(set: string, number: string): string {
  if (/^\d+$/.test(number)) return buildDeckListCardImageUrl(set, number, "LG");
  // Limitless gallery/classic print IDs (TG1, CC2) use their canonical ID verbatim.
  const normalizedSet = normalizeLimitlessSetCode(set);
  return `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/${normalizedSet}/${normalizedSet}_${number}_R_EN_LG.png`;
}
