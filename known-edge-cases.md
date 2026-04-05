# Known Edge Cases

This document captures every known quirk, patch, and workaround in the current
Poke Notes codebase. It exists so the rebuild does not re-introduce bugs that were
already discovered and fixed.

For each entry: what was broken, what the symptom was, and what the fix must be
in the new system. Where the reason is inferred from the code rather than known
for certain, it is marked **[inferred]**.

---

## Section 1: Archetype Identification

### 1.1 toedscruel-ex excluded from matching

**Location:** `sprites.js` — `INVALID_ARCHETYPE_IDS`

**What was broken:** The archetype catalog from Limitless contains an entry with
ID `toedscruel-ex` whose sprites are `["toedscruel", "ogerpon"]`. Because Toedscruel
and Ogerpon are both common support Pokemon that appear in many different decks,
this archetype entry was causing false positive matches — logs that had nothing to
do with a Toedscruel deck were being identified as one.

**Fix in rebuild:** The `archetype_catalog` table has an `is_excluded` boolean
column. Set `is_excluded = true` for the `toedscruel-ex` entry when seeding. The
identification system skips all excluded archetypes entirely.

**Note:** This pattern may apply to other archetypes that use common support Pokemon
as their sprite identifiers. When seeding the catalog, review any archetype whose
sprites are Pokemon that appear frequently as non-featured cards (e.g. Fezandipiti,
Pidgeot, Budew) and consider whether they will cause false positives.

---

### 1.2 Dipplin / Hydrapple naming mismatch

**Location:** `sprites.js` — `ALIASES` array

**What was broken:** Limitless catalogues this archetype under the ID `dipplin`
and the sprite slug `dipplin`. However, PTCGL logs frequently reference `Hydrapple`
as the active Pokemon because Hydrapple is the evolved form that actually attacks.
The automatic lookup failed to connect `Hydrapple` back to the `dipplin` archetype.

**Fix in rebuild:** The `pokemon_catalog` table stores evolution chains via the
`evolves_from` column. Hydrapple evolves from Dipplin, which evolves from Applin.
The identification system must walk the evolution chain — if Hydrapple appears in
a log, it should count as evidence of the Dipplin archetype. This is not a special
case; it is the general solution for all evolution lines (see 1.4).

**Additional alias:** `applin` was also added as an alias term for `dipplin`,
suggesting Applin logs were also not matching. The evolution chain approach covers
this automatically.

---

### 1.3 Multi-word and hyphenated Pokemon name slugs

**Location:** `sprites.js` — `ALIASES` array

**What was broken:** Several Pokemon have names that don't translate cleanly to
slugs or that PTCGL logs write differently from how Limitless catalogues them.
The following were patched with hardcoded regex aliases:

| Pokemon | Issue |
|---|---|
| Bloodmoon Ursaluna | Logs write "Bloodmoon Ursaluna", slug is `ursaluna-bloodmoon` |
| Origin Forme Dialga | Logs write "Origin Forme Dialga" or "Dialga Origin", slug is `dialga-origin` |
| Origin Forme Palkia | Same pattern as Dialga, slug is `palkia-origin` |
| Hisuian Zoroark | Logs write "Hisuian Zoroark", slug is `zoroark-hisui` |
| Chien-Pao | Hyphen causes slug matching failures |
| Raging Bolt | Space in name causes slug matching failures |
| Roaring Moon | Space in name causes slug matching failures |
| Iron Thorns | Space in name causes slug matching failures |
| Iron Hands | Space in name causes slug matching failures |
| Iron Valiant | Space in name causes slug matching failures |
| Great Tusk | Space in name causes slug matching failures |
| Flutter Mane | Space in name causes slug matching failures |
| Walking Wake | Space in name causes slug matching failures |

**Fix in rebuild:** The `pokemon_catalog` table stores the canonical label as it
appears in PTCGL logs alongside the slug. The identification system normalises
both before comparing — removing hyphens, lowercasing, collapsing spaces. The
"origin forme" / "hisuian" prefix/suffix variations should be handled by storing
alternate name forms in the catalog or by a normalisation step that maps common
prefixes to their slug equivalents.

---

### 1.4 Pre-evolution terms not matching archetypes

**Location:** `battle-log.js` — `SPRITE_ALIAS_TERMS`

**What was broken:** PTCGL logs show cards being played throughout the game,
including Basic and Stage 1 Pokemon before they evolve. Without knowing that
Dreepy and Drakloak are pre-evolutions of Dragapult, the identifier would see
a log full of Dreepy plays and not recognise it as a Dragapult deck.

The following evolution lines were patched with hardcoded pre-evolution terms:

