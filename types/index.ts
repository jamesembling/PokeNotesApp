// Shared application types.
// These types model the app-facing data shape rather than raw database rows.


// ============================================================
// PRIMITIVES
// ============================================================

export type Result = "Win" | "Loss"

export type GoOrder = "First" | "Second" | ""

export type Role = "user" | "admin"

export type AvatarColor =
  | "red"
  | "blue"
  | "yellow"
  | "green"
  | "orange"
  | "pink"
  | "purple"
  | "white"

export type Language = "en" | "de" | "es" | "fr" | "it" | "pt-br"

export type PokemonStage = "Basic" | "Stage 1" | "Stage 2"

export type GoPreference = "First" | "Second" | ""
export type MatchupFavorability =
  | "Heavily Favoured"
  | "Slightly Favoured"
  | "Even"
  | "Slightly Unfavoured"
  | "Heavily Unfavoured"
  | ""


// ============================================================
// USER PROFILE
// ============================================================

export type UserProfile = {
  id: string
  displayName: string
  firstName: string
  lastName: string
  email: string
  ptcglUsername: string           // Required for log self-identification
  ptcglUsernameAliases: string[]  // Alternate identities accepted during log import
  role: Role
  avatarColor: AvatarColor
  authAccountCreatedAt: string | undefined
  lastLoginAt: string | undefined
  lastActiveAt: string | undefined
  loginCount: number
  createdAt: string
  updatedAt: string
}


// ============================================================
// BATTLE LOG
// ============================================================

// A single action within a turn section
// Actions can have sub-details (e.g. cards drawn, damage dealt)
export type LogAction = {
  title: string                   // The action line e.g. "JammerUK1993 played Buddy-Buddy Poffin."
  details: string[]               // Sub-detail lines shown when expanded
}

// A section of the battle log (Setup or a player's turn)
export type LogSection = {
  title: string                   // e.g. "Setup" or "[playerName]'s Turn"
  player: string                  // Player name whose turn it is (empty for Setup)
  actions: LogAction[]
  prizesAfterTurn: Record<string, number>  // e.g. { "JammerUK1993": 6, "Guhkirsten": 4 }
}

// The full battle log — reflects the normalised DB columns
export type BattleLog = {
  id: string
  userId: string

  // Core result data
  date: string                    // YYYY-MM-DD
  result: Result
  format: string                  // e.g. "SVI-ASC"
  goOrder: GoOrder

  // Self player (the importing user's side)
  selfPlayerName: string
  selfDeckName: string
  selfDeckSlug: string
  selfDeckSprites: string[]       // Parsed from DB comma string at query boundary

  // Opponent player
  opponentPlayerName: string
  opponentDeckName: string
  opponentDeckSlug: string
  opponentDeckSprites: string[]   // Parsed from DB comma string at query boundary

  // Game stats — stored at import, never recomputed
  totalTurns: number
  coinTossWon: boolean | null     // null if not determinable from the log
  selfPrizesTaken: number
  opponentPrizesTaken: number
  selfAttackDamage: number
  opponentAttackDamage: number
  selfMulligans: number
  opponentMulligans: number

  // Deck linking — both optional
  linkedDeckId: string | undefined
  linkedDeckListId: string | undefined

  // Private owner-only notes captured during import
  matchNotes: string | null

  // Game end reason
  reason: string                  // e.g. "Concede" or ""

  // Raw and parsed content — write-once at import
  rawLog: string
  sections: LogSection[]

  importedAt: string
  createdAt: string
  updatedAt: string
}

// Summary version used in list views — only the lightweight columns
// needed for the logs index page.
export type BattleLogSummary = {
  id: string
  date: string
  result: Result
  format: string
  goOrder: GoOrder
  selfPlayerName: string
  selfDeckName: string
  selfDeckSprites: string[]
  opponentPlayerName: string
  opponentDeckName: string
  opponentDeckSprites: string[]
  totalTurns: number
  linkedDeckId: string | undefined
  linkedDeckListId: string | undefined
  importedAt: string
  linkedDeckListName?: string
}

export type ParsedLogReview = {
  selfPlayerName: string
  opponentPlayerName: string
  selfDeckName: string
  opponentDeckName: string
  selfSprites: string[]
  opponentSprites: string[]
  selfDeckSlug: string
  opponentDeckSlug: string
  date: string
  goOrder: GoOrder
  coinTossWon: boolean | null
  result: Result
  language: Language
  rawLog: string
  sections: LogSection[]
  totalTurns: number
  selfPrizesTaken: number
  opponentPrizesTaken: number
  selfAttackDamage: number
  opponentAttackDamage: number
  selfMulligans: number
  opponentMulligans: number
  reason: string
  suggestedLinkedDeckId?: string
}


// ============================================================
// DECK
// ============================================================

// A single parsed card entry within a deck list
export type DeckCard = {
  count: number
  name: string                    // e.g. "Dragapult ex"
  set: string                     // e.g. "TWM"
  number: string                  // e.g. "130"
  category?: string
  trainerType?: string
  // Resolved at display time from pokemon_catalog
  spriteUrl?: string
  stage?: PokemonStage
}

