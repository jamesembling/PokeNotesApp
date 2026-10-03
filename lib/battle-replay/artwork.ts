import type { ReplayProgram } from "./types";
import { buildFavouriteCardArtImageUrl } from "@/lib/social/artwork";
import type { FavouriteCardArt } from "@/lib/social/types";
import type { CardDefinitionEvidenceByName } from "@/lib/card-definition-catalog/types";
import { normalizeText } from "@/lib/log-import/normalization";

// Representative artwork only: these prints do not establish HP, identity, or format legality.
export const representativePrintings: Record<string, { set: string; number: string }> = {
  "Air Balloon": { set: "MEG", number: "166" },
  "Area Zero Underdepths": { set: "PRE", number: "94" },
  "Basic Darkness Energy": { set: "SVE", number: "7" },
  "Basic Fire Energy": { set: "SVE", number: "2" },
  "Basic Metal Energy": { set: "SVE", number: "8" },
  "Basic Psychic Energy": { set: "SVE", number: "5" },
  Beldum: { set: "TEF", number: "113" },
  "Blaziken ex": { set: "JTG", number: "24" },
  "Boss's Orders": { set: "ASC", number: "183" },
  "Buddy-Buddy Poffin": { set: "MEG", number: "167" },
  Budew: { set: "ASC", number: "16" },
  Combusken: { set: "JTG", number: "23" },
  Crispin: { set: "SCR", number: "133" },
  Dawn: { set: "PFL", number: "87" },
  Drilbur: { set: "PBL", number: "46" },
  "Dragapult ex": { set: "TWM", number: "130" },
  Drakloak: { set: "TWM", number: "129" },
  Dreepy: { set: "TWM", number: "128" },
  "Energy Recycler": { set: "POR", number: "108" },
  "Fezandipiti ex": { set: "ASC", number: "142" },
  "Genesect ex": { set: "BLK", number: "67" },
  Heatran: { set: "TWM", number: "123" },
  "Lillie's Clefairy ex": { set: "JTG", number: "56" },
  "Lillie's Determination": { set: "ASC", number: "192" },
  Judge: { set: "POR", number: "76" },
  "Meowth ex": { set: "POR", number: "62" },
  Metagross: { set: "CRI", number: "61" },
  Metang: { set: "TEF", number: "114" },
  Moltres: { set: "PFL", number: "14" },
  Munkidori: { set: "TWM", number: "95" },
  "Night Stretcher": { set: "ASC", number: "196" },
  "Poké Pad": { set: "POR", number: "81" },
  "Precious Trolley": { set: "SSP", number: "185" },
  Psyduck: { set: "ASC", number: "226" },
  "Rare Candy": { set: "MEG", number: "125" },
  "Risky Ruins": { set: "MEG", number: "127" },
  "Special Red Card": { set: "CRI", number: "82" },
  "Team Rocket's Petrel": { set: "DRI", number: "176" },
  "Team Rocket's Factory": { set: "DRI", number: "173" },
  Torchic: { set: "JTG", number: "22" },
  "Ultra Ball": { set: "ASC", number: "213" },
  "Unfair Stamp": { set: "TWM", number: "165" },
};

/** Only names already reconstructed on a visible surface are sent to the public provider. */
export function collectMissingReplayArtworkNames(program: ReplayProgram): string[] {
  const names = new Set<string>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { for (const entry of value) visit(entry); return; }
    const record = value as Record<string, unknown>;
    if (typeof record.name === "string" && record.imageUrl === "" && record.name.length >= 2 && record.name.length <= 120)
      names.add(record.name);
    for (const entry of Object.values(record)) visit(entry);
  };
  visit(program.frames);
  visit(program.events.map((event) => event.transaction));
  return [...names];
}

/** A representative print is accepted only when its complete card name matches. */
export function selectReplayArtworkPrinting(name: string, prints: FavouriteCardArt[]): FavouriteCardArt | null {
  const canonical = (value: string) => value.normalize("NFC").trim().replace(/[’‘]/g, "'").toLocaleLowerCase("en");
  return prints.find((print) => canonical(print.name) === canonical(name)) ?? null;
}

export async function resolveReplayArtwork(
  program: ReplayProgram,
  search: (name: string, signal?: AbortSignal) => Promise<FavouriteCardArt[]>,
  signal?: AbortSignal,
  definitions?: CardDefinitionEvidenceByName,
): Promise<Record<string, string>> {
  // Bound provider work and keep the client payload to a name/URL dictionary.
  const artwork: Record<string, string> = {};
  const names = collectMissingReplayArtworkNames(program).slice(0, 40).filter((name) => {
    const evidence = definitions?.[normalizeText(name)];
    const printing = evidence?.coverage === "complete" ? [...evidence.candidates]
      .filter((card) => normalizeText(card.name) === normalizeText(name)
        && typeof card.imageUrl === "string" && /^https:\/\/assets\.tcgdex\.net\/en\/.+\/high\.webp$/.test(card.imageUrl))
      .sort((left, right) => (right.setReleaseDate ?? "").localeCompare(left.setReleaseDate ?? "")
        || left.sourceCardId.localeCompare(right.sourceCardId))[0] : undefined;
    if (!printing?.imageUrl) return true;
    artwork[name] = printing.imageUrl;
    return false;
  });
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, names.length) }, async () => {
    while (next < names.length && !signal?.aborted) {
      const name = names[next++];
      try {
        const print = selectReplayArtworkPrinting(name, await search(name, signal));
        if (print) artwork[name] = buildFavouriteCardArtImageUrl(print.set, print.number);
      } catch { /* Artwork is optional; recorded identity and replay state remain usable. */ }
    }
  }));
  return artwork;
}
