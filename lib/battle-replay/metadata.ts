import { extractUsedEffectCandidate } from "@/lib/battle-log/effect-catalog";
import { normalizeText } from "@/lib/log-import/normalization";
import type { ReplayActor, ReplayProgram } from "./types";

/** Named identities actually evidenced for one player, independent of which
 * player controlled the action. Used to check a selected Deck List's claims. */
export function collectReplayOwnerCardNames(program: ReplayProgram, actor: ReplayActor): string[] {
  const names = new Set<string>();
  for (const frame of program.frames) {
    const side = frame[actor];
    for (const card of [side.active, ...side.bench, ...(side.unplaced ?? [])]) if (card) {
      names.add(card.name);
      for (const underlying of card.underlying) names.add(underlying.name);
      if (card.tool) names.add(card.tool);
      for (const energy of card.energy) names.add(/Energy$/i.test(energy) ? energy : `Basic ${energy} Energy`);
    }
    for (const pool of side.boardPools ?? []) for (const card of [...pool.cards, ...(pool.possiblyReturnedCards ?? []), ...(pool.uncertainCards ?? []).flatMap((group) => group.cards), ...(pool.memberEvidence ?? [])]) names.add(card.name);
    for (const card of [...side.knownHand, ...side.discard]) names.add(card.name);
    if (frame.stadium?.actor === actor) names.add(frame.stadium.name);
    if (frame.playedCard?.actor === actor) names.add(frame.playedCard.card.name);
  }
  return [...names].sort();
}

/** Lower bounds on simultaneous physical copies, never the number of times a
 * name appeared in the log. Transient played-card animations are not extra cards. */
export function collectReplayOwnerCardCounts(program: ReplayProgram, actor: ReplayActor): Record<string, number> {
  const maxima: Record<string, number> = {};
  for (const frame of program.frames) {
    const side = frame[actor];
    const counts = new Map<string, number>();
    const seen = new Set<string>();
    const add = (name: string, id?: string) => {
      if (id && seen.has(id)) return;
      if (id) seen.add(id);
      const normalized = normalizeText(name);
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    };
    for (const card of [side.active, ...side.bench, ...(side.unplaced ?? [])]) if (card) {
      add(card.name, card.id);
      for (const underlying of card.underlying) add(underlying.name, underlying.id);
      if (card.tool) add(card.tool);
      for (const energy of card.energy) add(/Energy$/i.test(energy) ? energy : `Basic ${energy} Energy`);
    }
    for (const pool of side.boardPools ?? []) for (const card of [...pool.cards, ...(pool.possiblyReturnedCards ?? []), ...(pool.uncertainCards ?? []).flatMap((group) => group.cards)]) add(card.name, card.id);
    if (!side.uncertainZones?.includes("hand")) for (const card of side.knownHand) add(card.name, card.id);
    if (!side.uncertainZones?.includes("discard")) for (const card of side.discard) add(card.name, card.id);
    if (frame.stadium?.actor === actor) add(frame.stadium.name);
    for (const [name, amount] of counts) maxima[name] = Math.max(maxima[name] ?? 0, amount);
  }
  return maxima;
}

/** Collect public card names from reconstructed evidence, never player names or raw logs. */
export function collectReplayDefinitionNames(program: ReplayProgram, lines: readonly string[], playerNames: readonly string[] = []): string[] {
  const names = new Set<string>();
  const players = new Set(playerNames.map(normalizeText));
  const add = (name: unknown) => {
    if (typeof name === "string" && name.trim().length >= 2 && name.length <= 120
      && !/\bmulligans?\b|\bfor the opening hand\b/i.test(name)
      && !/^(?:it|them|a card|cards?|an? Energy|[a-z]+ Energy:\s*\d+.*)$/i.test(name.trim())) names.add(name.trim());
  };
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { for (const item of value) visit(item); return; }
    const record = value as Record<string, unknown>;
    if (typeof record.id === "string") add(record.name);
    add(record.tool);
    if (Array.isArray(record.energy)) for (const energy of record.energy) add(energy);
    for (const child of Object.values(record)) visit(child);
  };
  visit(program.frames);
  visit(program.events.map((event) => event.transaction));
  for (const line of lines) {
    const used = extractUsedEffectCandidate(line)?.cardName;
    if (used && !players.has(normalizeText(used))) add(used);
    add(line.match(/\bplayed\s+(.+?)(?=\s+(?:to|into)\s+(?:the\s+)?(?:Active Spot|Bench|Stadium spot)\b|\s*(?:->|→)\s*|\.$|$)/i)?.[1]);
    add(line.match(/^.+?\sattached\s+(.+?)(?=\s+to\b)/i)?.[1]);
  }
  return [...names].sort();
}
