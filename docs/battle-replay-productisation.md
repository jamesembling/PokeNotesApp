# Battle replay productisation

## Purpose

The battle replay prototype proves that a saved Pokemon TCG Live battle log can be turned into a useful visual replay. It does not yet prove that the current data implementation can replay arbitrary logs. This note records the productisation direction before further implementation.

## Current assessment

The visual board, timeline controls, transaction overlays, card previews, discard inspection, damage counters, attached cards, and responsive presentation are reusable.

The replay data layer is currently specific to one saved battle. `lib/battle-replay/prototype.ts` contains a hard-coded source log and opening state, manually selected card prints, position-specific transaction overlays, position-specific board mutations, and ability outcomes keyed to action indexes. Those mappings were appropriate for validating the experience, but they must not become the production replay engine.

The prototype now preserves this selected Battle Log as its exact parsed `LogSection[]` fixture and flattens all 119 action titles and detail rows through the same generic source adapter a production compiler can accept. Damage-counter placement amounts and target names are parsed from those detail rows, so the timeline, overlay, and board mutation share one source fact. Stable-instance hints remain only where the PTCGL text names one of several identical Pokemon without identifying the physical copy. The rest of the board reducer and several overlay types are still legacy, position-indexed prototype code; this improvement does not make arbitrary-log replay production-ready.

## Product promise

Replay every evidenced event from any supported Pokemon TCG Live log without fabricating hidden or missing state.

A replay may be partial when its source log is incomplete. Unresolved actions must remain visible in the timeline with an unchanged board state and an explicit uncertainty marker. Card text or known card behaviour must not be used to invent outcomes that the log did not record.

## Proposed architecture

```text
Saved Battle Log
      |
      v
Replay compiler ----- Card-reference catalogue
      |                        |
      v                        v
Typed, evidenced replay program
      |
      v
Pure board-state reducer
      |
      v
Reusable battle replay UI
```

### Replay compiler

The compiler consumes the stored battle-log sections, including every action title and detail line, and emits typed facts such as:

- card played, drawn, searched, discarded, returned, or shuffled;
- Pokemon placed, benched, promoted, retreated, switched, or evolved;
- Energy or Tool attached or discarded;
- damage applied, healed, or moved;
- knockout and Prize movement;
- known and hidden hand/deck count changes;
- an unresolved source action with no safe state mutation.

The compiler must use generic log grammar. It must not branch on a particular card name, battle-log ID, or action position.

### Board-state reducer

The reducer applies typed facts to an immutable replay state and returns deterministic frames. Pokemon receive stable instance identities when they enter play so duplicate names can be tracked without name-based guessing. The reducer, rather than the UI, owns all zone, attachment, damage, evolution-stack, Prize, hand, deck, and discard invariants.

### Transaction overlays

Overlays are derived from the typed facts belonging to an action. A source action remains one timeline position; its detail lines supply the Play, Discard, Draw, Find, Move, and other stages. No separate position-indexed overlay catalogue should exist.

### Replay result

The compiler returns both the replay program and diagnostics:

- supported, partial, or unsupported status;
- understood and unresolved action counts;
- state contradictions;
- unresolved card identities or artwork;
- parser/catalogue version.

This makes partial fidelity visible and gives production monitoring a measurable contract.

## Card identity and artwork

### Current behaviour

The prototype does not store card images in PokeNotes. It builds Limitless CDN URLs from manually chosen set codes and card numbers. The card back is loaded from `images.pokemontcg.io`, while Next Image proxies and caches rendered card images.

PokeNotes already synchronises Pokemon TCG API data into `card_effect_catalog`, but that catalogue deliberately retains only classification and effect fields. It does not currently retain set, number, HP, regulation mark, legalities, or image URLs, so it cannot act as a general replay card resolver.

### Recommended card-reference catalogue

Create a separate printing-level card catalogue keyed by source card ID, containing:

- canonical and normalised card name;
- set ID, set code, and collector number;
- supertype, subtypes, HP, attacks, and abilities;
- regulation mark and legality metadata;
- small and large source image URLs;
- source and last successful sync timestamp.

The existing effect catalogue can continue serving action classification initially. It should not be expanded into the card-reference table because it has one row per effect and would duplicate printing metadata.

### Artwork resolution policy

For each evidenced card name:

1. Use the exact print from the user's linked deck list when it contains that card.
2. Otherwise narrow printing candidates using card name, observed attack or ability, battle date, and the sets permitted by the selected format.
3. If one candidate remains, use it and record how it was identified.
4. If several legal candidates remain, select a deterministic representative print and label it as representative.
5. If no safe candidate remains, show a consistent unresolved placeholder rather than an illegal or guessed card.

Format labels alone are not a legality catalogue. Productisation therefore also needs a synchronised mapping between a site format and its permitted sets or regulation marks.

### Image hosting decision

Do not bulk-download all card images initially.

Use a server-synchronised metadata catalogue and external source image URLs, with Next Image providing resizing and caching. Do not make live card-API requests when a user opens a replay. The Pokemon TCG API has authentication and request limits, and recent-set API/data failures make a fail-closed local catalogue important.

An on-demand object-storage mirror can be introduced later if production measurements show material upstream availability or latency problems. Mirroring should only follow confirmation of image-hosting rights; copying the files to PokeNotes infrastructure does not itself grant permission to host copyrighted artwork.

Primary references:

- Pokemon TCG API data repository: https://github.com/PokemonTCG/pokemon-tcg-data
- Authentication: https://docs.pokemontcg.io/getting-started/authentication/
- Rate limits: https://docs.pokemontcg.io/getting-started/rate-limits/
- Recent-set API issue: https://github.com/PokemonTCG/pokemon-tcg-data/issues/622
- Pagination issue: https://github.com/PokemonTCG/pokemon-tcg-data/issues/619

## Site integration

Add a `Replay battle` action to each owned battle-log detail page. Existing logs can compile lazily on first use and cache a versioned replay result; new imports can compile after the source log has been saved. The replay should remain owner-scoped unless sharing is deliberately extended later.

The UI should distinguish:

- replay available;
- replay available with unresolved events;
- replay unavailable because the stored log is invalid or unsupported.

## Validation strategy

Before enabling the feature broadly, validate the compiler through the same public interface that production uses against a varied corpus of real, anonymised logs. The corpus should cover different decks and languages, duplicate Pokemon, retreats and switches, evolution chains, Tools and Special Energy, spread damage, healing, damage movement, multi-card searches and shuffles, incomplete hidden information, concessions, and unusual end states.

Tests should assert observable replay facts and frames rather than card-specific implementation branches. The existing prototype log becomes one durable fixture, not the implementation itself.

## Recommended delivery order

1. Extract a reusable `BattleReplay` UI whose main input is a compiled replay program.
2. Define the typed replay-program interface and pure reducer.
3. Compile generic movement, draw, discard, shuffle, attachment, evolution, damage, knockout, and Prize grammar from stored action titles and details.
4. Add the printing-level card-reference catalogue and deterministic artwork resolver.
5. Compare output across a varied real-log corpus and expose compiler diagnostics.
6. Integrate the replay action into `/logs/[id]` with owner authentication and versioned caching.
7. Measure artwork reliability before deciding whether an image mirror is necessary.

## Explicit non-goals

- Do not turn the replay into a rules engine or infer actions from card text.
- Do not promise perfect hidden state when the source log does not expose it.
- Do not add new position-indexed or card-name-specific production fixes.
- Do not bulk-host card artwork without an operational need and confirmed rights.
