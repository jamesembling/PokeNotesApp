import { normalizeText } from "@/lib/log-import/normalization";
import { createPublicClient } from "@/lib/supabase/public";
import type { BattleLogActionTag } from "@/lib/battle-log/display";
import type { CardEffectCatalogRow, CardEffectKind } from "@/lib/log-import/types";
import { compactMap } from "@/lib/array";
import { stripLogCardIdentifiers } from "./card-identifiers";

const TRAINER_TAGS = new Set<CardEffectKind>(["supporter", "item", "tool", "stadium"]);
const EFFECT_TAGS = new Set<CardEffectKind>(["ability", "attack"]);

export type CardEffectLookupRow = Pick<
  CardEffectCatalogRow,
  "card_name" | "normalized_card_name" | "effect_kind" | "effect_name" | "normalized_effect_name"
> & Partial<Pick<CardEffectCatalogRow, "effect_text">> & { effect_candidates_incomplete?: boolean };

type EffectOrigin = "hand" | "deck" | "discard";

type CardEffectCatalogIndex = {
  effectTagsByCardAndEffect: Map<string, Set<BattleLogActionTag>>;
  trainerTagsByCard: Map<string, Set<BattleLogActionTag>>;
  effectRows: Map<string, CardEffectLookupRow[]>;
  trainerRows: Map<string, CardEffectLookupRow[]>;
  incompleteEffectCards: Set<string>;
};

function normalizeLogText(value: string | null | undefined) {
  return normalizeText(stripLogCardIdentifiers(value || ""));
}

function buildEffectKey(cardName: string, effectName: string) {
  return `${cardName}\u0000${effectName}`;
}

function addTag(target: Map<string, Set<BattleLogActionTag>>, key: string, tag: BattleLogActionTag) {
  const tags = target.get(key) ?? new Set<BattleLogActionTag>();
  tags.add(tag);
  target.set(key, tags);
}

function selectUnambiguousTag(tags: Set<BattleLogActionTag> | undefined) {
  if (!tags || tags.size !== 1) {
    return null;
  }

  return Array.from(tags)[0];
}

function buildCardEffectCatalogIndex(rows: CardEffectLookupRow[]): CardEffectCatalogIndex {
  const effectTagsByCardAndEffect = new Map<string, Set<BattleLogActionTag>>();
  const trainerTagsByCard = new Map<string, Set<BattleLogActionTag>>();
  const effectRows = new Map<string, CardEffectLookupRow[]>();
  const trainerRows = new Map<string, CardEffectLookupRow[]>();
  const incompleteEffectCards = new Set<string>();
  const addRow = (target: Map<string, CardEffectLookupRow[]>, key: string, row: CardEffectLookupRow) => {
    const matching = target.get(key) ?? [];
    matching.push(row);
    target.set(key, matching);
  };

  rows.forEach((row) => {
    const cardName = normalizeLogText(row.normalized_card_name || row.card_name);
    if (row.effect_candidates_incomplete) incompleteEffectCards.add(cardName);
    const effectName = normalizeLogText(row.normalized_effect_name || row.effect_name || "");
    const effectKind = row.effect_kind;

    if (!cardName || !effectKind) {
      return;
    }

    if (TRAINER_TAGS.has(effectKind)) {
      addTag(trainerTagsByCard, cardName, effectKind);
      addRow(trainerRows, cardName, row);
      return;
    }

    if (EFFECT_TAGS.has(effectKind) && effectName) {
      addTag(effectTagsByCardAndEffect, buildEffectKey(cardName, effectName), effectKind);
      addRow(effectRows, buildEffectKey(cardName, effectName), row);
    }
  });

  return {
    effectTagsByCardAndEffect,
    trainerTagsByCard, effectRows, trainerRows, incompleteEffectCards
  };
}

function extractPlayedCardName(title: string) {
  const playedMatch = String(title || "").trim().match(/\bplayed\s+(.+?)(?=\s*(?:->|→)\s*|\.$|$)/i);
  return playedMatch?.[1] ? normalizeLogText(playedMatch[1]) : "";
}

/** Only an explicit, single source zone establishes an omitted movement origin. */
export function resolveBattleLogEffectOriginFromRows(title: string, rows: CardEffectLookupRow[], detail?: string): EffectOrigin | null {
  return resolveOriginFromIndex(title, buildCardEffectCatalogIndex(rows), detail);
}

