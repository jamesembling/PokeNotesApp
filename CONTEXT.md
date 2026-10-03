# Poke Notes Domain

Use these terms in product copy, issues, proposals, tests, and architecture work.

## Language

**Battle Log**
A saved record of one Pokemon TCG Live game, including the parsed sequence of play and its outcome.

**Battle Replay**
A read-only visual reconstruction of one saved Battle Log, derived from its recorded actions for its account owner. Battle Replay is a Beta view rather than a separate saved record. Unrecorded state remains unknown; partial and unsupported reconstructions are explicit.

**Battle Log Import Draft**
A server-controlled, unsaved interpretation produced by parsing one complete imported game log once. Its parser-derived facts are immutable; review may change only explicitly permitted fields. It becomes a Battle Log only after a successful save, and abandoning it creates no Battle Log.

**Deck Strategy**
A player's working plan for one deck archetype, including associated Deck Lists, matchups, notes, and linked battle evidence.

**Deck List**
A first-class, account-owned dated card list with raw imported text and derived card ordering. Association with a Deck Strategy is optional.

**Deck Matchup**
A saved matchup for one Deck Strategy against a specific opposing deck, including favorability, setup, technical choices, and matchup notes.

**Tournament**
A competitive event record that owns its rounds and preserved Deck List snapshot. It may independently reference the Deck Strategy and Deck List used.

**Tournament Deck List Snapshot**
The immutable copy of a Deck List preserved by a Tournament as the authoritative list used at that event. It retains the complete list contract even if the linked source Deck List is later edited or deleted.

**Deck Aggregate**
One Deck Strategy together with its associated ordered Deck Lists and Deck Matchups.

**Player Profile**
An account owner's member showcase with a trainer name separate from account and PTCGL names, a shared profile picture, an optional favourite Pokémon, and up to three ordered favourite card printings. Profiles are discoverable by other authenticated members, except across a block; aggregate Battle Log records are shared only with accepted friends. The owner edits this showcase in Profile.

**Friendship**
A mutual connection between two accounts established when the recipient accepts a friend request. Pending incoming and outgoing requests are distinct from accepted friendships. Either friend may remove the connection; a player may block another player to remove the connection and prevent mutual discovery and profile access.

## Invariants

- Battle Replay reads only the current account owner's saved Battle Log. It never edits the Battle Log, creates a replay record, or grants replay access through shared-log or Player Profile views. It reconstructs recorded actions without inventing hidden cards, HP, counts, or unsupported mutations; available artwork may be a representative printing rather than evidence of the exact card used.
- A Deck List belongs to one account and may be associated with zero or one Deck Strategy.
- A Tournament may reference zero or one Deck List independently of its optional Deck Strategy reference. One Deck List may be referenced by multiple Tournaments.
- Deleting a Tournament or Deck Strategy removes its Deck List relationships but does not delete the account-owned Deck List. Deleting a Tournament removes its owned rounds and snapshot.
- A Tournament displays its Tournament Deck List Snapshot as event evidence. Source edits never update that snapshot; replacing or removing it is an explicit Tournament action.
- A Deck Aggregate and each associated record belong to one account.
- A Deck List's visual order is a product contract shared by saved lists, Battle Logs, Tournaments, and shared views.
- Player Profiles are discoverable without an opt-in or a saved showcase row. There is no hide-profile setting. Identity prefers a saved trainer name, then a trimmed account display name of at least two characters truncated to 40 characters, then a stable `Player <first eight account-ID characters>` fallback. Sending and accepting friend requests do not depend on an enable-profile setting.
- Shared Battle Log totals belong to the owner and are visible only to self or accepted friends through the authenticated profile projection. Games logged includes all saved Battle Logs; win rate uses wins and losses only. Tournament rounds are separate evidence. Individual Battle Logs, Deck Lists, notes, email, personal names, and PTCGL details remain private.
- Last-login sharing with accepted friends is an independent opt-in setting, off by default. The owner can inspect their own last login regardless of that setting.
- Profile pictures use an existing Poké Ball preset or an owner-uploaded still JPEG, PNG, or WebP of at most 2 MiB. Uploads are decoded and validated, stripped of metadata, and converted to a centre-cropped square WebP up to 512 pixels per side. Avatar writes and object management are scoped to the owner; the chosen image is shared as part of their Player Profile.
- Favourite card art identifies distinct set/number printings, with at most three selections. Saved selection order is display order; it does not redefine Deck List card ordering.
- Blocking removes a pending request or accepted friendship and prevents profile access and search visibility in either direction. Unblocking removes the block without restoring the connection.
- Storage transitions preserve every valid account-owned record. The active Deck Aggregate transition and its exit checks are defined in ADR 0001; the first-class Deck List and Tournament snapshot decision is defined in ADR 0002.