| Final evolution | Pre-evolutions added as evidence |
|---|---|
| alakazam | abra, kadabra |
| banette | shuppet |
| blissey | chansey |
| charizard | charmander, charmeleon |
| chien-pao | frigibax, baxcalibur |
| dipplin | applin |
| dragapult | dreepy, drakloak |
| dudunsparce | dunsparce |
| farigiraf | girafarig |
| froslass | snorunt |
| galvantula | joltik |
| gardevoir | ralts, kirlia |
| gholdengo | gimmighoul |
| grimmsnarl | impidimp, morgrem |
| lucario-mega | riolu |
| spidops | tarountula |
| toedscruel | toedscool |
| typhlosion | cyndaquil, quilava |
| venomoth | venonat |
| zoroark | zorua, n's zorua |

**Fix in rebuild:** This is the most important edge case to solve structurally.
The `pokemon_catalog` table stores `evolves_from` for every Pokemon. The
identification system must use this chain — for any archetype sprite, look up
its full pre-evolution chain and treat appearances of any pre-evolution as weak
evidence for that archetype. This eliminates the need for any hardcoded list and
automatically handles new evolution lines as they are added to the game.

**Important:** `n's zorua` is a named variant — not just `zorua`. PTCGL logs can
contain Pokemon with trainer name prefixes (N's Zorua, Cynthia's Gabite, etc).
The identification system must handle the `[Trainer]'s [Pokemon]` pattern and
extract just the Pokemon name for matching purposes.

---

### 1.5 Trainer-prefixed Pokemon names

**Location:** `battle-log.js` — `SPRITE_ALIAS_TERMS` (`zoroark: ["zorua", "n's zorua"]`)

**What was broken:** Some Pokemon cards are printed with a trainer name prefix —
"N's Zorua", "Cynthia's Gabite", "N's Darmanitan". PTCGL logs write these with
the full prefix. The identifier did not strip the prefix before matching, so
"N's Zorua" did not match the `zorua` catalog entry.

**Fix in rebuild:** The log parser and identifier must normalise Pokemon names by
stripping known trainer prefixes before matching. The pattern is `[Name]'s [Pokemon]`.
Extract the Pokemon name part and use that for catalog lookup. Trainer prefix stripping
should happen at parse time, not at identification time.

---

### 1.6 Mega Evolution naming in deck names and logs

**Location:** `sprites.js` — `ALIASES`, `getLookupKeys`, `spritesForDeckName`

**What was broken:** Mega Evolution Pokemon have two naming conventions that can
appear in both deck names and logs:
- Prefix form: "Mega Charizard", "Mega Kangaskhan"
- Suffix form: "Charizard Mega", "Kangaskhan-Mega"
- With X/Y variants: "Mega Charizard X", "Mega Charizard Y"

The slug system expected `charizard-mega` or `charizard-mega-x` but logs and
user deck names might write any of the above forms.

**Fix in rebuild:** When normalising a Pokemon name for catalog lookup, try all
known Mega variation forms. If the catalog contains `charizard-mega-x`, looking
up "Mega Charizard X" or "Charizard Mega X" should resolve to it.

---

### 1.7 Non-English log identification — limited language coverage

**Location:** `battle-log.js` — `POKEMON_STRINGS`

**What was broken:** The identifier only has translated names for 6 Pokemon across
6 languages. Every other Pokemon in non-English logs is matched by its English name,
which often works because PTCGL uses English names in many regions — but fails for
Pokemon with genuinely different localised names.

**Confirmed translated names that differ from English:**

| Pokemon | German | French | Notes |
|---|---|---|---|
| Charizard | Glurak | Dracaufeu | Different in DE and FR |
| Snorlax | Relaxo | Ronflex | Different in DE and FR |
| Dragapult | Katapuldra | Lanssorien | Different in DE and FR |
| Chien-Pao | Baojian | Baojian | Same in DE and FR |
| Raging Bolt | Furienblitz | Ire-Foudre | Different in all |
| Origin Forme Dialga | Ur-Dialga | Dialga Forme Originelle | Structural difference |
| Origin Forme Palkia | Ur-Palkia | Palkia Forme Originelle | Structural difference |

**Fix in rebuild:** The `pokemon_catalog` table has columns for `name_de`, `name_es`,
`name_fr`, `name_it`, `name_pt_br`. Populate these from PokéAPI's localisation data.
The identifier receives the detected log language and looks up names in the appropriate
column. No hardcoded translation lists needed.

---

## Section 2: Log Parsing

### 2.1 Language detection

**Location:** `battle-log.js` — `detectLanguage`

**What was broken:** Language is detected by looking for the Setup section header
word in the raw log. The supported languages and their markers are:

| Language | Marker word |
|---|---|
| English | "Setup" |
| German | "Vorbereitung" |
| Spanish | "Preparación" |
| French | "Préparation" |
| Italian | "Allestimento" |
| Portuguese (BR) | "Preparação" |

