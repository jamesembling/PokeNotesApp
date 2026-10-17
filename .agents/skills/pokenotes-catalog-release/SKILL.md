---
name: pokenotes-catalog-release
description: Safely audit, add, sync, publish, and verify Pokémon TCG set releases in PokeNotesV2 across site format codes, Pokémon search and sprite catalogue entries, and the card-effect catalogue used by battle-log identification. Use for new set or expansion releases, rotation or format changes, missing Pokémon or Mega forms, broken or unavailable sprites, stale card attacks or abilities, cache-version updates, set-scoped catalogue syncs, and questions about what a catalogue update actually published.
---

# PokeNotes Catalog Release

Treat a release as three related but independent catalogue changes. Establish the current truth for
each one, update only the affected lanes, and report code, live data, and deployed application state
separately.

## Catalogue Boundaries

- **Site formats** control selectable/default Limitless set ranges such as `TEF-PBL`.
- **Pokémon catalogue** supplies Pokémon search, picker options, form metadata, and sprites through
  `pokemon_catalog`.
- **Card-effect catalogue** supplies attacks, abilities, and Trainer effects for battle-log
  identification through `card_effect_catalog`.

Never describe syncing all cards in a set as adding all of those cards to the Pokémon picker.
State source-card counts and generated effect-row counts as different measurements.

## Mutation Boundary

- Keep requests to check, review, investigate, or audit read-only.
- Treat an explicit request to update, add, sync, publish, or fix a release as authorization for the
  corresponding in-scope code and catalogue changes.
- Do not deploy application code, push Git changes, or broaden a set-scoped data update into a
  historical resync unless the user asked for that action.
- Inspect `git status --short` and relevant diffs before editing. Preserve unrelated work and report
  any dirty boundary that prevents a safe release.
- Use `pokenotes-supabase-data-truth` for linked production-data diagnosis and
  `pokenotes-browser-auth` when an authenticated UI check is required.

## Release Workflow

### 1. Establish the release identity

Verify current facts live rather than reusing a previous release:

- official expansion name and release date
- Pokémon TCG API set ID
- Limitless site-format code and whether it is already visible upstream
- the full release form list, separating already-supported forms from additions
- new or changed Pokémon forms, stages, and evolution parents
- availability of the exact sprite assets

Prefer official release information for product facts, then check the actual upstream services used
by the app. Release-day sources may update at different times, so record which facts are confirmed
and which remain provisional.

### 2. Audit all three lanes

Inspect these current anchors before assuming the previous release workflow is unchanged:

- Formats: `lib/formats/options.ts`, `lib/formats/catalog.ts`, and
  `tests/site-formats.test.ts`.
- Pokémon forms and sprites: `lib/pokemon-catalog/special-forms.mjs`,
  `lib/pokemon-catalog/contract.ts`, `lib/pokemon/sprites.ts`,
  `lib/db/pokemon.ts`, `seed-pokemon.mjs`, and the Pokémon catalogue tests.
- Card effects: `lib/card-effect-catalog/sync.mjs`, `sync-card-effect-catalog.mjs`,
  `lib/log-import/identifier/catalog.ts`, `tests/catalog-sync.test.mjs`, and
  `tests/safe-json-fetch.test.mjs`.
- Commands and supported entry points: `package.json`.

Compare repo definitions, upstream results, live Supabase rows, and caches. Produce an explicit gap
list for each lane even when no change is required.

### 3. Implement the smallest durable change

For site formats:

- Add the confirmed newest Standard range in the canonical fallback list.
- Preserve explicitly non-Standard formats and current ordering rules.
- Bump the site-format cache version only when its cached output changes.
- Update the focused format test.

For Pokémon forms and sprites:

- Put curated special forms in `lib/pokemon-catalog/special-forms.mjs`; do not patch picker UI.
- Confirm canonical slug, label, stage, `evolves_from`, aliases, search behavior, and sprite URL.
- Check the exact sprite URL before publishing. Do not add a row that silently produces a broken
  image.
- If the form-specific sprite is unavailable, either defer the row or use a deliberate valid
  fallback such as the base-form sprite. Make the fallback explicit in code, tests, and the final
  report; never claim it is the dedicated form sprite.
- Bump Pokémon/search identification caches only when their underlying results change.
- Extend focused form, sprite-resolution, search, and catalogue-contract tests.

For card effects:

- Prefer a set-scoped release sync:

```bash
POKEMON_TCG_SET_ID=<confirmed-set-id> npm run sync:card-effect-catalog
```

- Validate the set ID before mutation and keep deletion/replacement restricted to rows whose
  `source_card_id` belongs to that set.
- Do not fall back to a full historical sync merely because it exists. A full sync can hit upstream
  timeouts and is unnecessary for a release-day update.
- Preserve unrelated sets. Treat zero-card, partial, duplicate, malformed, or upstream-failure runs
  as failures and retain the current catalogue.
- Report both the number of upstream cards and the number of generated effect rows.

### 4. Validate locally

Run the narrow tests for every changed lane first. Typical checks include:

```bash
npm test -- tests/site-formats.test.ts
npm test -- tests/pokemon-special-forms.test.ts
npm test -- tests/pokemon-sprites.test.ts
npm test -- tests/pokemon-search.test.ts
npm test -- tests/pokemon-catalog-contract.test.ts
npm test -- tests/catalog-sync.test.mjs tests/safe-json-fetch.test.mjs
npm run lint
npm run typecheck
```

Run broader tests or a build when the change crosses shared parsing, caching, database, or route
boundaries. Check the worktree again afterward. Separate pre-existing changes and generated
`next-env.d.ts` churn from the intended release diff.

### 5. Publish and verify live data

Only perform this step when live publication is within the user's request.

- Confirm the linked Supabase project and required environment without printing secrets.
- Publish the Pokémon catalogue through the repo-supported sync path:

```bash
npm run sync:pokemon-catalog
```

- Publish card effects with the confirmed set-scoped command, not an unbounded historical sync.
- Query live rows after publication. Verify expected Pokémon slugs, metadata, source-card prefix,
  source-card count, effect-row count, and timestamps.
- Request each new sprite URL and confirm a successful image response.
- Re-run the relevant audit command, such as `npm run audit:pokemon-catalog`, when its environment
  and scope match the change.
- Check `/api/site-formats` after deployment and report both the effective default and whether the
  response came from upstream discovery or the repo fallback.
- When claiming end-to-end support, search the production picker for every named new form using
  `pokenotes-browser-auth`. If authenticated visual verification is unavailable, report that UI
  layer as a residual gap rather than inferring it from rows alone.

Do not say the release is live merely because Supabase rows exist. State independently whether:

1. repo code is prepared,
2. production catalogue data is published,
3. application code is committed and pushed, and
4. the production deployment contains that code.

## Stop Conditions

Pause before publication when:

- the set ID or format code is unconfirmed
- upstream card data is incomplete
- a required form has no acceptable sprite decision
- the sync would delete or replace unrelated sets
- live linkage or credentials cannot be verified
- unrelated work makes the release diff unsafe to commit or deploy

It is valid to prepare code without publishing data, or publish authorised catalogue data without
deploying code. Report the split plainly.

## Closeout

Return:

- confirmed release identity and sources
- format change, if any
- explicit list of added or changed Pokémon forms
- dedicated sprites versus temporary fallbacks
- source-card count and generated effect-row count
- cache versions changed and why
- focused and broad validation results
- live Supabase publication state
- commit, push, and production deployment state
- provisional items that require a later upstream recheck
