# Poke Notes Domain

Use these terms in product copy, issues, proposals, tests, and architecture work.

## Language

**Battle Log**
A saved record of one Pokemon TCG Live game, including the parsed sequence of play and its outcome.

**Battle Log Import Draft**
A server-controlled, unsaved interpretation produced by parsing one complete imported game log once. Its parser-derived facts are immutable; review may change only explicitly permitted fields. It becomes a Battle Log only after a successful save, and abandoning it creates no Battle Log.

**Deck Strategy**
A player's working plan for one deck archetype, including its lists, matchups, notes, and linked battle evidence.

**Deck List**
A dated card list saved within a Deck Strategy, with its raw imported text and derived card ordering.

**Deck Matchup**
A saved matchup for one Deck Strategy against a specific opposing deck, including favorability, setup, technical choices, and matchup notes.

**Tournament**
A competitive event record containing rounds, result metadata, and an optional link to the Deck Strategy and Deck List used.

**Deck Aggregate**
One Deck Strategy together with its ordered Deck Lists and Deck Matchups.

## Invariants

- A Deck Aggregate and each linked record belong to one account.
- A Deck List's visual order is a product contract shared by saved lists, Battle Logs, Tournaments, and shared views.
- Storage transitions preserve every valid account-owned record. The active Deck Aggregate transition and its exit checks are defined in ADR 0001.
