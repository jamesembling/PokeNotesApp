# Poke Notes Domain

Use these terms in product copy, issues, proposals, tests, and architecture work.

## Language

**Battle Log**
A saved record of one Pokemon TCG Live game, including the parsed sequence of play and its outcome.

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

## Invariants

- A Deck List belongs to one account and may be associated with zero or one Deck Strategy.
- A Tournament may reference zero or one Deck List independently of its optional Deck Strategy reference. One Deck List may be referenced by multiple Tournaments.
- Deleting a Tournament or Deck Strategy removes its Deck List relationships but does not delete the account-owned Deck List. Deleting a Tournament removes its owned rounds and snapshot.
- A Tournament displays its Tournament Deck List Snapshot as event evidence. Source edits never update that snapshot; replacing or removing it is an explicit Tournament action.
- A Deck Aggregate and each associated record belong to one account.
- A Deck List's visual order is a product contract shared by saved lists, Battle Logs, Tournaments, and shared views.
- Storage transitions preserve every valid account-owned record. The active Deck Aggregate transition and its exit checks are defined in ADR 0001; the first-class Deck List and Tournament snapshot decision is defined in ADR 0002.
