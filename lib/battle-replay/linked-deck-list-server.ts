import { normalizeText } from "@/lib/log-import/normalization";
import type { CardDefinitionEvidenceByName } from "@/lib/card-definition-catalog/types";
import type { DeckCard } from "@/types/index";

const collector = (value: string) => value.trim().toUpperCase().replace(/^0+(?=\d)/, "");

/** Public set identity only: no account identifiers, deck lists or card names
 * enter the provider request. Successful metadata is cached for one day. */
export async function loadReplaySetCodes(
  cards: readonly DeckCard[],
  definitions: CardDefinitionEvidenceByName,
  signal: AbortSignal = AbortSignal.timeout(2500),
): Promise<Record<string, string>> {
  const numbers = new Map<string, Set<string>>();
  for (const card of cards) {
    const name = normalizeText(card.name);
    const listed = numbers.get(name) ?? new Set<string>();
    listed.add(collector(card.number));
    numbers.set(name, listed);
  }
  const setIds = [...new Set(Object.entries(definitions).flatMap(([name, found]) =>
    found.candidates.filter((card) => numbers.get(name)?.has(collector(card.localId)))
      .map((card) => card.setId)).filter((id) => /^[a-zA-Z0-9._-]{1,32}$/.test(id)))];
  // Unbounded or unavailable reference data cannot justify a printing match.
  if (setIds.length > 64) return {};
  const entries = await Promise.all(setIds.map(async (id): Promise<[string, string] | null> => {
    try {
      const response = await fetch(`https://api.tcgdex.net/v2/en/sets/${encodeURIComponent(id)}`, {
        signal,
        next: { revalidate: 86400 },
      });
      if (!response.ok) return null;
      const body = await response.text();
      if (body.length > 256_000) return null;
      const set: unknown = JSON.parse(body);
      if (!set || typeof set !== "object") return null;
      const record = set as { id?: unknown; abbreviation?: { official?: unknown } };
      const code = record.abbreviation?.official;
      return record.id === id && typeof code === "string" && /^[a-zA-Z0-9.-]{1,12}$/.test(code)
        ? [id, code] : null;
    } catch { return null; }
  }));
  return Object.fromEntries(entries.filter((entry): entry is [string, string] => entry !== null));
}
