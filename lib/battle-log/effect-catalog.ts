import { cache } from "react";
import { unstable_cache } from "next/cache";
import { normalizeText } from "@/lib/log-import/normalization";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { createPublicClient } from "@/lib/supabase/public";
import type { BattleLogActionTag } from "@/lib/battle-log/display";
import type { CardEffectCatalogRow, CardEffectKind } from "@/lib/log-import/types";

const CARD_EFFECT_CATALOG_CACHE_VERSION = "v1";
const TRAINER_TAGS = new Set<CardEffectKind>(["supporter", "item", "tool", "stadium"]);
const EFFECT_TAGS = new Set<CardEffectKind>(["ability", "attack"]);

export type CardEffectLookupRow = Pick<
  CardEffectCatalogRow,
  "card_name" | "normalized_card_name" | "effect_kind" | "effect_name" | "normalized_effect_name"
>;

type CardEffectCatalogIndex = {
  effectTagsByCardAndEffect: Map<string, Set<BattleLogActionTag>>;
  trainerTagsByCard: Map<string, Set<BattleLogActionTag>>;
};

function normalizeLogText(value: string | null | undefined) {
  return normalizeText(String(value || "").replace(/['’]s\s+/g, " "));
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

  rows.forEach((row) => {
    const cardName = normalizeLogText(row.normalized_card_name || row.card_name);
    const effectName = normalizeLogText(row.normalized_effect_name || row.effect_name || "");
    const effectKind = row.effect_kind;

    if (!cardName || !effectKind) {
      return;
    }

    if (TRAINER_TAGS.has(effectKind)) {
      addTag(trainerTagsByCard, cardName, effectKind);
      return;
    }

    if (EFFECT_TAGS.has(effectKind) && effectName) {
      addTag(effectTagsByCardAndEffect, buildEffectKey(cardName, effectName), effectKind);
    }
  });

  return {
    effectTagsByCardAndEffect,
    trainerTagsByCard
  };
}

const loadCardEffectCatalogRowsCached = unstable_cache(
  async (): Promise<CardEffectLookupRow[]> => {
    const supabase = createPublicClient();

    try {
      return await fetchAllRows<CardEffectLookupRow>((from, to) =>
        supabase
          .from("card_effect_catalog")
          .select("card_name,normalized_card_name,effect_kind,effect_name,normalized_effect_name")
          .range(from, to)
      );
    } catch {
      return [];
    }
  },
  ["card-effect-catalog", CARD_EFFECT_CATALOG_CACHE_VERSION],
  {
    revalidate: 60 * 60
  }
);

const loadCardEffectCatalogIndex = cache(async () => {
  const rows = await loadCardEffectCatalogRowsCached();
  return buildCardEffectCatalogIndex(rows);
});

function extractPlayedCardName(title: string) {
  const playedMatch = String(title || "").trim().match(/\bplayed\s+(.+?)(?=\s*(?:->|→)\s*|\.$|$)/i);
  return playedMatch?.[1] ? normalizeLogText(playedMatch[1]) : "";
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
  const index = buildCardEffectCatalogIndex(rows);
  const usedEffectCandidate = extractUsedEffectCandidate(title);

  if (usedEffectCandidate) {
    return selectUnambiguousTag(
      index.effectTagsByCardAndEffect.get(
        buildEffectKey(usedEffectCandidate.cardName, usedEffectCandidate.effectName)
      )
    );
  }

  const cardName = extractPlayedCardName(title) || extractAttachedCardName(title);
  if (!cardName) {
    return null;
  }

  return selectUnambiguousTag(index.trainerTagsByCard.get(cardName));
}

export async function resolveBattleLogEffectCatalogTag(title: string): Promise<BattleLogActionTag | null> {
  const usedEffectCandidate = extractUsedEffectCandidate(title);
  const index = await loadCardEffectCatalogIndex();

  if (usedEffectCandidate) {
    return selectUnambiguousTag(
      index.effectTagsByCardAndEffect.get(
        buildEffectKey(usedEffectCandidate.cardName, usedEffectCandidate.effectName)
      )
    );
  }

  const cardName = extractPlayedCardName(title) || extractAttachedCardName(title);
  if (!cardName) {
    return null;
  }

  return selectUnambiguousTag(index.trainerTagsByCard.get(cardName));
}
