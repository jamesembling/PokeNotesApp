import type { Language, LogSection, Result } from "@/types/index";

export type ParsedTurnSection = LogSection;

export type ParsedLogPlayers = {
  playerNames: [string, string];
  selfPlayerName: string;
  opponentPlayerName: string;
};

export type ParsedLogStats = {
  winner: string;
  result: Result;
  totalTurns: number;
  coinTossWon: boolean | null;
  goOrder: "First" | "Second" | "";
  selfPrizesTaken: number;
  opponentPrizesTaken: number;
  selfAttackDamage: number;
  opponentAttackDamage: number;
  selfMulligans: number;
  opponentMulligans: number;
  reason: string;
};

export type PlayerPokemonEvidence = {
  lines: string[];
  normalizedText: string;
  mentionCounts: Map<string, number>;
};

export type ParsedLog = {
  language: Language;
  rawLog: string;
  lines: string[];
  players: ParsedLogPlayers;
  sections: ParsedTurnSection[];
  stats: ParsedLogStats;
  pokemonEvidence: {
    self: PlayerPokemonEvidence;
    opponent: PlayerPokemonEvidence;
  };
};

export type PokemonCatalogRow = {
  slug: string;
  label: string;
  evolves_from: string | null;
  sprite_url: string;
  name_de: string | null;
  name_es: string | null;
  name_fr: string | null;
  name_it: string | null;
  name_pt_br: string | null;
};

export type ArchetypeCatalogRow = {
  id: string;
  canonical_id: string | null;
  label: string;
  sprites: unknown;
  detection_sprites: unknown;
  required_match_groups: unknown;
  is_excluded: boolean;
  source: "curated" | "learned";
  user_id: string | null;
  learned_match_count: number;
};

export type CardEffectKind = "ability" | "attack" | "supporter" | "item" | "tool" | "stadium";

export type CardEffectCatalogRow = {
  source_card_id: string;
  card_name: string;
  normalized_card_name: string;
  supertype: string;
  subtypes: unknown;
  effect_kind: CardEffectKind;
  effect_name: string | null;
  normalized_effect_name: string;
  effect_text: string | null;
  last_synced_at: string;
};

export type PokemonCatalogIndex = {
  bySlug: Map<string, PokemonCatalogRow>;
  normalizedNameToSlug: Map<string, string>;
  slugToAncestors: Map<string, string[]>;
  slugToFamilyRoot: Map<string, string>;
  maxNameTokens: number;
};

export type ArchetypeCatalogIndex = {
  byId: Map<
    string,
    {
      id: string;
      canonicalId?: string;
      label: string;
      sprites: string[];
      detectionSprites: string[];
      requiredMatchGroups: string[][];
    }
  >;
  normalizedLabelToIds: Map<string, string[]>;
  spriteToCandidateArchetypes: Map<string, string[]>;
  familyRootToCandidateArchetypes: Map<string, string[]>;
};

export type IdentificationCatalog = {
  pokemon: PokemonCatalogIndex;
  archetypes: ArchetypeCatalogIndex;
};

export type ArchetypeIdentification = {
  archetypeId: string;
  label: string;
  sprites: string[];
  confidence: number;
} | null;

export type DeckSpriteSelection = {
  slugs: string[];
  confidence: number;
  selectionSource: "archetype" | "fallback";
};

export type ImportLogValidationErrorCode =
  | "EMPTY_INPUT"
  | "UNKNOWN_LOG"
  | "MISSING_PTCGL_USERNAME"
  | "UNRESOLVED_SELF_PLAYER";

export class ImportLogValidationError extends Error {
  code: ImportLogValidationErrorCode;

  constructor(code: ImportLogValidationErrorCode, message: string) {
    super(message);
    this.name = "ImportLogValidationError";
    this.code = code;
  }
}
