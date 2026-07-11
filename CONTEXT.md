# Poke Notes

Poke Notes is a competitive Pokemon TCG workspace. This context fixes the language used for battle evidence, deck planning, and tournament records so data and architecture work describe the same product concepts.

## Language

**Battle Log**:
A saved record of one Pokemon TCG Live game, including the parsed sequence of play and its outcome.
_Avoid_: Match log, game file

**Deck Strategy**:
A player's working plan for one deck archetype, including its lists, matchup plans, notes, and linked battle evidence.
_Avoid_: Deck record, deck profile

**Deck List**:
A dated card list saved within a Deck Strategy, with its raw imported text and derived card ordering.
_Avoid_: List version, deck version

**Matchup Plan**:
Strategy notes for playing a Deck Strategy into a specific opposing deck.
_Avoid_: Matchup record, matchup note

**Tournament**:
A competitive event record containing rounds, result metadata, and an optional link to the Deck Strategy and Deck List used.
_Avoid_: Event, tournament run

**Deck Aggregate**:
One Deck Strategy together with its ordered Deck Lists and Matchup Plans. It is owned by one user and should be saved as one consistent product concept even while its storage is transitional.
_Avoid_: Deck bundle, deck graph

**Legacy Deck Copy**:
The Deck Lists and Matchup Plans embedded as JSON inside the `decks` row. It remains a compatibility source until every valid record is represented relationally and remaining readers have moved.
_Avoid_: Old deck data, fallback blob

**Relational Deck Records**:
The Deck Lists and Matchup Plans stored in the `deck_lists` and `deck_matchups` tables. These are the intended long-term source after parity and read-path evidence are complete.
_Avoid_: New deck data, normalized copy

**Deck Compatibility Period**:
The temporary interval in which Legacy Deck Copies and Relational Deck Records coexist. ADR 0001 defines the technical exit checks; the observation duration and final removal date are not yet decided. No valid Deck List or Matchup Plan may disappear during it.
_Avoid_: Migration grace period, dual-write window

## Invariants

- A Deck Aggregate and every relational child belong to one account. The database rejects a child or linked deck whose owner differs from its parent.
- During compatibility, a legacy child is identified by account, Deck Strategy, and child ID together. Historical child IDs are not globally unique across accounts.
- Relational data may replace a legacy record only when both refer to the same child inside the same Deck Aggregate. A partial migration must preserve every otherwise valid legacy record.
- No compatibility record is deleted, globally deduplicated, or re-keyed without a reviewed data plan and explicit product approval.