If none of these markers is found, language detection returns `null` and parsing
fails or falls back to English defaults.

**Fix in rebuild:** Same approach is fine. Detect language from the Setup marker.
Default to English if unrecognised. Log a warning in development if detection fails
so unknown languages surface rather than silently failing.

---

### 2.2 Turn boundary detection

**Location:** `battle-log.js` — `isTurnBoundary`, `getPlayerNameFromTurnLine`

**What was broken:** PTCGL logs sometimes prepend turn headers with `Turn #N - `
before the player name (e.g. `Turn #3 - JammerUK1993's Turn`). The parser must
strip this prefix before attempting to match the turn boundary pattern.

Also: the placeholder `[playerName]'s Turn` appears in logs before the actual
player names are resolved. Lines containing `[playername]` must be skipped during
player name extraction.

**Fix in rebuild:** Both of these are handled correctly in the current parser.
Port the turn boundary detection logic exactly, including the `Turn #N - ` prefix
stripping and the `[playername]` placeholder check.

---

### 2.3 Deck shuffle lines filtered from parser

**Location:** `battle-log.js` — `trimBattleLog`

**What was broken:** Lines containing "shuffled their deck" appear very frequently
in PTCGL logs (after almost every search effect). Including them in the parsed
output produced enormous section bodies with mostly noise. They were filtered out
at the trim step.

**Fix in rebuild:** Filter shuffle lines during log trimming, before parsing into
sections. The raw log is stored in full — only the parsed sections have shuffle
lines removed.

---

### 2.4 Prize card counting across languages

**Location:** `battle-log.js` — `getPrizesTakenFromLine`

**What was broken:** Prize card lines differ significantly across languages. In
English: "took a Prize card" (singular) and "took N Prize cards" (plural). Other
languages have different verb structures and word orders. The parser must handle
each language's pattern independently.

**Fix in rebuild:** Port the per-language prize detection patterns exactly from
the current parser. These are correct and well-tested.

---

### 2.5 Concede detection

**Location:** `battle-log.js`

**What was broken:** A conceded game ends with a line like "You conceded. [Player]
wins." The winner detection must handle this case in addition to normal game-end
lines. [inferred — seen in test log data]

**Fix in rebuild:** Winner determination checks for both normal win lines and concede
lines. A conceded game where the user conceded is still a Loss.

---

## Section 3: Sprite and Display

### 3.1 Sprite URL base path

**Location:** `sprites.js`

**What it is:** All Pokemon sprites are served from Limitless at:
`https://r2.limitlesstcg.net/pokemon/gen9/[slug].png`

This URL structure is specific to the Scarlet & Violet era (Gen 9 sprites). If
Limitless changes this path structure for future sets, sprites will break silently.

**Fix in rebuild:** Store sprite URLs in the `pokemon_catalog` table rather than
constructing them dynamically from a hardcoded base URL. The catalog sync script
fetches the actual URLs from Limitless and stores them. If the URL structure changes,
only the sync script needs updating.

---

### 3.2 Broken sprite image handling

**Location:** `sprites.js`, various render functions

**What was broken:** If a sprite URL returns a 404, the broken image icon would
display. An `onerror` handler was added to remove the img element silently rather
than show a broken image.

**Fix in rebuild:** All `<img>` elements displaying Pokemon sprites must have an
`onError` handler that removes the element or substitutes a placeholder. Never
show broken image icons.

---

### 3.3 Deck name splitting for sprite resolution

**Location:** `sprites.js` — `splitDeckName`

**What was broken:** Deck names like "Dragapult / Dusknoir" or "Charizard & Pidgeot"
need to be split into individual Pokemon names before resolving sprites. The
delimiters used in user deck names include: `/`, `,`, `&`, `+`, `|`, and the
word `with`.

**Fix in rebuild:** When resolving sprites for a deck name, split on all of these
delimiters. Each resulting part is looked up independently in the catalog.

---

## Section 4: Data and Schema

### 4.1 Log self/opponent player identification

**Location:** `src/features/logs/log-derivations.js` — `getLikelySelfPlayer`

**What was broken:** When a log is imported, the app needs to determine which
player is "you" (the user) and which is the opponent. The current approach matches
the user's PTCGL username (stored in their profile as `ptcgl_username`) against
the player names in the log.

If the PTCGL username is not set in the user's profile, self-identification fails
and the log may display from the wrong player's perspective.

**Fix in rebuild:** Require PTCGL username during onboarding before the first log
import is allowed. Store `self_player_name` and `opponent_player_name` as explicit
columns on the log after identification. Never re-derive these from the username
at display time — if the user changes their username later, existing logs should
not break.

---

### 4.2 Log date fallback

**Location:** `src/services/remote-storage.js` — `loadLogsWindow`

