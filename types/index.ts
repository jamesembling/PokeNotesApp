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

// A player within a battle log
export type LogPlayer = {
  name: string                    // PTCGL username
  result: Result
  deckName: string                // e.g. "Dragapult / Dusknoir"
  deckSlug: string                // e.g. "dragapult"
  deckSprites: string[]           // e.g. ["dragapult", "dusknoir"] — always string[], never comma string
}

// Stats for a single player derived at import time
export type LogPlayerStats = {
  name: string
  attackDamage: number
  prizesTaken: number
  mulligans: number
}

// Game-level stats derived at import time
export type LogStats = {
  totalTurns: number
  coinTossWinner: string          // Player name or empty string
  players: LogPlayerStats[]
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
  dateFrom: string
  dateTo: string
  linkedDeckId: string | undefined
  linkedDeckListId: string | undefined
  deckName: string
  deckSprites: string[]
  category: TournamentCategory
  placement: TournamentPlacement
  format: string
  notes: string
  createdAt: string
  updatedAt: string
}

export type TournamentSummary = Tournament & {
  rounds: TournamentRound[]
}


// ============================================================
// LOG SHARE
// ============================================================

// The full payload stored in the log_shares table
// A snapshot taken at share time — immutable after creation
export type LogSharePayload = {
  log: BattleLog
  deckList: DeckList | undefined   // Resolved deck list if the log was linked to one
}

// The log share record as read from the DB
export type LogShare = {
  id: string                       // Cryptographically random token, 32+ chars
  ownerUserId: string
  payload: LogSharePayload
  createdAt: string
  updatedAt: string
}


// ============================================================
// CATALOG
// ============================================================

// A single Pokemon entry from the pokemon_catalog table
export type PokemonCatalogEntry = {
  slug: string                     // e.g. "dragapult"
  label: string                    // e.g. "Dragapult"
  nationalDex: number | undefined
  stage: PokemonStage
  evolvesFrom: string | undefined  // Slug of pre-evolution
  spriteUrl: string

  // Localised names for non-English log identification
  nameDe: string | undefined
  nameEs: string | undefined
  nameFr: string | undefined
  nameIt: string | undefined
  namePtBr: string | undefined

  lastSyncedAt: string
}

export type PokemonOption = {
  slug: string
  label: string
  spriteUrl?: string
}

// A single archetype entry from the archetype_catalog table
export type ArchetypeCatalogEntry = {
  id: string                       // e.g. "dragapult-ex"
  label: string                    // e.g. "Dragapult ex"
  sprites: string[]                // e.g. ["dragapult", "dusknoir"]
  detectionSprites: string[]       // e.g. ["dragapult", "dusknoir", "drakloak", "dreepy"]
  requiredMatchGroups: string[][]  // e.g. [["charizard", "charmeleon"], ["pidgeot", "pidgeotto"]]
  isExcluded: boolean
  lastSyncedAt: string
}


// ============================================================
// STATS
// ============================================================

// Overall stats for the stats page — computed by SQL, not JS
export type OverallStats = {
  total: number
  wins: number
  losses: number
  winRate: number                  // Percentage 0-100
  coinFlipWins: number
  coinFlipTotal: number
  averageTurns: number
  selfAttackDamageTotal: number
  opponentAttackDamageTotal: number
}

// Win rate broken down by format
export type FormatStats = {
  format: string
  total: number
  wins: number
  losses: number
  winRate: number
}

// All stats combined for the stats page
export type StatsPageData = {
  overall: OverallStats
  byFormat: FormatStats[]
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


// ============================================================
// PAGINATION
// ============================================================

// Used for paginated log list queries
export type LogPage = {
  logs: BattleLogSummary[]
  total: number
  hasMore: boolean
  nextCursor: string | undefined   // The date cursor for the next page
}


// ============================================================
// PARSER
// ============================================================

// The result of parsing a raw PTCGL log
// Returned by lib/battle-log/parser.ts
export type ParsedLog = {
  language: Language
  players: LogPlayer[]
  sections: LogSection[]
  winner: string                   // Player name
  stats: LogStats
  rawLog: string
}

// The result of archetype identification
// Returned by lib/battle-log/archetype.ts
export type ArchetypeMatch = {
  archetypeId: string
  label: string
  sprites: string[]
  score: number                    // Confidence score — higher is more confident
} | null


// ============================================================
// FORM STATES
// ============================================================

// Used by the log import form
export type LogImportDraft = {
  rawLog: string
  error: string | undefined
  isParsing: boolean
  parsed: ParsedLog | undefined
}

// Used by the deck form
export type DeckDraft = {
  deckName: string
  format: string
  goPreference: GoPreference
  deckPokemon: string[]
  coreStrategy: string
  generalNotes: string
  setupGoals: string[]
  resourcePlan: string
  error: string | undefined
  isSaving: boolean
}
