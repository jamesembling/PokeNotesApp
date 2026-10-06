# PTCGL replay tools: hands-on comparison

Checked 4 October 2026. PokeNotes baseline: `86a4ec00d3a8309e3dd5a0a5854aa928f9a4b68a`. Research and comparison only; no product implementation, test-suite edits, database writes or deployment.

## Finding

This search did not establish a mature, clearly licensed open-source visual engine that would be a sensible replacement for Battle Replay. PTCGL Replay+ is the strongest public-code candidate found, but its licence is unclear and its reconstruction has concrete errors. Hosted PTCGL Replay is a useful benchmark: it correctly handles the clean opening counts where ours does not. None of the four tested reconstruction paths reproduced the full benchmark without observed problems.

This is one public game, tested as a full log and an opening-only excerpt. It is a targeted comparison, not a representative accuracy ranking or the project's three-game acceptance gate. The full log contains genuine PTCGL owner-name and draw-wording inconsistencies; those are distinct from the clean opening checkpoint.

## Candidates and what was actually tested

| Tool | Source/licence | Verification and result |
| --- | --- | --- |
| [PTCGL Replay+](https://github.com/tchen0623/pokemon_tcg_log_replay) | Full public HTML/JS; no established open-source licence. README says learning/exchange only. Pinned `71d6d77066a713a689e39ed6618620a155d2e4e4`, 6 September 2026. | Ran locally without installing dependencies. Imported full public log, inspected final board and timeline. Also executed its actual parser, card matcher and state engine on both inputs. Useful board, attachments, piles, speeds, scrubbing, stats and turn controls; predominantly Chinese UI. Wrong deck counts, stale Iron Bundle, missing Fezandipiti and unrecognised ending wording. |
| [PTCGL Replay](https://www.ptcglreplay.com/) | Hosted app, v0.4.5 in tested UI; creator says [repository is private](https://www.reddit.com/r/PTCGL/comments/1vs3hxe/ptcgl_replay_update_v041_early_mobile_support_bug/). Unrelated to asherkobin's similarly named repository. | Imported both public files in browser; exercised end navigation and inspected board, counts and action log. Correct clean opening counts. Full ending displayed no Stadium, retained discarded Iron Bundle, and showed the surviving Raikou V on the Bench with an empty Active Spot. Useful speed buttons, card detail and action/turn stepping. Sharing button observed; sharing was not exercised. |
| [Dead Draw](https://deaddraw.app/) | Hosted; no published engine licence established. [Terms](https://deaddraw.app/terms) describe platform code as the operator's property. | Pasted both public inputs into homepage Watch Replay. Observed playback, paused, scrubbed to end, inspected board and post-game summary. Wrong opening hand/deck counts; retained discarded Iron Bundle. Recognised winner, but summary compared Shinwrld with a spurious `Turn # 1 - Shinwrld` player. Good review ideas: card viewer, event type, stats and board overlays. Comments, annotations, coaching, save and share were not exercised. |
| [asherkobin/PTCGL-Replay](https://github.com/asherkobin/PTCGL-Replay) | Public prototype; no licence. Pinned `ee3e9f8718c4e49f5b5815fdb17e2aaea5a99eb8`. | Served unmodified checkout locally. Page remained blank/black. `config-manager.js` imports extensionless `./state-manager`; that request returned 404 from a normal static server. Source also shows setup-only parsing and placeholder state. No complete game could be replayed. |
| [hugoniceas/ptcgl-log-to-replay](https://github.com/hugoniceas/ptcgl-log-to-replay) | Public WIP; no licence. Pinned `02058839ea1b71ac0917b5fceb4cf1373d50833a`. | Source inspection only: web page remains Turborepo starter, parser entrypoint/metadata are empty, setup splitter is skeletal. No functional viewer to benchmark; not claimed as runtime-tested. |
| [kagd/pokemon-tcg-battle-replay](https://github.com/kagd/pokemon-tcg-battle-replay) | Package metadata declares ISC, without LICENSE text. Pinned `7402a50eeb840e80203105efe360fad6eeeb61f2`. | Source inspection only: Azure OpenAI text-to-JSON parser, no visual viewer. Requires endpoint/key/deployment. Did not provision a paid model service. Its public sample log supplied the common benchmark. |

[PTCGTools Replayer](https://replay.ptcgtools.com/en) and [poko replay](https://poko.cards/replay) were discovered but not hands-on tested; published engine source was not established. MIT-licensed [CABT Replay Viewer](https://github.com/Leundai/cabt-replay-viewer) consumes Kaggle simulator replays, not exported PTCGL text. Pocket and Showdown tools likewise use different games/formats.

## Shared opening checkpoint

Inputs are [battle.txt](https://github.com/kagd/pokemon-tcg-battle-replay/blob/7402a50eeb840e80203105efe360fad6eeeb61f2/sampleBattleReplays/battle.txt) and [battle-short.txt](https://github.com/kagd/pokemon-tcg-battle-replay/blob/7402a50eeb840e80203105efe360fad6eeeb61f2/sampleBattleReplays/battle-short.txt). The short file ends after **both players' first turns**, not after the first player's turn.

Expected values were independently derived from the log and the normal 60-card/6-Prize setup rule. Hidden card identities remain unknown.

| Reconstruction | Shinwrld hand / deck | gklinsing hand / deck | Opening count verdict |
| --- | --- | --- | --- |
| Independently expected | 5 / 46 | 3 / 42 | Reference |
| PokeNotes compiler + public catalogue | 5 / 46 | **4 / 41** | Opponent hand/deck wrong |
| Hosted PTCGL Replay | 5 / 46 | 3 / 42 | Correct at this checkpoint |
| PTCGL Replay+ | 5 / **52** | 3 / **48** | Six Prize cards not subtracted from each deck |
| Dead Draw | **6 / 51** | 3 / **50** | Multiple hand/deck errors |

Arithmetic:

- Shinwrld hand: `7 - Drifloon - Ralts + turn draw - Energy attachment = 5`; deck: `60 - 7 - 6 - turn draw = 46`.
- gklinsing hand: `7 - Raikou + turn draw + Fleet-Footed - Ultra Ball - 2 discards + searched Miraidon - Miraidon played - Energy - Forest Seal Stone = 3`.
- gklinsing deck: `60 - 7 - 6 - turn draw - Fleet-Footed - searched Miraidon - 2 Tandem Unit Pokémon = 42`. Discard: Ultra Ball, Bravery Charm, Basic Lightning Energy. Both players retain six Prizes.

**PokeNotes defect:** immediately before Forest Seal Stone attachment, hand/deck are correctly 4/42. Immediately afterwards they become 4/41, rather than 3/42. Fleet-Footed explicitly drew that Stone into hand. The observed attachment transition takes it from the wrong zone. The opening still reports **zero unresolved actions**, demonstrating why unresolved counts alone cannot certify fidelity.

## Full-game checkpoints

| Checkpoint | PokeNotes | Replay+ | Hosted PTCGL Replay | Dead Draw |
| --- | --- | --- | --- | --- |
| Area Zero Underdepths remains in play at ending | Retained | Retained | Missing: shows No Stadium | Retained |
| Iron Bundle discarded by Hyper Blower leaves board | **Still on Bench** | **Still on Bench** | **Still on Bench** | **Still on Bench** |
| Logged Fezandipiti ex remains on Bench at ending | Present | **Missing** | Present | Present |
| Surviving Raikou V occupies Active Spot at ending | Active | Active | **On Bench; Active empty** | Active |

The missing Iron Bundle departure is visible immediately after Hyper Blower in our compiler output, with **no unresolved marker on that action**. The log explicitly records `gklinsing discarded Iron Bundle`; this is not hidden information. Do not attribute a specific code cause without a separate diagnosis.

PokeNotes full output: **103 grouped source actions, 20 unresolved actions**, and later hand/deck/discard totals unknown. Replay+ groups the same source into 145 actions and reports three unrecognised main lines. Hosted PTCGL Replay uses 135 states including the starting state; Dead Draw uses 204 events. These denominators and uncertainty policies differ: do not compare their counts as accuracy percentages.

## PokeNotes verification boundary

The public inputs ran through the production section parser and `compileBattleReplay`, with the existing public card-definition loader and effect resolver. Catalogue coverage was complete for 15 queried names in the opening and 37 in the full game. No linked Deck List or known format was supplied. This broadly mirrors the route's catalogue-backed compiler path, but the harness does not execute its legacy catalogue fallback, artwork hydration, database persistence or full route. Thus the hand/deck finding is a verified module-path defect; reproduce through the saved-log route before a production fix.

Separately, authenticated localhost Battle Replay was opened on an existing test-account game. Action advance, turn advance and Play/Pause controls were exercised. That UI game differs from the public benchmark; it is not an end-to-end same-log comparison. No benchmark was saved into an account or shared publicly. Product files and existing tests were unchanged; added/executed repository test-case delta **0**.

## Recommendation

Keep our engine and use competitors as evidence and interaction references. The immediate priorities exposed here are hand-origin attachment bookkeeping and discarding in-play Pokémon through Ability details. Use independently expected turn-end boards/counts as the comparison gate; unresolved-action counts miss silent mistakes. Replay+ is worth reading for its lightweight local viewer and card/pile presentation, while hosted PTCGL Replay is worth studying for playback and its correct opening arithmetic. Establish a reusable licence before copying any candidate implementation.

## Evidence

Saved outputs, harnesses, source verification and screenshots: `/Users/jamesembling/Documents/Codex/artifacts/ptcgl-replay-comparison-2026-10-04/`. Temporary candidate checkouts are under `/tmp/pokenotes-replay-comparison/`; no dependencies were added to PokeNotes.

- [PTCGL Replay opening screenshot](/Users/jamesembling/Documents/Codex/artifacts/ptcgl-replay-comparison-2026-10-04/ptcgl-replay-opening.png)
- [Replay+ full ending screenshot](/Users/jamesembling/Documents/Codex/artifacts/ptcgl-replay-comparison-2026-10-04/replay-plus-ending.png)
- [Dead Draw opening screenshot](/Users/jamesembling/Documents/Codex/artifacts/ptcgl-replay-comparison-2026-10-04/dead-draw-opening.png)
- [PokeNotes opening frames](/Users/jamesembling/Documents/Codex/artifacts/ptcgl-replay-comparison-2026-10-04/battle-short.txt.pokenotes.json)
- [PokeNotes full frames](/Users/jamesembling/Documents/Codex/artifacts/ptcgl-replay-comparison-2026-10-04/battle.txt.pokenotes.json)
- [Detailed source verification](/Users/jamesembling/Documents/Codex/artifacts/ptcgl-replay-comparison-2026-10-04/pokenotes-replay-comparison-sources.md)

SHA-256: full `b8c12674c686efd7cc5b682f61c78166ad04b40062fc52901cfa7a51ee045f75`; opening `c180ca33a02e3cb660db158c48dd886a7576beaec50412e740add59c4d678100`.
