# Shared card definitions

`card_definition_catalog` is public reference data shared by Battle Replay and other card consumers. It is separate from account records and from representative artwork. The existing `card_effect_catalog` remains available during the additive rollout. `definitionEffectRows` projects full trainer, Ability and attack text into the existing effect evidence contract.

## Source and identities

The source is [TCGdex](https://tcgdex.dev/reference/card), a community-maintained database, [MIT licensed](https://github.com/tcgdex/cards-database), not an official Pokémon rules authority. Provider identity is retained: TCGdex uses `sv06-130`, while the previous Pokémon TCG API uses different set/number conventions. IDs must not be translated by stripping zeroes globally or by choosing representative art. Exact selection requires a supplied TCGdex set and collector number; a name/effect match establishes only candidate agreement.

The source adapter retains printed HP, category, stage, types, evolution source, regulation mark, set release date, trainer effects and all supplied Ability/attack text, attack cost and damage. Every definition includes its source URL and collection timestamp. GraphQL currently omits the REST `updated` field, so `sourceUpdatedAt` is normally null rather than fabricated; a REST fallback retains the supplied update time. Generic Pokémon ex/ACE SPEC rule-box text is not generally supplied. Missing rules, HP and effect fields remain unknown; a missing effect name is retained as an empty name with its supplied text, and cannot exclude that candidate using observed effects.

`coverage: complete` means every matching candidate from one completed **provider-listed English physical-card corpus** was loaded, with pagination/count validation. It does not claim every physical printing has been catalogued by the provider. `sourceCoverage` reports the explicit scope, listed-printing count and sets whose listing is shorter than their stated physical count. Pokémon TCG Pocket (`serie.id = tcgp`) is excluded because its identically named cards have different rules.

On 3 October 2026 the provider listed 21,290 physical printings across 205 sets. Six sets had incomplete listings: `wp` 0/7, `jumbo` 0/160, `sp` 0/10, `rc` 0/25, `tk-sm-l` 18/30 and `mfb` 34/48. These are source coverage gaps, not permission to infer missing printings. A missing candidate remains missing. Agreement and printed HP are statements about the available corpus and carry its provenance.

The unenriched provider audit also found 107 Pokémon printings with both effect lists empty, 35 printings with unnamed effects, and 27 Trainer definitions without supplied text. In that original data, Solrock `tk-xy-latio-12`/`tk-xy-latio-26` and Combusken `np-9` could not establish the absence of an HP-changing Ability. Exact-printing enrichment described below fills verified gaps; remaining incomplete records retain explicit uncertainty. A compatible incomplete printing can leave effective HP unknown even when printed HP agrees. The effect projection retains an uncertainty marker so dropping missing effects cannot manufacture a certain action classification or movement origin.

## Publication

Run `npm run sync:card-definitions -- --dry-run` to validate the entire source without any database writes. The sync reads a complete set/card-ID manifest, requests full card definitions in GraphQL alias batches of 100, and rechecks the manifest before publication. It uses the documented [GraphQL endpoint](https://tcgdex.dev/graphql) and the verified `card(id: "eq:<printing-id>")` field. The explicit equality operator is required: unqualified GraphQL IDs use substring matching (for example `g1-28` otherwise returns `g1-28a`). The provider's nested `set.cards` returns brief records and is not used as full card evidence. Source content is collected over a bounded run, not an upstream transactional snapshot.

A write run stages one new generation. GraphQL schema failures scoped to a requested card alias are reread through that exact printing’s REST endpoint; the same identity and shape checks still apply. Any missing response, inconsistent identity, unrecoverable GraphQL error, changed manifest, database error or mismatched row count stops publication. A service-role-only invoker RPC validates the exact count and atomically publishes the generation pointer. Staged records are hidden from public clients. Completed rows and metadata cannot be changed; row locks serialize staging writes against publication. Retention keeps two completed snapshots and at least 24 hours for in-flight readers. Failed staging generations become eligible for cleanup only after another successful publication.

The `Refresh card definitions` GitHub workflow runs weekly and supports a manual dry run (default). It requires the `Production` environment's `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, and only accepts `main`. It publishes reference rows, never DDL. The additive migration must first pass the controlled **Deploy production database** workflow. A saved workflow is not proof that the schedule, secrets or first publication work: verify a successful write run and its active-generation readback after deployment.

## Runtime and uncertainty

`loadCardDefinitions` reads only the public database. It batches names, pages in stable printing-ID order, caps each batch at 10,000 rows and caches complete results for five minutes with a 512-name bound. Generations older than 14 days are stale and cannot establish new facts. Missing schema, aborts, invalid records, truncation and failures degrade to explicit unknown coverage. There are no provider calls per frame or per card during playback. Published primary-provider images also supply representative artwork without another lookup; missing images retain the bounded optional artwork fallback. Images never identify the printing used in a game or establish its HP.

Resolution indexes names once, preserves every candidate and optionally narrows with supplied printing IDs or recorded effect names. Printed HP is established independently when every remaining candidate has the same known HP, even if other text differs. Full definition agreement additionally compares supplied functional fields. Conflicting/missing HP and incomplete coverage produce null HP. Neither artwork nor card-name guesses establish HP.

## Verification and release

The existing catalogue and replay tests own pure normalisation, candidate agreement, trainer projection and consumer behavior. `sql/verification/card-definition-catalog.sql` exercises staged visibility, public read-only grants, exact-count publication, rollback, completed immutability and retention against the actual migration. Run it through the disposable local migration rehearsal after committing the migration and verification file. A separate two-session test is required to prove concurrent staging/publication behavior; a single-session SQL result must not be described as concurrency evidence.

Release evidence must separately name migration deployment, first full published generation, workflow success, refreshed public payload and consumer verification. Until those steps succeed, this is a locally implemented foundation, not an active production catalogue.

### Exact-printing historical enrichment

The sync supplements incomplete effect records from the public historical
`PokemonTCG/pokemon-tcg-data` JSON snapshot pinned to commit
`39a26a144c8b6ef6c2fb17b2c29d0bb7121e3a11`. This is a historical compatibility
source, not the primary provider or a dependency on the retiring Pokémon TCG API.
Its README states that the JSON repository remains available after the API
shutdown. No dataset licence was found or asserted during this audit.

The adapter requires matching source printing ID, set ID in the secondary set
manifest, collector number, category, name, matching normalized release dates when both
sources provide them, and (for Pokémon) HP and any supplied stage. An absent primary stage stays absent and does not
create a conflict.
Existing named effects must agree on supplied text, type, damage and energy cost.
A disagreement leaves the original incomplete record unchanged. Trainer subtype
and rules are supplemented only when explicitly supplied by the exact printing;
old generic Trainer records such as Base Set 2 Switch remain unclassified when
both sources omit subtype. Enrichment never substitutes a representative image
or a same-name card. Each supplemented record carries `effectProvenance` with
provider, pinned revision, exact ID, source URL and affected fields. Printing
identity, HP and original source remain unchanged.

Two reviewed overlays cover English XY Trainer Kit Latios Solrock 12/30 and 26/30.
The individual scans at `https://static.dextcg.com/cards/tk8a/12.png` and
`https://static.dextcg.com/cards/tk8a/26.png` were inspected on 2026-10-03: both show
80 HP, Basic, Solar Generator and Knock Away, and no Ability. Their provenance
records the corresponding scan, and the overlay requires every checked identity
field and originally empty effects. These candidates can therefore be excluded
when a log observes Sunbeam. One narrowly reviewed cross-provider name difference
is `dp7-97`: its exact scan (`https://images.pokemontcg.io/dp7/97_hires.png`) shows
Heatran LV.X, 120 HP, 97/100 and Heat Metal/Heat Wave; TCGdex calls it Heatran with
stage LEVEL-UP. No general LV.X suffix stripping is performed.

Historical requests happen only during the scheduled snapshot sync: one pinned
set manifest and one cached request per set that needs enrichment. Unavailable
secondary data stops that attempted publication; the previous complete generation
remains active. Remaining source gaps and conflicting text stay unknown.

### Published artwork

Optional `imageUrl` comes from TCGdex's own card image prefix and documented
`/high.webp` suffix (https://tcgdex.dev/assets). The source adapter accepts only
HTTPS assets.tcgdex.net English card paths, without credentials, query or fragment.
This optional field travels with the same cached public definition lookup and can
supply representative art without another provider request. It never establishes
printing identity, HP, or rules; missing art remains optional. Historical or
reviewed effect enrichment preserves this primary-provider image unchanged.
