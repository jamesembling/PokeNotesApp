import type { Language, LogAction, LogSection, Result } from "@/types/index";

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
  label: string;
  sprites: unknown;
  detection_sprites: unknown;
  is_excluded: boolean;
};

export type PokemonCatalogIndex = {
  bySlug: Map<string, PokemonCatalogRow>;
  normalizedNameToSlug: Map<string, string>;
  slugToAncestors: Map<string, string[]>;
  maxNameTokens: number;
};

export type ArchetypeCatalogIndex = {
  byId: Map<
    string,
    { id: string; label: string; sprites: string[]; detectionSprites: string[] }
  >;
  normalizedLabelToIds: Map<string, string[]>;
  spriteToCandidateArchetypes: Map<string, string[]>;
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
};

export type ImportLogRecord = {
  id: string;
  date: string;
  result: Result;
  format: string;
  go_order: "First" | "Second" | "";
  self_player_name: string;
  self_deck_name: string;
  self_deck_slug: string;
  self_deck_sprites: string;
  opponent_player_name: string;
  opponent_deck_name: string;
  opponent_deck_slug: string;
  opponent_deck_sprites: string;
  total_turns: number;
  coin_toss_won: boolean | null;
  self_prizes_taken: number;
  opponent_prizes_taken: number;
  self_attack_damage: number;
  opponent_attack_damage: number;
  self_mulligans: number;
  opponent_mulligans: number;
  linked_deck_id: string | null;
  linked_deck_list_id: string | null;
  reason: string;
  raw_log: string;
  sections: ParsedTurnSection[];
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

export type TurnAction = LogAction;
