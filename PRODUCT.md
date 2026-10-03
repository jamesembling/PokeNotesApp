# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Poke Notes is used by competitive Pokemon TCG players across desktop and mobile contexts. They need a fast, reliable workspace for reviewing battle logs, deck lists, tournament results, matchups, strategy notes, and probability decisions without losing the thread of a match, testing session, or tournament.

## Product Purpose

Poke Notes turns a player's competitive records into usable evidence. It brings battle logs, deck lists, tournaments, strategy, and related statistics into one authenticated workspace so players can record games quickly, revisit what happened, understand performance patterns, and make concrete play, testing, and deck-building decisions.

Success means that capture is quick enough to use during real competitive routines, saved records remain trustworthy, and the player can move from historical evidence to a clear strategic decision.

## Positioning

Poke Notes is an evidence-led competitive workspace rather than a generic note-taking tool or isolated stat tracker. Its distinguishing mechanism is the connection between a player's battle evidence, deck lists, tournaments, matchup knowledge, and evolving deck strategy, so analysis and planning remain grounded in the same competitive record.

## Operating Context

Players use Poke Notes while importing games from Pokemon TCG Live, reviewing testing sessions, preparing deck choices and matchup plans, recording tournament rounds, and evaluating results afterward. The product supports both focused desktop analysis and quick mobile capture or review.

The product's durable domain language and record relationships are defined in `CONTEXT.md`. Battle Logs, Deck Lists, Deck Strategies, Deck Matchups, Tournaments, and Tournament Deck List Snapshots are distinct product records with explicit ownership and preservation rules.

## Capabilities and Constraints

- Poke Notes is an authenticated, account-scoped product for capturing and reviewing Battle Logs, Deck Lists, Deck Strategies, Deck Matchups, Tournaments, and related statistics.
- Imported game history is parsed into a reviewable Battle Log Import Draft before it becomes a saved Battle Log.
- Battle Replay (Beta) lets an account owner choose a saved Battle Log and follow its recorded actions on a visual board. It is a read-only derived view: replaying never changes the saved log or creates another record. Hidden or unavailable state stays unknown, partial reconstruction is disclosed, and unsupported logs retain a path to the original Battle Log. Replay is private to the owner and has no public sharing flow.
- Deck Lists are first-class account-owned records. Their association with a Deck Strategy is optional, and their visual order is a shared product contract across saved lists, Battle Logs, Tournaments, and shared views.
- Tournaments preserve the Deck List used at the event as an immutable snapshot, independently of later changes to the source Deck List.
- Strategy work connects working notes and matchup plans to a Deck Strategy and its battle evidence.
- Player Profiles are member showcases with a separate trainer name, a profile picture, an optional favourite Pokémon, and up to three ordered favourite card printings. Other authenticated members can discover them through Friends without an opt-in or a saved showcase row. There is no hide-profile setting. Identity falls back from the trainer name to a trimmed display name of at least two characters, limited to 40 characters, then a stable Player label derived from the account ID.
- Profile puts a large clickable avatar beside the account name, with private Account and Activity information grouped underneath and account editing in a labelled disclosure. The picture chooser offers the existing Poké Ball presets or a still JPEG, PNG, or WebP upload up to 2 MiB. Uploads are decoded, stripped of metadata, and saved as a centre-cropped square WebP up to 512 pixels per side through owner-scoped storage writes.
- Friendships require an accepted request. Accepted friends can see aggregate Battle Log wins, losses, and total games; last-login sharing is a separate setting, off by default. Account details, individual Battle Logs, Deck Lists, and notes remain private. Blocking removes the connection and prevents mutual discovery and profile access.
- The Friends sidebar link shows a small red dot for incoming pending friend requests, including in mobile navigation and the collapsed icon rail. Its accessible description reports the pending count; outgoing requests do not trigger the indicator.
- Responsive behavior is a product requirement: mobile workflows must be intentionally usable, not reduced desktop layouts.
- Record integrity, account isolation, and preservation through storage transitions take priority over implementation convenience.

## Brand Commitments

The product name is Poke Notes. Its voice is serious, focused, professional, and specific to competitive play. It should feel closer to a sports analytics product than a fan site: calm, clear, and trustworthy without becoming sterile.

Avoid novelty Pokemon theming, fan-site energy, generic SaaS language, playful filler, decorative spectacle, and visual treatments that compete with records, numbers, outcomes, or the task at hand. Light and dark modes are both supported product contexts.

## Evidence on Hand

- The repository contains working authenticated product flows for battle logs, deck lists, deck strategies, tournaments, statistics, probability calculations, sharing, and profile management.
- `CONTEXT.md` records the accepted domain language and invariants that future product and implementation work must preserve.
- `docs/adr/0001-preserve-deck-aggregate-during-relational-cutover.md` and `docs/adr/0002-first-class-deck-lists-and-tournament-snapshots.md` record accepted compatibility and ownership decisions.
- `docs/performance-targets.md` contains dated production measurements and performance targets; performance claims must be tied to a current measurement source.
- The product has no approved testimonials, customer claims, or marketing benchmarks in this record. Future work must not fabricate them.

## Product Principles

- Evidence before intuition: competitive decisions should remain traceable to trustworthy records.
- Capture with low friction: recording a game, note, list, or round should not interrupt the player's competitive routine.
- Preserve the competitive record: historical evidence and account-owned records must remain reliable as the product evolves.
- Connect analysis to action: statistics and history should help a player reach a concrete testing, play, or deck-building decision.
- Consistency over novelty: shared language and familiar workflows should make the product easier to use across features and devices.

## Accessibility & Inclusion

Target WCAG AA for contrast, keyboard access, focus visibility, labels, and responsive readability. Preserve reduced-motion alternatives for transitions, avoid color-only communication for win, loss, or warning states, and keep touch targets and form controls usable on mobile.
