# First-class Deck List release order

This is the local release contract for `20260821003055_first_class_deck_lists.sql`.
It is intentionally a draft: no production or linked SQL is run by the feature
worker.

1. Apply and verify the migration first. The migration expands `deck_lists`,
   installs the ownership/reference policies, and creates the atomic
   `commit_first_class_deck_list` and `set_deck_list_association` RPCs.
2. Confirm the migration history, RLS policy definitions, legacy-only log and
   tournament references, and the list-delete reference cleanup before serving
   the new application code.
3. Deploy the application second. Its first-class writer may use a narrowly
   classified RPC fallback for the associated legacy writer while the migration
   is unavailable; standalone writes fail with a migration-required message
   rather than silently losing data.
4. After the migration and application are verified together, remove the
   fallback only in a separately reviewed compatibility cleanup. Do not deploy production from this task.

The fresh `schema.sql` copy must remain contract-equivalent to the migration;
the byte-verified pre-existing schema prefix is not regenerated or reordered.
