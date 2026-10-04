# Shared card definitions

`card_definition_catalog` is public reference data shared by Battle Replay and other card consumers. It is separate from account records and from representative artwork. The existing `card_effect_catalog` remains available during the additive rollout. `definitionEffectRows` projects full trainer, Ability and attack text into the existing effect evidence contract.

## Source and identities

The source is [TCGdex](https://tcgdex.dev/reference/card), a community-maintained database, [MIT licensed](https://github.com/tcgdex/cards-database), not an official Pokémon rules authority. Provider identity is retained: TCGdex uses `sv06-130`, while the previous Pokémon TCG API uses different set/number conventions. IDs must not be translated by stripping zeroes globally or by choosing representative art. Exact selection requires a supplied TCGdex set and collector number; a name/effect match establishes only candidate agreement.

The source adapter retains printed HP, category, stage, types, evolution source, regulation mark, set release date, trainer effects and all supplied Ability/attack text, attack cost and damage. Every definition includes its source URL and collection timestamp. GraphQL currently omits the REST `updated` field, so `sourceUpdatedAt` is normally null rather than fabricated; a REST fallback retains the supplied update time. Generic Pokémon ex/ACE SPEC rule-box text is not generally supplied. Missing rules, HP and effect fields remain unknown; a missing effect name is retained as an empty name with its supplied text, and cannot exclude that candidate using observed effects.

`coverage: complete` means every relevant matching candidate within a completed generation’s declared scope was loaded, with pagination/count validation. Legacy generations declare the provider-listed English physical archive; retained generations declare supported Standard floors and omitted modern-printing diagnostics. It does not claim every physical printing has been catalogued by the provider. `sourceCoverage` reports the explicit scope, listed-printing count and sets whose listing is shorter than their stated physical count. Pokémon TCG Pocket (`serie.id = tcgp`) is excluded because its identically named cards have different rules.

In the read-only 4 October 2026 capture the provider listed 21,290 physical printings across 205 sets. Six sets had incomplete listings: `wp` 0/7, `jumbo` 0/160, `sp` 0/10, `rc` 0/25, `tk-sm-l` 18/30 and `mfb` 34/48. These are source coverage gaps, not permission to infer missing printings. A missing candidate remains missing. Agreement and printed HP are statements about the available corpus and carry its provenance.

The unenriched provider audit also found 107 Pokémon printings with both effect lists empty, 35 printings with unnamed effects, and 27 Trainer definitions without supplied text. In that original data, Solrock `tk-xy-latio-12`/`tk-xy-latio-26` and Combusken `np-9` could not establish the absence of an HP-changing Ability. Exact-printing enrichment described below fills verified gaps; remaining incomplete records retain explicit uncertainty. A compatible incomplete printing can leave effective HP unknown even when printed HP agrees. The effect projection retains an uncertainty marker so dropping missing effects cannot manufacture a certain action classification or movement origin.

## Publication

Run `npm run sync:card-definitions -- --dry-run` to validate the entire source without any database writes. The sync reads a complete set/card-ID manifest, requests full card definitions in GraphQL alias batches of 100, and rechecks the manifest before publication. It uses the documented [GraphQL endpoint](https://tcgdex.dev/graphql) and the verified `card(id: "eq:<printing-id>")` field. The explicit equality operator is required: unqualified GraphQL IDs use substring matching (for example `g1-28` otherwise returns `g1-28a`). The provider's nested `set.cards` returns brief records and is not used as full card evidence. Source content is collected over a bounded run, not an upstream transactional snapshot.

A write run validates the full upstream privately, selects the retained Standard pool, then stages only that reduced generation. GraphQL schema failures scoped to a requested card alias are reread through that exact printing’s REST endpoint; the same identity and shape checks still apply. Any missing response, inconsistent identity, unrecoverable GraphQL error, changed manifest, database error or mismatched row count stops publication. A service-role-only invoker RPC validates the exact count and atomically publishes the generation pointer. Staged records are hidden from public clients. Completed rows and metadata cannot be changed; row locks serialize staging writes against publication. Retention keeps two completed snapshots and at least 24 hours for in-flight readers. Failed staging generations become eligible for cleanup only after another successful publication.

The `Refresh card definitions` GitHub workflow runs daily at 03:20 UTC and supports a manual dry run (default). It requires the `Production` environment's `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, and only accepts `main`. It publishes reference rows, never DDL. The additive migration must first pass the controlled **Deploy production database** workflow. A saved workflow is not proof that the schedule, secrets or first publication work: verify a successful write run and its active-generation readback after deployment.

## Stored Standard scope

`retention.mjs` uses the same pure legality policy as Replay, with explicit
`purpose: retention`. The current Standard comes from the first supported entry
in the shared site-format configuration. The stored union also includes Standard
floors required by saved games; publication pages only the saved `format` field
and rechecks that inventory before staging and immediately before publication.
The genuine September 2025 SVI games require G retention. September/October 2026
games use the actual-date H rotation even when their expansion label is stale.

Supported Basic Energy joins the union. Older printings are retained only when
eligible under a retained floor; an older alias-admission path is not implemented
here. Provider `Normal` alone is insufficient, and no older alias is admitted
from equal fragments or a null wildcard. Unknown modern marks stay in
compact per-floor/name/exact-set/date/named-effect diagnostics; they are not stored as
selectable cards. Unknown older artwork does not add an operative family or
weaken a known legal family. No manual deletion or broad archive fallback occurs.

`source_coverage` retains the upstream manifest hash/count separately from the
stored row count, versioned policy, retained formats/floors, unsupported saved
formats, source listing gaps, and omitted-printing diagnostics. A name lookup
preserves raw retained-union rows for exact recorded printing lookup. The resolver
applies actual-date floor and observed-effect narrowing to contextual completeness.
Non-exact name-domain completeness requires a valid game date no later than the
UTC day of the valid `retainedOn` producer instant. Timestamped game queries use their UTC day; exact
date-only values retain their calendar day. Invalid or timezone-free timestamps
cannot borrow a sliced date prefix. Missing dates or later games leave a local coverage
gap. This is a UTC-day horizon, not an intraday live-catalogue guarantee: same-day
games remain within the reviewed day, while unseen provider changes after the
capture instant carry no intraday guarantee. Known future launch exclusions remain
indexed and block a later same-day query when they could have become available. A single retained exact set/collector match bypasses unrelated omitted
same-name printings and this inventory horizon: later variants cannot change that
immutable printing. Incomplete, unavailable or stale overall load coverage is
never repaired by an exact identity. Unsupported/blank formats and unretained floors produce a local coverage
gap. An exact recorded printing outside the retained union remains unavailable
unless supplied separately with verified identity; the loader does not silently
fetch or restore the full archive.

A physical release date cannot prove a printing was unavailable in Pokémon TCG
Live. Exact set and expected provider-date mappings use independently verified
official digital launch instants; a date-only game on that launch day remains
uncertain. Other same-day or future paper dates remain unverified. Omitted
diagnostics include known future exclusions so a later game cannot silently lose
them, and legacy diagnostics missing an exact set ID cannot borrow a launch map.

Publication independently recomputes both retained rows and all scope metadata
from the validated private upstream input. The producer passes its full capture
instant for digital availability. Before staging, publication requires every
upstream row to carry one identical valid timestamp, exactly matching
`source_coverage.retainedOn`; a separately forged future horizon or mixed capture
is rejected. Calendar-only legacy scope remains readable. `expected_count` is the reduced row
count, while `source_manifest_hash` remains the full upstream identity manifest.
The existing atomic RPC and immutable-generation lifecycle remain unchanged.
Before staging, the publisher reads the completed active reference with exact
counts, stable pagination and pointer checks. It holds a proposal that removes
retained legal identities or historical Standard floors, shrinks the full
upstream count, withdraws known operative fields, or expands/changes existing
possible-printing diagnostics. A resolved gap needs fresh validated upstream
evidence; old rows are never copied into the proposal. A legacy full archive is
compared after projection into the authorized retained floor union. Source
clocks, cosmetic changes, supplied previously missing fields and legal additions
can proceed. Intentional corrections that conflict with known data require
review; there is no force flag. An empty initial installation is accepted only
when no completed generation exists. The pointer is rechecked before the RPC;
the controlled workflow serializes authorized publishers, but this recheck is
not an atomic compare-and-swap against other writers.
The first reduced publication keeps the previous full generation as its backup;
a later verified reduced publication may retire it through the normal two-snapshot
and at-least-24-hour policy. Active rows and total stored rows must be measured
separately. No DDL or manual cleanup is required.

`--dry-run --output /tmp/retained.json` performs no database reads or writes and
writes the reduced rows plus `/tmp/retained.json.generation.json` scope metadata.
Optional `--upstream-output /tmp/private-upstream.json` preserves the validated full
capture separately, plus parsed provider responses in its `.responses` directory.
Validated rows and scope are saved before publication, including when the guard
holds a proposal. Responses retain field presence and null values; their
`payloadSha256` binds the stored JSON serialization, not original HTTP wire
bytes. The index records public endpoints, capture times and workflow run IDs.
The workflow uploads only these public reference artifacts for 14 days; account
data, raw Battle Logs, credentials and headers are excluded. Dry runs use the
default supported Standard inventory, or an explicitly supplied inventory; a
write run obtains saved formats live, including unsupported/blank labels. All
shared-definition consumers use the same public lookup;
legacy full-archive generation metadata remains supported during rollout. The
controlled reference workflow refreshes daily at 03:20 UTC so subsequent UTC
days do not wait for a weekly refresh; failed or missing refreshes leave explicit
local name-domain gaps and do not invalidate immutable printing facts. The
separate effect and Pokémon-name catalogues are unchanged by this storage cut.

Successful GraphQL aliases with missing/invalid regulation marks can be completed
through the same provider's exact REST card endpoint. Both payloads use the same
normalizer and must agree on exact printing identity and all mutually supplied
operative fields. Only the mark is supplemented; one-sided fields remain as
originally supplied. Valid native single-letter marks are retained without a
REST query. Supplemental marks are explicitly A–J and preserve supplied casing.
The request budget excludes pre-Sword & Shield manifest dates and supported
unmarked Basic Energy; these exclusions never establish a mark. Reads use the
existing bounded JSON fetch/retry policy with two concurrent completion requests;
transport failure or conflicting reviewed evidence stops publication. The
separate `regulationMarkProvenance` binds the public REST identity, fetched time
and payload hash. It is community source metadata, not scan-backed
`regulationEvidence`, printed-absence proof or whole-card completeness.

### Held refresh recovery

A failed refresh stays failed and appears in the GitHub run summary with a link
to this procedure. GitHub's workflow notification settings control delivery;
the summary does not establish that anyone received a notification. Inspect the
active generation and its completion time: the runtime treats it as stale after
14 days. A new game beyond the last capture's UTC day can lose name-domain
coverage immediately, even while old games remain readable. Treat a held daily
refresh as a same-day incident, not a 14-day grace period. James owns this
workflow; delivery of its failure notification was verified in his inbox on
2026-10-04. Notification delivery should be reverified if the workflow's owner or
GitHub notification settings change.

Download the run's public source artifact and inspect the capture phase, exact
regression reasons, validated proposal, and previous active reference. Confirm
whether the failure occurred before staging or left an unpublished staging
generation. Never republish by copying old values or changing an unknown field
to known merely to clear the hold. For a new future set, add a digital launch
instant only after verifying a primary PTCGL announcement; paper dates alone do
not establish digital availability. Provider removals, text corrections or
changed legality require a reviewed source/policy correction with exact
before/after evidence and the relevant real saved-log acceptance checks, followed
by normal PR/CI gates and a controlled workflow retry. If an intentional
contraction cannot be represented safely, keep the hold and design a separately
reviewed exception bound to the exact active snapshot, proposal, changed fields
and primary proof. That requires an explicit reviewed guard/policy correction
through a PR and the acceptance gates; until it ships, the catalogue remains held
and coverage can degrade. Any exception must match the reviewed IDs, fields,
before/after values and active generation, expire or be removed, and leave every
other difference guarded. Independent comparisons with an older accepted capture
are offline release evidence; the live guard compares with the current active
generation at publication. If no primary digital-launch announcement exists for a
new set, the corresponding hold remains until there is usable proof. No generic
acknowledgement or force-publish path is provided.

### Reviewed whole-capture recovery

When a later provider response serves an older revision, a reviewed complete
capture can be published through **Publish reviewed card reference capture**.
This manual, `main`-only Production workflow shares the normal publisher's
concurrency group. It accepts a capture ID from
`lib/card-definition-catalog/reviewed-captures.json`; operators cannot supply a
URL, hash, field override or force option. The reviewed record fixes the private
same-repository release asset, byte count, full JSON hash, ID manifest, original
capture timestamp, known source-listing gaps and acceptance evidence. The
capture expires for recovery 24 hours after its original timestamp.

This is a normalized whole source capture approved as data. Its parsed public
response archive and producer invocation remain independent audit evidence;
the workflow does not claim to reproduce uncaptured historical enrichment
requests. The initial capture passed the original13 saved-log source gates
(17/17) and Ability checks (31/31). The current source discrepancy is corroborated
against the provider's repository before release: all191 missing printings agree
on their supplied operative fields with
[commit c5c0a8a](https://github.com/tcgdex/cards-database/tree/c5c0a8a63fe81746d05b9c95e8f51ed6931f7e78).
Their source files were parsed as data without executing repository code.

Download identity and digest are checked before parsing. The loader then checks
the full-file hash, strict produced rows, unique printing IDs, complete ID
manifest and uniform original capture clock before opening a database client.
Dry run performs no database reads or writes and derives the pool from the
approved saved-format inventory. Live publication reads the actual
saved-format inventory, derives the retained pool again using the original
capture time, and refuses unless the inventory, retained-row hash and scope hash
match the approved acceptance basis. A changed inventory requires fresh review
and acceptance. It invokes the unchanged publisher, regression guards, inventory
rechecks and active-pointer checks. All rows come from one complete capture;
there is no per-card carry-forward or clock refresh.

Inspect the controlled dry-run artifact, compare it with the reviewed capture
and actual saved-format scope, and pass the real-log acceptance before a live
dispatch. Then verify the active generation, product payload and replay UI.
Recovery does not establish that the provider's daily source is healthy. Keep
the normal refresh paused until a fresh controlled source capture passes the
same comparisons and acceptance. The name-domain horizon stays on the original
capture day; newer games can have incomplete coverage. The existing runtime's
14-day generation age uses publication completion time, so a recovery can move
that whole-generation deadline by at most the 24-hour recovery window; it does
not advance the name-domain horizon.

## Runtime and uncertainty

Replay pools keep guaranteed in-play components separate from Evolution layers
that may already have returned to hand. The latter retain their original IDs and
printing evidence in `possiblyReturnedCards`; they do not count as confirmed
board cards or known hand cards. Hand remains a possible location. Board remains
possible only while eligible `memberIds` survive. Recorded holder departures
can add deck or discard alternatives in `possibleReturnedDestinations`; those
alternatives persist through later mixed departures. If no eligible holder and
no additional destination remains, the components resolve to known hand cards.
Guaranteed pool components accompany a uniquely resolved holder's movement or
knockout with that movement's counts and transaction, rather than disappearing
during pool cleanup.

Other uncertain holder departures use `uncertainCards` groups instead: each
group retains its original physical components and explicitly possible hand,
deck or discard destinations. There is no implicit hand alternative. Board is
possible only while an eligible member survives; guaranteed board-only cards
remain in `cards`. Later departures union their destinations, and a memberless
group with one remaining destination resolves into that zone. Conditional groups
are excluded from confirmed board and known-zone totals, but remain named,
owned physical inventory counted once by original ID. A verified HP modifier
that may have stayed in play makes effective HP uncertain only for eligible
surviving holders; missing attachment metadata keeps a local probable baseline.

`loadCardDefinitions` reads only the public database. It batches names, pages in stable printing-ID order, caps each batch at 10,000 rows and caches complete results for five minutes with a 512-name bound. Generations older than 14 days are stale and cannot establish new facts. Missing schema, aborts, invalid records, truncation and failures degrade to explicit unknown coverage. There are no provider calls per frame or per card during playback. Published primary-provider images also supply representative artwork without another lookup; missing images retain the bounded optional artwork fallback. Images never identify the printing used in a game or establish its HP.

Resolution indexes names once, preserves every candidate and optionally narrows with supplied printing IDs or recorded effect names. Printed HP is established independently when every remaining candidate has the same known HP, even if other text differs. Full definition agreement additionally compares supplied functional fields. Conflicting/missing HP and incomplete coverage produce null HP. Neither artwork nor card-name guesses establish HP.

## Verification and release

The existing catalogue and replay tests own pure normalisation, candidate agreement, trainer projection and consumer behavior. `sql/verification/card-definition-catalog.sql` exercises staged visibility, public read-only grants, exact-count publication, rollback, completed immutability and retention against the actual migration. Run it through the disposable local migration rehearsal after committing the migration and verification file. A separate two-session test is required to prove concurrent staging/publication behavior; a single-session SQL result must not be described as concurrency evidence.

Initial full-catalogue release evidence separately records the original migration deployment and first full published generation. This retained-generation release uses that existing schema and must separately verify its reduced publication, workflow success, active/total row counts under the normal retention policy, refreshed public scope/payload and consumer behavior. Local gates do not establish successful production publication.

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

### Rule field evidence

`ruleEvidence` separates the Pokémon rules field from provider row coverage.
Older generations and omitted metadata mean `unknown`; neither `rules: null`
nor an unreviewed empty array proves there is no Rule Box. Primary or pinned
historical nonempty text has `verified_present` with `scope: supplied_text` and
exact provider, revision, printing ID and source URL. This proves the supplied
field text only. It does not certify that every printed rule or passive effect
was captured. Normalization does not accept a caller's completeness status.

Pokémon rules can now be supplemented independently of attack/Ability gaps,
after the same strict historical printing identity and existing effect checks.
For example, the primary and historical `swsh4-44` Pikachu VMAX definitions agree
on the exact ID, set, collector number, 310 HP, VMAX stage, release date and
G-Max Volt Tackle text, damage and Energy cost. Its historical VMAX rule can be
retained with field provenance while leaving the primary attack/Ability arrays
and printed HP unchanged. `sv06-130` still cannot join historical `sv6-130`:
there is no heuristic set/printing alias or same-name rule inheritance. Missing,
empty, malformed or conflicting secondary fields remain unverified.

`scope: printed_rule_box` requires an authored exact-printing scan registry,
whose identity, full rule text/status, inspection date, source URL and image
SHA256 are validated on read. The independently re-inspected Solrock scans at
`https://static.dextcg.com/cards/tk8a/12.png` and
`https://static.dextcg.com/cards/tk8a/26.png` establish `verified_absent` for only
`tk-xy-latio-12` and `tk-xy-latio-26`: each shows Basic Solrock, 80 HP, the
recorded attacks, the exact collector number and no Rule Box. No other printing
inherits that absence. Their reviewed rule evidence is separate from the older
attack supplement's provenance.

`hasCompletePokemonRuleBoxEvidence` is an opt-in proof prerequisite. It requires
complete provider candidate rows and reviewed complete Rule Box evidence for
every compatible Pokémon printing; sourced fragments, stale data, legacy rows
and a single unknown candidate fail closed. It certifies only the Rule Box
field. Abilities, Ancient Traits, held-item text and any other printed passive
fields still require their own completeness and semantic checks. It is not
enabled as a broad replay guard, and unknown rules do not hide independently
known printed HP. A fresh reference generation, readback, refreshed caches and
real saved-log verification remain separate release steps; no production
publication is implied by this foundation change.

### Complete printed passive fields

`reviewed-pokemon-rules.json` is the durable exact-printing registry. In addition
to the two Rule Box-only Solrock reviews, 50 separately approved full operative
card reviews retain literal Rule Boxes and the complete Ability name/text/type
set, with independently verified absence of any additional Ancient Trait,
held-item or other passive text. Twenty-five of these printings have a Rule Box
and twenty-five do not. Each entry retains exact primary identity, printed HP
and stage, scan URL, SHA256 and inspection date. The private review report,
local file paths and images are not runtime inputs. The source review artifact
was frozen as SHA256
`92aa36f93f5bbc781216d5adc12c903519e0e79ff4eed9a3ffa2919f6f2e1a55`.

Optional `additionalPassiveTraits` retains intrinsic printed trait name/text/type
outside the Ability field. Omitted or null is unknown; supplied empty arrays alone
prove no absence. An exact full operative scan with approved absence may add an
empty inventory fingerprint. Present or conflicting traits are preserved and
refuse an absence certificate. This field does not describe held items attached
to the Pokémon during a game.

Optional `passiveEvidence` has `status: verified_complete` and
`scope: printed_passive_inventory` only when the current exact Rule Box and
complete primary Ability set/text still match that reviewed entry and the scan independently confirms
there are no additional intrinsic printed passive traits. Review admission never replaces
the primary Ability array. Missing, contradictory or additional Abilities may
retain separately verified Rule Box evidence but cannot obtain whole-passive
completeness. Metadata absent from older rows remains unknown and does not hide
independently known printed HP. A stale certificate is removed on reviewed
application; shape-valid older rows still retain source facts for stale Rule Box
and passive certificates, while trusted
completeness checks independently reject mismatched provenance or field inventory.
Malformed metadata remains invalid. Full-sync producers use the stronger
`isProducedCardDefinition` validator, so a new generation cannot publish stale or
forged certificates merely because their shapes are compatible.

`hasCompletePokemonPassiveEvidence` requires complete candidate row coverage
and independently admitted complete passive fields for every compatible
printing. It is separate from Rule Box-only completeness, and certifies the
intrinsic printed source-text inventory rather than modeled semantics of every
supplied effect. It does not certify format legality or held-item/attached-card
inventory and effects. Replay consumers must still understand each relevant prevention, HP modifier,
attack permission or other clause before certifying a causal route. Neither
predicate is enabled as a broad replay behavior change by this catalog update.

Three individually approved exact source correspondences have separate mapping
evidence; there is no padding rule, set-ID rewrite or inferred reprint family:

| Primary printing | Exact scan/source correspondence | Evidence |
| --- | --- | --- |
| `mep-025` | [MEP 25](https://limitlesstcg.com/cards/MEP/25), printed MEP EN 025 | Exact name, 300 HP, Basic stage, Run Errand and native attack match the primary definition; full scan URL/hash are in the registry. |
| `mep-056` | [MEP 56](https://limitlesstcg.com/cards/MEP/56), printed MEP EN 056 | Exact printed identity and every supplied native effect match the primary definition; full scan URL/hash are in the registry. |
| `2021swsh-11` | Historical `mcd21-11` and its [exact 11/25 scan](https://images.pokemontcg.io/mcd21/11_hires.png) | The exact McDonald's Collection 2021 set manifest, collector 11, Torchic name, 60 HP, Basic stage and Ember clause were independently reconciled. The reviewed card manifest SHA256 is `66dff89417c2867903cec3941552824fb291b0be5bbc4be190d0d6d204e3df23`; set manifest SHA256 is `9df2f1e4de63037925ced583afc1fa7cf807e0f1240b21f292f0eea2782a3859`. |

The lower-resolution `30th-100` Yveltal scan was initially withheld by its
independent reviewer. Root separately inspected the original full image and
read the operative Ability/attack regions and J/30C EN 100/128 collector before
approving its field completeness. That review does not certify the readability
of tiny copyright text. Unreadable or unmapped future scans stay unknown.

Two further reviewed overlays supply only the missing rules for HS Trainer Kit
Energy Switch `tk-hs-g-21` (Gyarados 21/30) and `tk-hs-r-29` (Raichu 29/30).
The exact English scans linked from [Border City Games](https://www.bordercitygames.ca/products/energy-switch-gyarados-hgss-trainer-kit-gyarados-raichu)
and [Gnome Games](https://gnomegames.com/products/energy-switch-raichu-hgss-trainer-kit-gyarados-raichu-85261)
were inspected on 2026-10-03. Both show the same Basic Energy movement rule and
the generic printed Trainer label. Their modern subtype remains absent; the
overlay does not manufacture an Item label. Exact printing ID, set, collector
number, name, category and missing rules are checked before supplementation.
Provenance records each scan and its corresponding printing page. The runtime
can establish an instantaneous discard destination through functional rule
agreement with verified Item reprints, without changing those printed identities.
The overlay takes effect for production only after a new full catalogue generation
is published through the reference-data workflow and read back by the consumer.

The missing effect for Poké Pad `30th-126` is also supplied from its
[exact TCGdex scan](https://assets.tcgdex.net/en/me/30th/126/high.webp), inspected
on 2026-10-03. It visibly identifies Poké Pad, Item, regulation J and 126/128;
its effect searches the deck for a Pokémon without a Rule Box and puts it into
the hand. The overlay checks the exact source ID, set, collector number, name,
category, supplied Item subtype and missing rules, retains the primary artwork
and identity, and records only `rules` as supplemented. It does not borrow text
from another printing.

### Exact printed regulation evidence

`reviewed-regulation-marks.json` admits only six independently inspected exact
mark fields, with full scan URL/hash and review date. Grookey `2021swsh-8` has D;
Yveltal `30th-100` has J. Chikorita `2021swsh-2`, Torchic `2021swsh-11`, Mew ex
`cel25cc-CC013` and Metagross `30th-c-003` have no printed regulation mark.
This distinguishes actual printed absence from a provider null; it does not
certify older-card legality or functional reprint equivalence.

The authored McDonald's 2021 correspondences for collectors 2, 8 and 11 were
verified against the exact historical set/card manifests and full printed
collector/footer, name, HP, stage and native effects. The Mew correspondence
`cel25cc-CC013` to historical `cel25c-88_A` was independently checked against
printed 88/92 EX LM and the anniversary stamp plus Versatile/Power Move.
Metagross uses its exact Illudex `30th-c-003` scan, showing the anniversary mark
and printed 11/113 EX Delta Species. This is a mark-only review: missing primary
Delta Control/dual-type traits remain missing and cannot obtain a whole-passive
certificate. These enumerated correspondences do not enable generic ID or
collector translation. The four-card review receipt was frozen as SHA256
`3208f7c5accaf148e591ed1aba5b05d4344ebbf9443cdc6d52336ac858aef71d`.

### Source Energy type and mark spelling

Optional `energyType` retains the exact source `Normal`/`Special` discriminator;
omitted or null remains unknown. It is not a complete Basic Energy certificate.
The inspected source labels some cards with clearly supplied Special Energy
effects as `Normal`, so retention and replay classification must also require
compatible intrinsic printed identity and effects. Old plain Darkness/Metal
Energy names do not establish Basic status by themselves.

Single-letter regulation values are canonicalized to uppercase, retaining
`rawRegulationMark` when their source spelling differs. This preserves an exact
supplied mark rather than inferring one from a name, release date or another
printing. Missing, `None` and unsupported values remain unknown. The exact
`mep-051` REST record independently confirmed lowercase `j`; its canonical value
is `J`, with the original spelling retained.

### Published artwork

Optional `imageUrl` comes from TCGdex's own card image prefix and documented
`/high.webp` suffix (https://tcgdex.dev/assets). The source adapter accepts only
HTTPS assets.tcgdex.net English card paths, without credentials, query or fragment.
This optional field travels with the same cached public definition lookup and can
supply representative art without another provider request. It never establishes
printing identity, HP, or rules; missing art remains optional. Historical or
reviewed effect enrichment preserves this primary-provider image unchanged.
