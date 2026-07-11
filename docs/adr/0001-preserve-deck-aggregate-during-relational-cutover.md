# ADR 0001: Preserve deck aggregates during relational cut-over

- **Status:** Accepted and live. Both account copies were preserved in the production re-key on 11 July 2026 UTC. The compatibility layer remains through at least 10 August 2026 at 23:08 UTC plus the exit checks below.
- **Date:** 2026-07-11

## Context

Deck Lists and Matchup Plans currently exist both as JSON inside `decks` and as rows in `deck_lists` and `deck_matchups`. The relational tables are the intended long-term home. Production now uses the transactional replacement while both stores remain active during the compatibility period.

A privacy-safe read-only live audit found 49 legacy Deck List occurrences versus 30 relational rows, and two legacy Matchup Plan occurrences versus one relational row. The gaps are not globally missing content. Nineteen list occurrences and one matchup occurrence reuse an ID that exists relationally under a different account and Deck Strategy. The original migration treated those historical IDs as globally unique and retained only one relational row per ID. All compared business content matches, but seven preserved legacy list occurrences are referenced by 31 Battle Logs.

Consequently, a same-ID backfill is unsafe: the global relational primary key is already occupied. Deleting the preserved copies would discard valid account-scoped data, while immediately making relational rows authoritative would hide it.

## Decision

1. Relational Deck Records remain the intended long-term source, but no final read or write cut-over occurs until a quiescent or transactionally snapshot-consistent compatibility audit reports zero blocking conditions. Repeated clean runs of the current paginated REST audit are useful observation evidence, but they are not a transactionally consistent final cut-over proof.
2. During compatibility, child identity is scoped by account, Deck Strategy, and child ID. Comparison or mutation code must not treat the child ID alone as identity.
3. Aggregate reads use one compatibility resolver. A matching relational record supplies the current value; legacy-only records remain visible; relational-only records are appended; fully migrated aggregates retain their established relational ordering.
4. Aggregate writes use a typed, `FormData`-free writer boundary and one `commit_deck_aggregate_child` database RPC. The RPC runs as the authenticated caller, locks the owned parent before reading or mutating the aggregate, merges the submitted child into the latest Legacy Deck Copy, version-checks edits to the same child, and writes both compatibility stores in one transaction. Same-parent duplicate IDs and relational-only create collisions fail closed instead of being silently adopted.
5. Raw legacy JSON remains the mutation base during compatibility so a partial relational collection cannot erase an untouched legacy record.
6. Both account copies are retained. The approved remediation atomically assigns fresh IDs to the 19 list and one matchup occurrences, updates only the affected owners' JSON, inserts the relational rows, and updates the 31 owner/deck-scoped Battle Log links. A private identifier-only ledger records the mapping through the compatibility period.

## Consequences

- Current users keep seeing their preserved lists and matchup plans. The new read boundary protects a future partial migration from hiding records.
- The database migration deployed before the application code. That order avoided calling a function that did not yet exist and kept the previous application compatible during the database cut-over.
- A relational write and its Legacy Deck Copy update now either both commit or both roll back. Concurrent edits to different children merge under the parent lock; a stale second edit to the same child receives an explicit refresh-and-retry error.
- The approved re-key removed the 19 Deck List and one Matchup Plan collisions without discarding either account-scoped copy. It repaired 31 precisely owner/deck-scoped Battle Log links while leaving 43 unrelated same-ID links untouched.
- Old bookmarked URLs containing one of the 19 replaced list IDs or the replaced matchup ID no longer resolve. Internal navigation is regenerated from the repaired records, and the 31 persisted Battle Log links move with their owner-scoped list.
- The post-repair compatibility audit reports 49/49 Deck List and 2/2 Matchup Plan parity with every blocking issue count at zero. Repeated clean audits remain required during observation because future writes could still expose an unreviewed path.
- The Legacy Deck Copy cannot be removed on a calendar date alone. Exit requires zero true gaps/collisions, comparison parity, migrated readers and writers, transactional persistence, and an agreed observation period.

## Alternatives rejected

- **Make relational rows authoritative immediately:** would hide valid account-scoped legacy occurrences.
- **Backfill the same IDs:** would conflict with or risk moving another account's relational row.
- **Treat cloned content as disposable:** content is valid and actively referenced; disposal requires an explicit product decision.
- **Keep dual persistence indefinitely:** preserves today’s behavior but leaves every future feature responsible for two sources of truth.
