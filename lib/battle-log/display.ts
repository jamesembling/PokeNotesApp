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

function cleanBattleLogDisplayText(value: string) {
  return String(value || "")
    .trim()
    .replace(/\.$/, "")
    .replace(/\bActive Spot\b/g, "Active spot")
    .replace(/\bthe Bench\b/g, "Bench");
}

function withOptionalActorPrefix(
  actor: string,
  value: string,
  retainActor: boolean,
  options: { cleanValue?: boolean } = {}
) {
  const cleanedValue = options.cleanValue === false ? value : cleanBattleLogDisplayText(value);
  return retainActor ? `${cleanBattleLogDisplayText(actor)}: ${cleanedValue}` : cleanedValue;
}

function cleanAttachmentTarget(value: string) {
  return cleanBattleLogDisplayText(value)
    .replace(/\bin the Active spot\b/i, "in the Active")
    .replace(/\bon Bench\b/i, "on the Bench");
}

function cleanBoardPositionText(value: string) {
  return cleanBattleLogDisplayText(value).replace(/\bon Bench\b/i, "on the Bench");
}

function stripBattleLogPlayerPossessives(value: string) {
  return cleanBattleLogDisplayText(value).replace(/(^|\s)[\p{L}\p{N}_.-]+['’]s\s+/gu, "$1");
}

function stripBattleLogPlayerReferences(value: string) {
  return cleanBattleLogDisplayText(value).replace(
    /(^|\s)(?:Opponent|Self|[\p{L}\p{N}_.-]*[\p{N}_.-][\p{L}\p{N}_.-]*)['’]s\s+/gu,
    "$1"
  );
}

function stripLeadingBattleLogPlayerPossessive(value: string) {
  return cleanBattleLogDisplayText(value).replace(/^[-•]?\s*[\p{L}\p{N}_.-]+['’]s\s+/u, (match) =>
    match.startsWith("-") || match.startsWith("•") ? match.slice(0, 2) : ""
  );
}

export function formatBattleLogActionDetail(
  detail: string,
  options: { actionTag?: BattleLogActionTag } = {}
) {
  const displayDetail = stripLeadingBattleLogPlayerPossessive(detail);

  if (options.actionTag === "attack") {
    return stripBattleLogPlayerReferences(displayDetail);
  }

  return displayDetail;
}

function isAbilityActivationTitle(value: string) {
  return /^[-•]?\s*.+?'s\s+.+?\s+was activated\.?$/i.test(String(value || "").trim());
}

function cleanLeadingBullet(value: string) {
  return String(value || "").trim().replace(/^[-•]\s*/, "");
}

function getPromotedAbilityActivationTitle(details: string[]) {
  const activationDetail = details
    .map(cleanLeadingBullet)
    .find((detail) => isAbilityActivationTitle(detail));

  return activationDetail || "";
}

function isDudunsparceRunAwayDrawShape(title: string, details: string[]) {
  const displayTitle = cleanBattleLogDisplayText(title);

  if (!/^.+?\s+played\s+Dudunsparce$/i.test(displayTitle)) {
    return false;
  }

  const cleanedDetails = details.map((detail) => cleanBattleLogDisplayText(cleanLeadingBullet(detail)));
  return (
    cleanedDetails.some((detail) => /\bdrew\s+3\s+cards\b/i.test(detail)) &&
    cleanedDetails.some((detail) => /\bshuffled\s+2\s+cards\s+into\s+their\s+deck\b/i.test(detail)) &&
    cleanedDetails.some((detail) => /\bDudunsparce\b/i.test(detail))
  );
}

function getRetreatPromotionDetail(details: string[]) {
  for (const detail of details) {
    const value = stripLeadingBattleLogPlayerPossessive(cleanLeadingBullet(detail));
    const promotedMatch = value.match(/^(.+?)\s+is now in the Active spot$/i);

    if (promotedMatch?.[1]) {
      return `${cleanBattleLogDisplayText(promotedMatch[1])} is now in the Active spot`;
    }
  }

  return "";
}

function isRetreatPromotionDetail(detail: string) {
  return /^.+?\s+is now in the Active spot$/i.test(
    stripLeadingBattleLogPlayerPossessive(cleanLeadingBullet(detail))
  );
}

type AttackDamageDetail = {
  damage: string;
  target: string;
};

function getAttackDamageDetail(detail: string): AttackDamageDetail | null {
  const value = formatBattleLogActionDetail(cleanLeadingBullet(detail), { actionTag: "attack" });
  const damageMatch = value.match(/^(.+?)\s+took\s+(\d+\+?)\s+damage$/i);

  if (damageMatch?.[1] && damageMatch[2]) {
    return {
      damage: damageMatch[2],
      target: cleanBattleLogDisplayText(damageMatch[1])
    };
  }

  return null;
}

function getAttackDamageDetails(details: string[]) {
  return details
    .map(getAttackDamageDetail)
    .filter((detail): detail is AttackDamageDetail => detail !== null);
}

function shouldPromoteAttackDamageDetails(title: string, details: string[]) {
  return (
    getAttackDamageDetails(details).length > 0 &&
    (classifyBattleLogActionTitle(title) === "attack" || /\bused\b/i.test(title))
  );
}

function formatAttackDamageTarget(detail: AttackDamageDetail) {
  return `${detail.target} for ${detail.damage} damage`;
}

function getPromotedAttackDamageTitle(title: string, details: string[]) {
  const displayTitle = cleanBattleLogDisplayText(title);
  const damageDetails = getAttackDamageDetails(details);

  if (/\bon\s+.+?\s+for\s+\d+\+?\s+damage$/i.test(displayTitle)) {
    return [
      displayTitle,
      ...damageDetails.map((detail) => `& ${formatAttackDamageTarget(detail)}`)
    ].join(" ");
  }

  const [firstDamageDetail, ...restDamageDetails] = damageDetails;
  if (!firstDamageDetail) {
    return displayTitle;
  }

  return [
    `${displayTitle} on ${formatAttackDamageTarget(firstDamageDetail)}`,
    ...restDamageDetails.map((detail) => `& ${formatAttackDamageTarget(detail)}`)
  ].join(" ");
}

function getBossOrdersSwitchDetail(details: string[]) {
  for (const detail of details) {
    const value = stripBattleLogPlayerReferences(cleanLeadingBullet(detail));
    const switchMatch = value.match(/^(.+?)\s+was switched with\s+(.+?)\s+to become the Active Pok[eé]mon$/i);

    if (switchMatch?.[1] && switchMatch[2]) {
      const nextActivePokemon = cleanBattleLogDisplayText(switchMatch[1]);
      const previousActivePokemon = cleanBattleLogDisplayText(switchMatch[2]);
      return `Active ${previousActivePokemon} was switched with Benched ${nextActivePokemon}`;
    }
  }

  return "";
}

function isBossOrdersSwitchDetail(detail: string) {
  const value = stripBattleLogPlayerReferences(cleanLeadingBullet(detail));
  return (
    /^.+?\s+was switched with\s+.+?\s+to become the Active Pok[eé]mon$/i.test(value) ||
    /^.+?\s+is now in the Active spot$/i.test(value)
  );
}

function isKnockoutDiscardDetail(detail: string) {
  const value = cleanBattleLogDisplayText(cleanLeadingBullet(detail));
  return (
    /^.+?\s+was discarded from\s+.+$/i.test(value) ||
    /^\d+\s+cards?\s+were discarded from\s+.+$/i.test(value)
  );
}

function isKnockoutDiscardCardListDetail(detail: string) {
  const value = cleanBattleLogDisplayText(cleanLeadingBullet(detail));
  return (
    value.includes(",") &&
    !/[.!?]$/.test(value) &&
    !/\b(?:drew|draw|shuffled|discarded|moved|switched|played|attached|evolved|retreated|took|put|damage|deck|hand|active|bench)\b/i.test(value)
  );
}

function getDiscardRecoveryDetail(details: string[]) {
  for (const detail of details) {
    const value = stripBattleLogPlayerReferences(cleanLeadingBullet(detail));
    const movedMatch = value.match(/^(?:[\p{L}\p{N}_.-]+\s+)?moved\s+(.+?)\s+to\s+(?:their|the)\s+hand$/iu);

    if (movedMatch?.[1]) {
      return `moved ${cleanBattleLogDisplayText(movedMatch[1])} from discard to hand`;
    }
  }

  return "";
}

function isDiscardRecoveryDetail(detail: string) {
  const value = stripBattleLogPlayerReferences(cleanLeadingBullet(detail));
  return /^(?:[\p{L}\p{N}_.-]+\s+)?moved\s+.+?\s+to\s+(?:their|the)\s+hand$/iu.test(value);
}

export function getBattleLogDisplayActionTitle(title: string, details: string[] = []) {
  const promotedAbilityTitle = getPromotedAbilityActivationTitle(details);

  if (promotedAbilityTitle) {
    return promotedAbilityTitle;
  }

  if (isDudunsparceRunAwayDrawShape(title, details)) {
    return "Dudunsparce's Run Away Draw was activated.";
  }

  const retreatPromotionDetail = /\bretreated\b/i.test(title) ? getRetreatPromotionDetail(details) : "";
  if (retreatPromotionDetail) {
    return `${cleanBattleLogDisplayText(title)} -> ${retreatPromotionDetail}`;
  }

  if (shouldPromoteAttackDamageDetails(title, details)) {
    return getPromotedAttackDamageTitle(title, details);
  }

  const bossOrdersSwitchDetail = /\bBoss's Orders\b/i.test(title) ? getBossOrdersSwitchDetail(details) : "";
  if (bossOrdersSwitchDetail) {
    return `${cleanBattleLogDisplayText(title)} - ${bossOrdersSwitchDetail}`;
  }

  const discardRecoveryDetail = /\bplayed\b/i.test(title) ? getDiscardRecoveryDetail(details) : "";
  if (discardRecoveryDetail) {
    return `${cleanBattleLogDisplayText(title)} & ${discardRecoveryDetail}`;
  }

  return title;
}

export function getBattleLogDisplayActionDetails(title: string, details: string[] = []) {
  const displayTitle = getBattleLogDisplayActionTitle(title, details);
  const normalizedDisplayTitle = cleanBattleLogDisplayText(displayTitle);
  const isKnockoutAction = classifyBattleLogActionTitle(displayTitle) === "ko";
  let skipNextKnockoutDiscardCardList = false;

  return details.filter((detail) => {
    if (skipNextKnockoutDiscardCardList && isKnockoutDiscardCardListDetail(detail)) {
      skipNextKnockoutDiscardCardList = false;
      return false;
    }

    skipNextKnockoutDiscardCardList = false;

    if (cleanBattleLogDisplayText(cleanLeadingBullet(detail)) === normalizedDisplayTitle) {
      return false;
    }

    if (/\bretreated\b/i.test(displayTitle) && isRetreatPromotionDetail(detail)) {
      return false;
    }

    if (shouldPromoteAttackDamageDetails(title, details) && getAttackDamageDetail(detail) !== null) {
      return false;
    }

    if (/\bBoss's Orders\b/i.test(displayTitle) && isBossOrdersSwitchDetail(detail)) {
      return false;
    }

    if (/\bplayed\b/i.test(displayTitle) && isDiscardRecoveryDetail(detail)) {
      return false;
    }

    if (isKnockoutAction && isKnockoutDiscardDetail(detail)) {
      skipNextKnockoutDiscardCardList = true;
      return false;
    }

    return true;
  });
}

export function formatBattleLogActionTitle(
  title: string,
  options: { actionTag?: BattleLogActionTag; retainActor?: boolean } = {}
) {
  const displayTitle = cleanBattleLogDisplayText(title);
  const actionTag = options.actionTag ?? classifyBattleLogActionTitle(title);
  const retainActor = options.retainActor ?? false;

  if (!displayTitle) {
    return "";
  }

  const drewAndPlayedMatch = displayTitle.match(/^(.+?)\s+drew\s+(.+?)\s+and\s+played\s+it\s+to\s+(?:the\s+)?Bench$/i);
  if (drewAndPlayedMatch?.[2]) {
    return withOptionalActorPrefix(
      drewAndPlayedMatch[1],
      `${cleanBattleLogDisplayText(drewAndPlayedMatch[2])} played to Bench`,
      retainActor
    );
  }

  const playedToSpotMatch = displayTitle.match(/^(.+?)\s+played\s+(.+?)\s+to\s+(?:the\s+)?(Active spot|Bench)$/i);
  if (playedToSpotMatch?.[2] && playedToSpotMatch[3]) {
    const target = cleanBattleLogDisplayText(playedToSpotMatch[3]);
    const actionText =
      target === "Bench"
        ? `${cleanBattleLogDisplayText(playedToSpotMatch[2])} played to Bench`
        : `${cleanBattleLogDisplayText(playedToSpotMatch[2])} played to ${target}`;

    return withOptionalActorPrefix(
      playedToSpotMatch[1],
      actionText,
      retainActor
    );
  }

  const attachedMatch = displayTitle.match(/^(.+?)\s+attached\s+(.+?)\s+to\s+(.+)$/i);
  if (attachedMatch?.[2] && attachedMatch[3]) {
    return withOptionalActorPrefix(
      attachedMatch[1],
      `${cleanBattleLogDisplayText(attachedMatch[2])} attached to ${cleanAttachmentTarget(attachedMatch[3])}`,
      retainActor,
      { cleanValue: false }
    );
  }

  const evolvedMatch = displayTitle.match(/^(.+?)\s+evolved\s+(.+?)\s+to\s+(.+)$/i);
  if (evolvedMatch?.[2] && evolvedMatch[3]) {
    return withOptionalActorPrefix(
      evolvedMatch[1],
      `${cleanBattleLogDisplayText(evolvedMatch[2])} evolved into ${cleanBoardPositionText(evolvedMatch[3])}`,
      retainActor,
      { cleanValue: false }
    );
  }

  const activatedMatch = displayTitle.match(/^(.+?)'s\s+(.+?)\s+was activated$/i);
  if (activatedMatch?.[1] && activatedMatch[2]) {
    return `${cleanBattleLogDisplayText(activatedMatch[1])} used ${cleanBattleLogDisplayText(activatedMatch[2])}`;
  }

  const abilityMatch = displayTitle.match(/^(.+?)\s+used\s+([\s\S]+)$/i);
  if (actionTag === "ability" && abilityMatch?.[1] && abilityMatch[2]) {
    return `${stripBattleLogPlayerPossessives(abilityMatch[1])} used ${cleanBattleLogDisplayText(abilityMatch[2])}`;
  }

  if (actionTag === "attack" && abilityMatch?.[1] && abilityMatch[2]) {
    const attackingPokemon = stripBattleLogPlayerReferences(abilityMatch[1]);
    return `${attackingPokemon} used ${stripBattleLogPlayerReferences(abilityMatch[2])}`;
  }

  const drewMatch = displayTitle.match(/^(.+?)\s+drew\s+(.+)$/i);
  if (drewMatch?.[2]) {
    const drawnCards = cleanBattleLogDisplayText(drewMatch[2]);
    if (/^a card$/i.test(drawnCards)) {
      return withOptionalActorPrefix(drewMatch[1], "Drew a card", retainActor);
    }

    return withOptionalActorPrefix(
      drewMatch[1],
      `Drew ${drawnCards}`,
      retainActor
    );
  }

  const playedMatch = displayTitle.match(/^(.+?)\s+played\s+(.+)$/i);
  if (playedMatch?.[2]) {
    return withOptionalActorPrefix(
      playedMatch[1],
      `Played ${cleanBattleLogDisplayText(playedMatch[2])}`,
      retainActor
    );
  }

  const retreatedPokemonMatch = displayTitle.match(/^(.+?)\s+retreated\s+(.+?)\s+to\s+(.+)$/i);
  if (retreatedPokemonMatch?.[2] && retreatedPokemonMatch[3]) {
    return withOptionalActorPrefix(
      retreatedPokemonMatch[1],
      `${cleanBattleLogDisplayText(retreatedPokemonMatch[2])} retreated to ${cleanBattleLogDisplayText(retreatedPokemonMatch[3])}`,
      retainActor
    );
  }

  const retreatedMatch = displayTitle.match(/^(.+?)\s+retreated\s+to\s+(.+)$/i);
  if (retreatedMatch?.[2]) {
    return withOptionalActorPrefix(
      retreatedMatch[1],
      `Retreated to ${cleanBattleLogDisplayText(retreatedMatch[2])}`,
      retainActor
    );
  }

  const endedTurnMatch = displayTitle.match(/^(.+?)\s+ended\s+their\s+turn$/i);
  if (endedTurnMatch?.[1]) {
    return retainActor ? `${cleanBattleLogDisplayText(endedTurnMatch[1])}: ended turn` : "Ended turn";
  }

  return displayTitle;
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
    patterns: [/\bability\b/, /\babilities\b/, /\bwas activated\b/, /\bused\b(?!.*\bfor \d+\+? damage\b)/]
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