function resolveOriginFromIndex(title: string, index: CardEffectCatalogIndex, detail?: string): EffectOrigin | null {
  const candidate = extractUsedEffectCandidate(title);
  const trainerName = extractPlayedCardName(title) || extractAttachedCardName(title);
  const matching = (candidate ? index.effectRows.get(buildEffectKey(candidate.cardName, candidate.effectName)) : index.trainerRows.get(trainerName)) ?? [];
  if (!matching.length || !resolveTagFromIndex(title, index)) return null;
  const origins = matching.map((row) => {
    const text = String(row.effect_text || "");
    const clauses = text.split(/(?<=[.!?])\s+/);
    const relevant = detail && /\battached\b/i.test(detail) ? clauses.filter((clause) => /\battach\b/i.test(clause))
      : detail && /\bshuffled\b/i.test(detail) ? clauses.filter((clause) => /\bshuffles?\b/i.test(clause))
      : detail && /\b(?:moved|returned|added|put)\b.+\bhand\b/i.test(detail) ? clauses.filter((clause) => /\b(?:put|return|add|move)\b.+\bhand\b/i.test(clause)) : [];
    const originText = relevant.length ? relevant.join(" ") : text;
    const zones = new Set<EffectOrigin>();
    for (const match of originText.matchAll(/\bfrom (?:your|their|your opponent['’]s) (discard pile|hand|deck)\b/gi)) {
      zones.add(match[1].toLowerCase() === "discard pile" ? "discard" : match[1].toLowerCase() as EffectOrigin);
    }
    if (/\bsearch your deck\b/i.test(originText)) zones.add("deck");
    if (/\bshuffles? (?:your|their|his or her) hand (?:into (?:your|their|his or her) deck|and puts? it on the bottom of (?:your|their|his or her) deck)\b/i.test(originText)) zones.add("hand");
    if (/\blook at the top \d+ cards of your deck\b/i.test(text)
      && /\battach\b[^.]*\b(?:cards|Energy)\b[^.]*\byou find there\b/i.test(text)
      && (!detail || /\battached\b/i.test(detail))) zones.add("deck");
    // A later attachment/return may refer back to cards just found by a search.
    if (!zones.size && relevant.length && /\bsearch your deck\b/i.test(text)
      && !/\bfrom (?:your|their) (?:hand|discard pile)\b/i.test(text)) zones.add("deck");
    return zones.size === 1 ? Array.from(zones)[0] : null;
  });
  return origins.every((origin) => origin !== null && origin === origins[0]) ? origins[0] : null;
}

function extractAttachedCardName(title: string) {
  const attachedMatch = String(title || "").trim().match(/\battached\s+(.+?)(?=\s+to\b|\.$|$)/i);
  return attachedMatch?.[1] ? normalizeLogText(attachedMatch[1]) : "";
}

function stripTrailingEffectContext(value: string) {
  return String(value || "")
    .replace(/\s+on\s+.+$/i, "")
    .replace(/\s+for\s+\d+\+?\s+damage.*$/i, "")
    .replace(/\s*->\s*.+$/i, "")
    .trim();
}

function stripLeadingPossessiveOwner(value: string) {
  return String(value || "").trim().replace(/^.+?['’]s\s+/, "");
}

export function extractUsedEffectCandidate(title: string) {
  const cleanedTitle = String(title || "").trim().replace(/\.$/, "");
  const usedMatch = cleanedTitle.match(/^(.+?)\s+used\s+(.+)$/i);

  if (!usedMatch?.[1] || !usedMatch[2]) {
    return null;
  }

  const cardName = normalizeLogText(stripLeadingPossessiveOwner(usedMatch[1]));
  const effectName = normalizeLogText(stripTrailingEffectContext(usedMatch[2]));

  if (!cardName || !effectName) {
    return null;
  }

  return {
    cardName,
    effectName
  };
}

export function resolveBattleLogEffectCatalogTagFromRows(
  title: string,
  rows: CardEffectLookupRow[]
): BattleLogActionTag | null {
  return resolveTagFromIndex(title, buildCardEffectCatalogIndex(rows));
}

function resolveTagFromIndex(title: string, index: CardEffectCatalogIndex): BattleLogActionTag | null {
  const usedEffectCandidate = extractUsedEffectCandidate(title);

  if (usedEffectCandidate) {
    if (index.incompleteEffectCards.has(usedEffectCandidate.cardName)) return null;
    return selectUnambiguousTag(
      index.effectTagsByCardAndEffect.get(
        buildEffectKey(usedEffectCandidate.cardName, usedEffectCandidate.effectName)
      )
    );
  }

  const cardName = extractPlayedCardName(title) || extractAttachedCardName(title);
  if (!cardName || index.incompleteEffectCards.has(cardName)) {
    return null;
  }

  return selectUnambiguousTag(index.trainerTagsByCard.get(cardName));
}

async function fetchCandidateRows(args: {
  effectCandidates: Array<{ cardName: string; effectName: string }>;
  trainerCardNames: string[];
}, signal?: AbortSignal) {
  const supabase = createPublicClient();
  const effectCardNames = Array.from(
    new Set(args.effectCandidates.map((candidate) => candidate.cardName))
  );
  const effectNames = Array.from(
    new Set(args.effectCandidates.map((candidate) => candidate.effectName))
  );
  const trainerCardNames = Array.from(new Set(args.trainerCardNames));

  async function fetchEffects(): Promise<CardEffectLookupRow[]> {
    if (effectCardNames.length > 0 && effectNames.length > 0) {
      const { data, error, count } = await supabase
        .from("card_effect_catalog")
        .select("card_name,normalized_card_name,effect_kind,effect_name,normalized_effect_name,effect_text", { count: "exact" })
        .in("normalized_card_name", effectCardNames)
        .in("normalized_effect_name", effectNames)
        .in("effect_kind", Array.from(EFFECT_TAGS))
        .abortSignal(signal ?? AbortSignal.timeout(8000));

      // A capped or incomplete response cannot establish agreement across printings.
      if (error || !Array.isArray(data) || !Number.isInteger(count) || count !== data.length) return [];
      return data as CardEffectLookupRow[];
    }
    return [];
  }
  async function fetchTrainers(): Promise<CardEffectLookupRow[]> {
    if (trainerCardNames.length > 0) {
      const { data, error, count } = await supabase
        .from("card_effect_catalog")
        .select("card_name,normalized_card_name,effect_kind,effect_name,normalized_effect_name,effect_text", { count: "exact" })
        .in("normalized_card_name", trainerCardNames)
        .in("effect_kind", Array.from(TRAINER_TAGS))
        .abortSignal(signal ?? AbortSignal.timeout(8000));

      // A capped or incomplete response cannot establish agreement across printings.
      if (error || !Array.isArray(data) || !Number.isInteger(count) || count !== data.length) return [];
      return data as CardEffectLookupRow[];
    }
    return [];
  }
  // Each family must be complete, but an independent failure does not erase
  // already established evidence from the other family.
  const results = await Promise.allSettled([fetchEffects(), fetchTrainers()]);
  return results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
}

export async function resolveBattleLogEffectCatalogEvidence(titles: string[], signal?: AbortSignal) {
  const uniqueTitles = Array.from(new Set(compactMap(titles, (title) => String(title || "").trim())));
  const effectCandidates = uniqueTitles
    .map((title) => extractUsedEffectCandidate(title))
    .filter((candidate): candidate is { cardName: string; effectName: string } => candidate !== null);
  const trainerCardNames = compactMap(uniqueTitles, (title) => extractPlayedCardName(title) || extractAttachedCardName(title));
  const rows = await fetchCandidateRows({
    effectCandidates,
    trainerCardNames
  }, signal);
  return resolveBattleLogEffectEvidenceFromRows(uniqueTitles, rows);
}

/** Resolve all titles against one complete candidate set without more network work. */
function resolveBattleLogEffectEvidenceFromRows(titles: string[], rows: CardEffectLookupRow[]) {
  const uniqueTitles = Array.from(new Set(titles.map((title) => title.trim()).filter(Boolean)));
  const resolvedByTitle = new Map<string, BattleLogActionTag>();
  const origins = new Map<string, EffectOrigin>();
  const resolver = createBattleLogEffectEvidenceResolver(rows);

  uniqueTitles.forEach((title) => {
    const resolved = resolver.tag(title);

    if (resolved) {
      resolvedByTitle.set(title, resolved);
    }
    const origin = resolver.origin(title);
    if (origin) origins.set(title, origin);
  });

  return { tags: resolvedByTitle, origins, rows };
}

/** One index per complete lookup, reused for parent actions and scoped details. */
export function createBattleLogEffectEvidenceResolver(rows: CardEffectLookupRow[]) {
  const index = buildCardEffectCatalogIndex(rows);
  return {
    tag: (title: string) => resolveTagFromIndex(title, index),
    origin: (title: string, detail?: string) => resolveOriginFromIndex(title, index, detail),
  };
}

export async function resolveBattleLogEffectCatalogTags(titles: string[]) {
  return (await resolveBattleLogEffectCatalogEvidence(titles)).tags;
}