**What was broken:** Some logs have a missing or empty `date` field in the payload.
The windowing queries fall back to `created_at` in these cases. This was a data
quality issue from early versions of the parser that didn't always extract the date.

**Fix in rebuild:** The new schema has `date` as a `NOT NULL` column. The parser
must always extract a date. If the log genuinely contains no date information,
default to the import timestamp date (today). Do not allow null dates to enter
the database.

---

### 4.3 Format string normalisation

**Location:** Various

**What was broken:** Format strings like `SVI-ASC` need to be consistent. Early
versions of the app allowed free-text format entry which produced inconsistent
values. The format picker was added later to enforce the standard format.

**Fix in rebuild:** Format is selected from a predefined list, not free text.
The `format` column is validated against the `archetype_catalog` format list.
The format blocks list (currently in `format-blocks.js`) moves to a database
table or is fetched from Limitless at sync time.

---

### 4.4 Payload backward compatibility

**Location:** `data.js` — normalisation functions

**What was broken:** As new fields were added to deck and log payloads over time,
older records didn't have those fields. Normalisation functions were added to
provide defaults for missing fields so old records wouldn't break the UI.

**Fix in rebuild:** The new schema uses explicit columns with `DEFAULT` values.
Old records migrated to the new schema will have correct defaults applied at
migration time. No runtime normalisation of missing fields is needed.

---

## Section 5: Battle Log Archetype Catalog

### 5.1 Catalog staleness

**What was broken:** The archetype catalog (`battle-log-archetypes.js`) is a
generated file that must be manually regenerated by running a build script. If
the script is not run when new sets are released, new archetypes are not
recognised.

**Fix in rebuild:** The catalog is stored in the `archetype_catalog` database
table and refreshed automatically by a daily cron job. No manual step required.

---

### 5.2 "Other" archetype excluded from catalog

**Location:** `scripts/build-battle-log-archetype-catalog.mjs`

**What was broken:** Limitless has an archetype ID of `other` that catches
miscellaneous decks. This was excluded from the catalog during the build script
because it has no meaningful sprites and would cause false positive matches on
any log.

**Fix in rebuild:** When seeding the `archetype_catalog`, exclude any entry with
ID `other` or any entry with no sprites. Set `is_excluded = true` for these.

---

### 5.3 Archetype score ties

**Location:** `battle-log.js` — `determineBestArchetype`

**What was broken:** When two archetypes score equally (e.g. both have one
matching sprite), the identifier picks the first one found rather than having
a meaningful tiebreaker. This could produce inconsistent identification for
decks that share Pokemon (e.g. any deck running Ogerpon).

**Fix in rebuild:** When scores tie, prefer the archetype whose label matches
text in the log over one that only matched via sprites. If still tied, prefer
the archetype with fewer sprites (more specific match). Document the tiebreaker
logic explicitly in code comments.

---

## Section 6: Authentication and Sessions

### 6.1 Session re-authentication bug

**What was broken:** Users were being asked to re-authenticate with Google after
short periods. Root cause: the browser-side Supabase client was not reliably
refreshing the access token when it expired after 1 hour.

**Fix in rebuild:** Use `@supabase/ssr` with cookie-based sessions and Next.js
middleware that refreshes the token on every request server-side. Users stay
signed in for the duration of the refresh token lifetime (30 days). No client-side
session management.

---

## Section 7: Known Data Quality Issues in Existing Records

These are issues with data already in the database that the migration script
must handle.

### 7.1 Logs with missing date

Some early logs have an empty string or null `date` in the payload. Migration
should fall back to `created_at::date` for these records.

### 7.2 Logs with missing player identification

Some early logs may have empty `players` arrays or players with no `deckName`.
Migration should handle these gracefully — write empty strings for deck name
fields rather than failing.

### 7.3 Deck records with legacy field names

Early deck records used different field names (`keyCards`, `sequencingNotes`,
`benchManagement` etc) that were later renamed or restructured. The migration
script must map old field names to new column names where they differ.

### 7.4 N's Zorua variant in saved logs

Some logs contain `N's Zorua` as a player Pokemon. The `zoroark` archetype
pre-evolution alias includes `n's zorua` specifically because of this. When
migrating log data, any pre-evolution identification that references `n's zorua`
should be preserved correctly.

---

## How to Use This Document

When building the archetype identification system (Phase 3), paste the relevant
sections of this document into the Codex brief alongside the task description.

When writing the catalog seeding script, use Section 5 and the `is_excluded`
cases from Section 1.

When writing the migration script, use Section 7.

When building the log parser, use Section 2 in full.

When any identification bug is reported in the new app, check this document first
before adding a new hardcoded patch. If the general system (evolution chains,
catalog lookup, language normalisation) is working correctly, most cases should
not require a patch.
