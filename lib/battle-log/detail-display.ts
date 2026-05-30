import type { BattleLogResolvedActionTag } from "@/lib/battle-log/action-tags";
import {
  classifyBattleLogActionTitle,
  type BattleLogActionTag
} from "@/lib/battle-log/display";
import { compactMap } from "@/lib/array";

export type DetailEvent = {
  cards?: string[];
  icon: "discard" | "draw" | "shuffle";
  label: string;
  outcome: string;
};

export type DamageBreakdownItem = {
  damage: string;
  label: string;
  tone: "base" | "modifier" | "total";
};

export type DamageBreakdown = {
  items: DamageBreakdownItem[];
  label: string;
};

export function getDetailCardCountLabel(cardCount: number) {
  return `${cardCount} ${cardCount === 1 ? "card" : "cards"}`;
}

export function cleanDetailActorText(text: string) {
  return String(text || "")
    .replace(/\.$/, "")
    .trim();
}

export function cleanDetailOwnerText(text: string) {
  return cleanDetailActorText(text).replace(/^[\p{L}\p{N}_.-]+['’]s\s+/u, "");
}

export function getNamedDetailCards(text: string) {
  const value = cleanDetailActorText(text);

  if (
    !value ||
    /\b(?:a\s+card|\d+\s+cards?)\b/i.test(value) ||
    /\b(?:active|bench|deck|hand|into|from|their|the)\b/i.test(value)
  ) {
    return [];
  }

  return compactMap(value
    .split(","), (card) => card.trim());
}

export function getAddedToHandDetailCard(text: string) {
  const value = String(text || "").trim();
  const addedMatch = value.match(/^(.+?)\s+was\s+added\s+to\s+(.+?)\s+hand$/i);

  if (!addedMatch?.[1] || !addedMatch[2]) {
    return null;
  }

  const card = cleanDetailActorText(addedMatch[1]);
  if (!card || /\ba\s+card\b/i.test(card)) {
    return null;
  }

  return {
    card,
    destination: `${cleanDetailOwnerText(addedMatch[2])} hand`
  };
}

export function getBattleLogDetailEvent(text: string): DetailEvent | null {
  const value = String(text || "").trim();
  const drewMatch = value.match(/^(?:.+?\s+)?drew\s+(.+)$/i);

  if (drewMatch?.[1]) {
    const namedCards = getNamedDetailCards(drewMatch[1]);
    const outcome = namedCards.length > 0
      ? getDetailCardCountLabel(namedCards.length)
      : cleanDetailActorText(drewMatch[1]).replace(/^a card$/i, "1 card");

    return {
      cards: namedCards,
      icon: "draw",
      label: "Drew",
      outcome
    };
  }

  const shuffledMatch = value.match(/^(?:.+?\s+)?shuffled\s+(.+?)\s+into\s+(?:their|the)\s+deck$/i);

  if (shuffledMatch?.[1]) {
    return {
      icon: "shuffle",
      label: "Shuffled",
      outcome: cleanDetailActorText(shuffledMatch[1])
    };
  }

  const passiveSingleDiscardMatch = value.match(/^(.+?)\s+was\s+discarded\s+from\s+(.+)$/i);

  if (passiveSingleDiscardMatch?.[1] && passiveSingleDiscardMatch[2]) {
    const discardedCard = cleanDetailActorText(passiveSingleDiscardMatch[1]);
    const discardSource = cleanDetailOwnerText(passiveSingleDiscardMatch[2]);

    return {
      cards: discardedCard ? [discardedCard] : [],
      icon: "discard",
      label: "Discarded",
      outcome: `1 card from ${discardSource}`
    };
  }

  const passiveCountDiscardMatch = value.match(/^(\d+)\s+cards?\s+were\s+discarded\s+from\s+(.+)$/i);

  if (passiveCountDiscardMatch?.[1] && passiveCountDiscardMatch[2]) {
    const discardSource = cleanDetailOwnerText(passiveCountDiscardMatch[2]);

    return {
      icon: "discard",
      label: "Discarded",
      outcome: `${getDetailCardCountLabel(Number(passiveCountDiscardMatch[1]))} from ${discardSource}`
    };
  }

  const discardedMatch = value.match(/^(?:.+?\s+)?discarded\s+(.+)$/i);

  if (discardedMatch?.[1]) {
    const namedCards = getNamedDetailCards(discardedMatch[1]);
    const outcome = namedCards.length > 0
      ? getDetailCardCountLabel(namedCards.length)
      : cleanDetailActorText(discardedMatch[1]).replace(/^a card$/i, "1 card");

    return {
      cards: namedCards,
      icon: "discard",
      label: "Discarded",
      outcome
    };
  }

  return null;
}

export function getBattleLogDamageBreakdown(items: string[]): DamageBreakdown | null {
  const [first, ...rest] = items.map((item) => cleanDetailActorText(item));

  if (!/^damage breakdown:?$/i.test(first || "")) {
    return null;
  }

  const breakdownItems = rest
    .map((item): DamageBreakdownItem | null => {
      const itemMatch = item.match(/^(.+?):\s*(\d+\+?)\s+damage$/i);

      if (!itemMatch?.[1] || !itemMatch[2]) {
        return null;
      }

      const label = cleanDetailActorText(itemMatch[1]);
      const normalizedLabel = label.toLowerCase();

      return {
        damage: `${itemMatch[2]} damage`,
        label,
        tone: normalizedLabel.startsWith("base damage")
          ? "base"
          : normalizedLabel.startsWith("total damage")
            ? "total"
            : "modifier"
      };
    })
    .filter((item): item is DamageBreakdownItem => item !== null);

  if (breakdownItems.length === 0) {
    return null;
  }

  return {
    items: breakdownItems,
    label: "Damage breakdown"
  };
}

export function isCardListDetail(text: string) {
  const value = String(text || "").trim();

  return (
    value.includes(",") &&
    !/[.!?]$/.test(value) &&
    !/\b(?:drew|draw|shuffled|discarded|moved|switched|played|attached|evolved|retreated|took|put|damage|deck|hand|active|bench)\b/i.test(value)
  );
}

export function hasDamageDetail(details: string[]) {
  return details.some((detail) => /\b(?:for|took)\s+\d+\+?\s+damage\b/i.test(String(detail || "")));
}

export function hasPossessivePokemonUsedAction(actionTitle: string) {
  return /^[A-Za-z0-9_.-]+'s\s+.+\s+used\b/i.test(String(actionTitle || "").trim());
}

export function getDisplayActionTag(
  actionTitle: string,
  details: string[],
  resolvedActionTag?: BattleLogResolvedActionTag
): BattleLogActionTag {
  if (resolvedActionTag) {
    return resolvedActionTag.tag;
  }

  const classifiedActionTag = classifyBattleLogActionTitle(actionTitle);

  if (
    classifiedActionTag === "ability" &&
    (hasDamageDetail(details) || hasPossessivePokemonUsedAction(actionTitle))
  ) {
    return "attack";
  }

  return classifiedActionTag;
}

export function getDisplayActionTagOverride(
  actionTitle: string,
  details: string[],
  resolvedActionTag?: BattleLogResolvedActionTag
): BattleLogResolvedActionTag | undefined {
  const displayActionTag = getDisplayActionTag(actionTitle, details, resolvedActionTag);

  if (displayActionTag === "attack" && resolvedActionTag?.tag !== "attack") {
    return {
      label: "Attack",
      tag: "attack"
    };
  }

  return resolvedActionTag;
}
