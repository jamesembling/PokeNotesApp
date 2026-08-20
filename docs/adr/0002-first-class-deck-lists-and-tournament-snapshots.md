# ADR 0002: First-class Deck Lists and Tournament snapshots

- **Status:** Accepted; implementation planned in two stages
- **Date:** 2026-08-20

## Context

Deck Lists need to be useful without requiring a Deck Strategy. Tournament recording also needs to preserve the exact list used at an event without silently creating a Deck Strategy or allowing later edits to rewrite event history.

The current implementation does not support that product model. A read-only production inspection on 20 August 2026 confirmed that `deck_lists.deck_id` is non-null and has an account-scoped cascading foreign key to `decks`. Tournament constraints and row-level policies require `linked_deck_id` whenever `linked_deck_list_id` is present. The application Tournament action creates a backing Deck Strategy before saving a list, and the shared Deck List writer requires a Deck Strategy identifier. Production has no alternative Tournament Deck List relation or complete snapshot storage.

ADR 0001 separately protects valid Deck Lists and Deck Matchups during the active Deck Aggregate compatibility period. Introducing first-class Deck Lists must preserve those protections and cannot reinterpret or discard existing aggregate children.

The implementation-facing brief for the first stage is the Ready [Make Deck Lists first-class account-owned records](https://app.notion.com/p/3c2aee33e561816781c4f64b4e393cb9) Issue Board card. It carries the acceptance criteria and delivery sequencing; this ADR is the durable repository record of the settled behavioral contract shared by that foundation and the later Tournament workflow.

## Decision

1. A **Deck List** is a first-class record owned by one account. Association with a Deck Strategy is optional.
2. A Deck List may be associated with zero or one Deck Strategy. A Tournament may reference zero or one Deck List independently of any Deck Strategy reference, and one Deck List may be referenced by multiple Tournaments.
3. Deleting a Tournament or Deck Strategy removes its association with a Deck List but does not delete the account-owned Deck List. Deleting a Deck List is a separate deliberate action whose references must be handled safely.
4. A Tournament owns its event metadata, Tournament Rounds, and one optional **Tournament Deck List Snapshot**. Deck Strategies and Deck Lists remain external account-owned records.
5. A Tournament Deck List Snapshot is immutable event evidence. It contains the complete list contract: raw imported text, parsed cards, sorted cards and ordering version, name, format, date, author, and notes.
6. The Tournament displays the snapshot as the authoritative list used at the event and presents the current source Deck List only as a separate relationship. Editing or deleting the source does not change or erase the snapshot.
7. Replacing or removing a Tournament Deck List Snapshot requires an explicit Tournament action. Selecting a replacement creates a new snapshot; removing it does not delete the first-class Deck List.
8. Adding a standalone Deck List from a Tournament is one atomic operation that creates an account-owned Deck List, associates it with the Tournament, and captures the snapshot. It creates no Deck Strategy.
9. Creating a Deck Strategy from an existing Deck List is explicit and associates the same first-class record; it does not silently create a duplicate.
10. Each deliberate mutation is atomic and independently retryable. A failed operation does not roll back or corrupt unrelated Tournament information.
11. Every creation action has its own idempotency identity. An identical retry returns the existing record; reusing the identity with different values is rejected.
12. Competing stale updates to the same Tournament, Tournament Round, or Deck List fail with refresh-and-retry guidance. Mutations to independent records do not conflict.
13. Tournament Round numbers are stable event facts. Deletion may leave gaps, while new numbers must be allocated atomically so concurrent creates cannot claim the same number.

The behavioural contract above is fixed. The exact relational shape, transition mechanism, and snapshot representation remain implementation decisions. Any schema design must retain account isolation, RLS enforcement, existing valid records, and ADR 0001 compatibility until its exit checks are satisfied.

## Delivery

Implementation is split into two linked units:

1. **First-class Deck Lists:** account ownership, optional Deck Strategy association, lifecycle, compatibility, persistence, and the standard Deck List workflow.
2. **Tournament workflow:** atomic commands, independent Deck List references, immutable snapshots, rounds, idempotency, concurrency, and revalidation.

The Tournament workflow depends on the first-class Deck List foundation. The narrower existing atomic Tournament Deck List and round-allocation defects remain useful failure records and keep their existing database-release gates.

## Consequences

- Users can capture a Deck List without first creating a Deck Strategy.
- Tournament history remains stable when a source Deck List changes or disappears.
- Deck Strategy creation is never a hidden side effect of Tournament capture.
- Existing Deck Aggregate compatibility becomes a migration constraint for the foundation work rather than a reason to preserve the current product coupling.
- Supporting the decision requires a reviewed storage transition because the live schema currently enforces Deck Strategy containment. This ADR does not preselect that transition.
- Behavioural tests must cover ownership, optional associations, snapshot preservation, deletion, idempotency, stale writes, atomic round allocation, and compatibility with existing records.

## Alternatives rejected

- **Require every Deck List to belong to a Deck Strategy:** prevents standalone capture and causes hidden Strategy creation in Tournament workflows.
- **Store only a live Tournament reference:** later Deck List edits would rewrite historical event evidence.
- **Make all Deck Lists globally immutable:** preserves history but unnecessarily changes ordinary Deck List editing across the product.
- **Copy a Deck List when creating a Deck Strategy:** creates duplicate first-class records and obscures which list is authoritative.
- **Implement the foundation and Tournament orchestration as one agent task:** combines a compatibility-sensitive storage transition with a broad workflow refactor and weakens verification boundaries.
