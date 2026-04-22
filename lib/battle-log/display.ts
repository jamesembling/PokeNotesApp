export const BATTLE_LOG_ACTION_TAGS = [
  "draw",
  "bench",
  "evolve",
  "ability",
  "supporter",
  "item",
  "tool",
  "stadium",
  "win",
  "loss",
  "attack",
  "ko",
  "other"
] as const;

export type BattleLogActionTag = (typeof BATTLE_LOG_ACTION_TAGS)[number];

const BATTLE_LOG_ACTION_TAG_LABELS: Record<BattleLogActionTag, string> = {
  draw: "Draw",
  bench: "Bench",
  evolve: "Evolve",
  ability: "Ability",
  supporter: "Supporter",
  item: "Item",
  tool: "Tool",
  stadium: "Stadium",
  win: "Win",
  loss: "Loss",
  attack: "Attack",
  ko: "KO",
  other: "Action"
};

function normalizeBattleLogActionTitle(title: string) {
  return String(title || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyAttackTitle(normalizedTitle: string) {
  if (!/\bused\b/.test(normalizedTitle)) {
    return false;
  }

  return (
    /\bfor \d+\+? damage\b/.test(normalizedTitle) ||
    /(?:->|→).*\b\d+\+?\s+damage\b/.test(normalizedTitle) ||
    /\bdamage\b/.test(normalizedTitle) ||
    /\bknocked out\b/.test(normalizedTitle) ||
    /\bthis attack\b/.test(normalizedTitle) ||
    /\bopponent'?s active\b/.test(normalizedTitle) ||
    /\bchoose\b/.test(normalizedTitle) ||
    /\bsearch(?:ed)?\b/.test(normalizedTitle) ||
    /\bdiscard(?:ed)?\b/.test(normalizedTitle) ||
    /\bswitch(?:ed)?\b/.test(normalizedTitle)
  );
}

const BATTLE_LOG_ACTION_TAG_RULES: Array<{
  tag: BattleLogActionTag;
  patterns: RegExp[];
}> = [
  {
    tag: "win",
    patterns: [/\b(?:won|wins)\b(?: the)?\s+(?:game|match|battle)\b/, /\bvictory\b/]
  },
  {
    tag: "loss",
    patterns: [/\b(?:lost|loses)\b(?: the)?\s+(?:game|match|battle)\b/, /\bdefeat(?:ed)?\b/]
  },
  {
    tag: "ko",
    patterns: [/\bwas knocked out\b/, /\bknocked out\b/, /\bk\.?o\.?\b/]
  },
  {
    tag: "attack",
    patterns: [
      /\bused\b.*\bfor \d+\+? damage\b/,
      /\bused\b.*(?:->|→).*\b\d+\+?\s+damage\b/,
      /\bused\b.*\b\d+\+?\s+damage\b/,
      /\battack(?:ed)?\b/,
      /\bused\b/
    ]
  },
  {
    tag: "evolve",
    patterns: [/\bevolved\b/, /\bevolves?\b.*\bfrom\b/]
  },
  {
    tag: "bench",
    patterns: [/\bplayed\b.*\bto the bench\b/, /\bonto the bench\b/, /\bbenched\b/]
  },
  {
    tag: "draw",
    patterns: [/\bdrew\b.*\bcards?\b/, /\bdraw(?:s|ing)?\b.*\bcards?\b/]
  },
  {
    tag: "supporter",
    patterns: [/\bsupporter\b/]
  },
  {
    tag: "item",
    patterns: [/\bitem\b/]
  },
  {
    tag: "tool",
    patterns: [/\bpokemon tool\b/, /\btool\b/]
  },
  {
    tag: "stadium",
    patterns: [/\bstadium\b/]
  },
  {
    tag: "ability",
    patterns: [/\bability\b/, /\babilities\b/, /\bused\b(?!.*\bfor \d+\+? damage\b)/]
  }
];

export function classifyBattleLogActionTitle(title: string): BattleLogActionTag {
  const normalizedTitle = normalizeBattleLogActionTitle(title);

  if (!normalizedTitle) {
    return "other";
  }

  for (const rule of BATTLE_LOG_ACTION_TAG_RULES) {
    if (rule.tag === "attack" && /\bused\b/.test(normalizedTitle) && !isLikelyAttackTitle(normalizedTitle)) {
      continue;
    }

    if (rule.patterns.some((pattern) => pattern.test(normalizedTitle))) {
      return rule.tag;
    }
  }

  return "other";
}

export function getBattleLogActionTagLabel(title: string) {
  const normalizedTitle = normalizeBattleLogActionTitle(title);
  const tag = classifyBattleLogActionTitle(title);

  if (tag !== "other") {
    return BATTLE_LOG_ACTION_TAG_LABELS[tag];
  }

  if (/\bplayed\b/.test(normalizedTitle)) {
    return "Play";
  }

  if (/\battached\b/.test(normalizedTitle)) {
    return "Attach";
  }

  if (/\bswitched?\b/.test(normalizedTitle)) {
    return "Switch";
  }

  if (/\bretreated\b/.test(normalizedTitle)) {
    return "Retreat";
  }

  if (/\bshuffled\b/.test(normalizedTitle)) {
    return "Shuffle";
  }

  if (/\bdiscarded\b/.test(normalizedTitle)) {
    return "Discard";
  }

  if (/\bmoved\b/.test(normalizedTitle)) {
    return "Move";
  }

  return BATTLE_LOG_ACTION_TAG_LABELS.other;
}

export function prettifyPokemonSlug(slug: string) {
  const parts = slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1));

  const megaIndex = parts.findIndex((part) => part === "Mega");
  if (megaIndex >= 0) {
    const megaParts = parts.filter((part) => part !== "Mega");
    return ["Mega", ...megaParts].join(" ");
  }

  return parts.join(" ");
}

function getVisibleSprites(sprites: string[]) {
  return Array.from(
    new Set(
      sprites
        .map((sprite) => String(sprite || "").trim())
        .filter(Boolean)
    )
  );
}

export function getBattleLogSpriteDisplayName(sprites: string[], separator = " / ") {
  const visibleSprites = getVisibleSprites(sprites);

  if (visibleSprites.length === 0) {
    return "";
  }

  return visibleSprites.map(prettifyPokemonSlug).join(separator);
}

export function getBattleLogDeckDisplayName(deckName: string, sprites: string[]) {
  const normalizedDeckName = String(deckName || "").trim();

  if (normalizedDeckName && normalizedDeckName.toLowerCase() !== "unknown deck") {
    return normalizedDeckName;
  }

  const spriteDisplayName = getBattleLogSpriteDisplayName(sprites);
  if (spriteDisplayName) {
    return spriteDisplayName;
  }

  return "Unknown Deck";
}

export function getBattleLogOpponentDisplayName(deckName: string, sprites: string[]) {
  const spriteDisplayName = getBattleLogSpriteDisplayName(sprites, "/");
  if (spriteDisplayName) {
    return spriteDisplayName;
  }

  return getBattleLogDeckDisplayName(deckName, sprites);
}
