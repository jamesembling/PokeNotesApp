import type { ReplayProgram } from "./types";
import { buildFavouriteCardArtImageUrl } from "@/lib/social/artwork";
import type { FavouriteCardArt } from "@/lib/social/types";
import type { CardDefinitionEvidenceByName } from "@/lib/card-definition-catalog/types";
import { normalizeText } from "@/lib/log-import/normalization";

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