// A saved deck list (one deck can have multiple lists)
export type DeckList = {
  id: string
  deckId?: string | null
  storage?: "legacy" | "relational"
  name: string                    // User-given name e.g. "Pult/Blaziken"
  format: string
  date: string                    // YYYY-MM-DD
  createdBy: string               // PTCGL username of list author
  notes: string
  rawList: string                 // The raw pasted text — source of truth
  parsedCards: DeckCard[]         // Pre-parsed at save time for fast display
  sortedCards: DeckCard[]         // Pre-sorted once so pages do not re-run ordering work
  sortedCardsVersion?: number
  createdAt: string
  updatedAt: string
}

export type DeckListOption = Pick<DeckList, "id" | "name">

export type DeckListSelectionOption = {
  id: string
  name: string
  deckId: string | null
  deckName: string | null
  /** Storage provenance used to keep exact legacy identity ahead of relational fallback. */
  source?: "legacy" | "relational"
  /** Stable selector identity; includes nullable strategy and list IDs. */
  selectionKey?: string
}

export type DeckMatchup = {
  id: string
  deckName: string
  deckPokemon: string[]
  format: string
  goPreference: GoPreference
  matchupFavor: MatchupFavorability
  idealBench: string
  techsNeeded: string
  matchupPlan: string
  createdAt: string
  updatedAt: string
}

// The full deck — reflects the normalised DB columns
export type Deck = {
  id: string
  userId: string

  // Core identity
  deckName: string
  archetypeId: string
  format: string
  goPreference: GoPreference
  deckPokemon: string[]           // Array of Pokemon slugs for sprite display

  // Strategy content
  coreStrategy: string
  generalNotes: string
  setupGoals: string[]
  resourcePlan: string

  // Nested data — stored as JSONB
  deckLists: DeckList[]
  matchups: DeckMatchup[]

  createdAt: string
  updatedAt: string
}

// Summary version used in list views
export type DeckSummary = {
  id: string
  userId: string
  deckName: string
  archetypeId: string
  format: string
  goPreference: GoPreference
  deckPokemon: string[]
  deckLists: DeckList[]
  createdAt: string
  updatedAt: string
}

export type DeckSelectionOption = {
  id: string
  deckName: string
  deckLists: DeckListOption[]
}

// ============================================================
// TOURNAMENTS
// ============================================================

export type TournamentCategory =
  | "online"
  | "local"
  | "challenge"
  | "cup"
  | "prerelease"
  | "regional"
  | "international"
  | "world"
  | ""

export type TournamentPlacement =
  | "no placement"
  | "dropped"
  | "second"
  | "third"
  | "fourth"
  | "fifth"
  | "sixth"
  | "seventh"
  | "eighth"
  | "t1024"
  | "t512"
  | "t256"
  | "t128"
  | "t64"
  | "t32"
  | "t16"
  | "t8"
  | "t4"
  | "finalist"
  | "champion"
  | ""

export type TournamentParticipation = "player" | "judge"

export type TournamentJudgeRole = "judge" | "head judge" | ""

export type TournamentRoundLegacyResult = "Win" | "Loss" | "Tie"
export type TournamentRoundSpecialResult = "BYE" | "ID" | "NO SHOW"
export type TournamentRoundGameResult = "W" | "L" | "T"
export type TournamentRoundResult =
  | TournamentRoundLegacyResult
  | TournamentRoundSpecialResult
  | `${TournamentRoundGameResult}`
  | `${TournamentRoundGameResult}${TournamentRoundGameResult}`
  | `${TournamentRoundGameResult}${TournamentRoundGameResult}${TournamentRoundGameResult}`

export type TournamentRound = {
  id: string
  tournamentId: string
  userId: string
  roundNumber: number
  opponentDeckName: string
  opponentDeckSprites: string[]
  result: TournamentRoundResult
  notes: string
  createdAt: string
  updatedAt: string
}

export type Tournament = {
  id: string
  userId: string
  name: string
  tournamentIdentifier: string
  location: string
  championshipPoints: number | null
  dateFrom: string
  dateTo: string
  linkedDeckId: string | undefined
  linkedDeckListId: string | undefined
  deckName: string
  deckSprites: string[]
  category: TournamentCategory
  placement: TournamentPlacement
  participation: TournamentParticipation
  judgeRole: TournamentJudgeRole
  format: string
  notes: string
  createdAt: string
  updatedAt: string
}

export type TournamentSummary = Tournament & {
  rounds: TournamentRound[]
}


// ============================================================
// CATALOG
// ============================================================

export type PokemonOption = {
  slug: string
  label: string
  spriteUrl?: string
}

// ============================================================
// ADMIN
// ============================================================

// A user row in the admin users table
export type AdminUser = {
  id: string
  email: string
  displayName: string
  ptcglUsername: string
  role: Role
  accountCreatedAt: string
  lastLoginAt: string | undefined
  lastActiveAt: string | undefined
  lastActivityAt: string | undefined
  loginCount: number
  deckCount: number
  deckListCount: number
  tournamentCount: number
  logCount: number
}

// Catalog health status for admin dashboard
export type CatalogHealth = {
  pokemonCatalogCount: number
  archetypeCatalogCount: number
  pokemonLastSyncedAt: string | undefined
  archetypeLastSyncedAt: string | undefined
  excludedArchetypeCount: number
}
