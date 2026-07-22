import { classifyBattleLogActionTitle, type BattleLogActionTag } from "@/lib/battle-log/display";
import { resolveBattleLogEffectCatalogTags } from "@/lib/battle-log/effect-catalog";
import type { LogSection } from "@/types/index";
import { compactMap } from "@/lib/array";

const RESOLVABLE_TAGS = new Set<BattleLogActionTag>(["supporter", "item", "tool", "stadium"]);

export type BattleLogResolvedActionTag = {
  label: string;
  tag: BattleLogActionTag;
};

export type BattleLogActionTagOverrides = Array<Array<BattleLogResolvedActionTag | null>>;

function normalizeValue(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ");
}

function getResolvedTagLabel(tag: BattleLogActionTag) {
  switch (tag) {
    case "supporter":
      return "Supporter";
    case "item":
      return "Item";
    case "tool":
      return "Tool";
    case "stadium":
      return "Stadium";
    case "ability":
      return "Ability";
    case "attack":
      return "Attack";
    default:
      return "Action";
  }
}

function buildResolvedCardTag(tag: BattleLogActionTag): BattleLogResolvedActionTag {
  return {
    tag,
    label: getResolvedTagLabel(tag)
  };
}

function isResolvableActionTitle(title: string) {
  const tag = classifyBattleLogActionTitle(title);
  if (RESOLVABLE_TAGS.has(tag)) {
    return false;
  }

  const normalized = normalizeValue(title);
  return /\bplayed\b/.test(normalized) || /\battached\b/.test(normalized) || /\bused\b/.test(normalized);
}

export function extractBattleLogActionCardCandidate(title: string) {
  const trimmed = String(title || "").trim();
  if (!trimmed) {
    return null;
  }

  const playedMatch = trimmed.match(/\bplayed\s+(.+?)(?=\s*(?:->|→)\s*|\.$|$)/i);
  if (playedMatch?.[1]) {
    return sanitizeCardCandidate(playedMatch[1]);
  }

  const attachedMatch = trimmed.match(/\battached\s+(.+?)(?=\s+to\b|\.$|$)/i);
  if (attachedMatch?.[1]) {
    return sanitizeCardCandidate(attachedMatch[1]);
  }

  return null;
}

function sanitizeCardCandidate(value: string) {
  const candidate = String(value || "")
    .trim()
    .replace(/^(?:a|an|the)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!candidate) {
    return null;
  }

  const normalized = normalizeValue(candidate);
  if (
    normalized === "card" ||
    normalized.endsWith(" card") ||
    normalized === "energy" ||
    normalized.endsWith(" energy")
  ) {
    return null;
  }

  return candidate;
}

export async function resolveBattleLogActionTagOverrides(sections: LogSection[]) {
  const titles = Array.from(
    new Set(
      sections.flatMap((section) =>
        compactMap(section.actions, (action) => String(action.title || "").trim())
      )
    )
  );
  const resolvableTitles = titles.filter(isResolvableActionTitle);
  const catalogTagsByTitle = await resolveBattleLogEffectCatalogTags(resolvableTitles);

  const overridesByTitle = new Map(
    Array.from(catalogTagsByTitle.entries()).map(([title, tag]) => [title, buildResolvedCardTag(tag)] as const)
  );

  return sections.map((section) =>
    section.actions
      .filter((action) => normalizeValue(action.title) !== "setup")
      .map((action) => {
        const title = String(action.title || "").trim();
        return overridesByTitle.get(title) ?? null;
      })
  );
}
