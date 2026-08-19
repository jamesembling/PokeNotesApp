# Reference Data

Use this path for `pokemon_catalog`, archetype catalogs, and other cached datasets consumed by product options or identification logic.

## Trace the live path

Account for each applicable layer in order:

1. source definition;
2. sync or upsert path;
3. runtime database row;
4. server cache;
5. API payload consumed by the UI;
6. client or local-development cache.

For picker and search failures, inspect the delivered option list before changing matching logic.

## Automation

An automated sync is active only when its route, scheduler, secrets, deployed environment, and first successful run are verified. Record whether existing environments still need a one-time backfill.

## Completion

The change is complete when the intended row exists in the target database, the product-facing payload contains it, relevant caches have been refreshed or invalidated, and the consuming UI path has been verified. Name any layer that was not authorized or available.
