import assert from "node:assert/strict";
import test from "node:test";
import { compileBattleReplay, type ReplayLogSource } from "@/lib/battle-replay/compiler";
import type { LogAction, LogSection } from "@/types/index";
import type { ReplayCard, ReplaySide, ReplayZoneCard } from "@/lib/battle-replay/types";
import { collectMissingReplayArtworkNames, resolveReplayArtwork, selectReplayArtworkPrinting } from "@/lib/battle-replay/artwork";
import { createReplayHpContext, replayCardDefinitionEvidence } from "@/lib/battle-replay/hp";
import { selectExactReplayArtwork } from "@/lib/battle-replay/selected-artwork-server";
import { collectReplayDefinitionNames } from "@/lib/battle-replay/metadata";
import { resolveEnergyMarkers, resolveReplayCardPreviewDefinition } from "@/lib/battle-replay/preview";
import { collectReplayPrintingProofs } from "@/lib/battle-replay/printing-proofs";
import { canonicalReplayGame, expectedGameChanges, syntheticCardDefinition, type ExpectedSide } from "./fixtures/battle-replay-game";

import { getLinkedReplayDefinitions, getReplayLinkedDeckListCompatibility } from "@/lib/battle-replay/linked-deck-list";
import { buildCardDefinitionIndex, resolveCardDefinition } from "@/lib/card-definition-catalog/resolve";

const action = (title: string, details: string[] = []): LogAction => ({ title, details });
const section = (player: string, actions: LogAction[]): LogSection => ({
  title: player ? `${player}'s Turn` : "Setup", player, actions,
  prizesAfterTurn: { PlayerOne: 6, PlayerTwo: 6 },
});

function source(sections: LogSection[]): ReplayLogSource {
  return {
    id: "synthetic-owned-log", date: "2026-10-01", result: "Unknown", format: "Synthetic",
    selfPlayerName: "PlayerOne", opponentPlayerName: "PlayerTwo", selfDeckName: "First deck", opponentDeckName: "Second deck",
    selfPrizesTaken: 1, opponentPrizesTaken: 0, totalTurns: 1, sections,
  };
}

// 9/10: direct production compiler boundary; independent expected frames protect
// ordering, recorded transitions and the serializable Server Component contract.
test("saved Battle Log actions compile into deterministic source-faithful frames", async () => {
  const complete = compileBattleReplay(canonicalReplayGame);
  const projectCard = (card: ReplayCard | null) => card && ({
    name: card.name, damage: card.damage, energy: card.energy,
    underlying: card.underlying.map((item) => item.name), conditions: card.conditions ?? [], tool: card.tool ?? null,
  });
  const projectSide = (side: ReplaySide) => ({
    active: projectCard(side.active), bench: side.bench.map(projectCard), hand: side.handCount,
    known: side.knownHand.map((card) => card.name), discard: side.discard.map((card) => card.name),
  });
  const blank: ExpectedSide = { active: null, bench: [], hand: 0, known: [], discard: [] };
  let expected = { self: structuredClone(blank), opponent: structuredClone(blank), stadium: null as string | null };
  const expectedFrames = [structuredClone(expected)];
  for (const change of expectedGameChanges) {
    expected = { self: { ...expected.self, ...change.self }, opponent: { ...expected.opponent, ...change.opponent }, stadium: change.stadium === undefined ? expected.stadium : change.stadium };
    expectedFrames.push(structuredClone(expected));
  }
  assert.equal(complete.frames.length, expectedFrames.length);
  complete.frames.forEach((frame, index) => {
    assert.deepEqual({ self: projectSide(frame.self), opponent: projectSide(frame.opponent), stadium: frame.stadium?.name ?? null }, expectedFrames[index], `frame ${index}: ${complete.events[index - 1]?.sourceTitle ?? "initial"}`);
    const selfDeck = index === 0 ? 60 : index < 5 ? 53 : index < 6 ? 47 : index < 7 ? 45 : index < 17 ? 43 : index < 30 ? 42 : index < 31 ? 44 : 41;
    const opponentDeck = index < 2 ? 60 : index < 5 ? 53 : index < 12 ? 47 : 46;
    assert.equal(frame.self.deckCount, selfDeck, "complete setup establishes 60 minus recorded draws and six setup Prizes");
    assert.equal(frame.opponent.deckCount, opponentDeck, "hidden card identities do not hide public zone totals");
    for (const actor of ["self", "opponent"] as const) {
      const side = frame[actor];
      const physicalInPlay = [side.active, ...side.bench].reduce<number>((total, card) => total + (card ? 1 + card.underlying.length + card.energy.length + Number(Boolean(card.tool)) : 0), 0)
        + Number(frame.stadium?.actor === actor);
      assert.equal(side.inPlayCount, physicalInPlay, "in-play totals count physical cards rather than occupied Pokémon slots");
      assert.equal(side.discardCount, side.discard.length, "complete discard evidence agrees with its independent pile total");
      assert.equal(side.deckCount! + side.handCount! + side.prizesRemaining! + side.inPlayCount! + side.discardCount!, 60, "every settled complete frame conserves all sixty physical cards");
    }
    for (const side of [frame.self, frame.opponent]) for (const card of [side.active, ...side.bench]) if (card) assert.equal(card.hp, null);
  });
  assert.deepEqual(complete.diagnostics.unresolvedActions, []);
  assert.deepEqual(complete, compileBattleReplay(canonicalReplayGame));
  const serialized = JSON.parse(JSON.stringify(complete));
  for (const position of [34, 0, 22, 7, 26, 34, 1]) assert.deepEqual(serialized.frames[position], complete.frames[position], "seeking never recomputes or changes the immutable recorded frame");
  assert.equal(complete.frames[7].self.active?.abilityUsed, true);
  assert.equal(complete.frames[28].self.prizesRemaining, 5);
  assert.deepEqual(resolveEnergyMarkers(["Grass", "Grass", "Grass", "Grass", "Grass", "Fire"]), [{ type: "Grass", count: 5 }, { type: "Fire", count: 1 }]);
  assert.deepEqual(resolveEnergyMarkers(Array(6).fill("Grass")), [{ type: "Grass", count: 6 }]);
  assert.deepEqual(resolveEnergyMarkers(["Grass", "Grass", "Grass", "Double Turbo Energy", "Double Turbo Energy", "Double Turbo Energy"]), [{ type: "Grass", count: 3 }, { type: "Double Turbo Energy", count: 3 }]);
  assert.deepEqual(resolveEnergyMarkers(["Grass", "Fire"]), [{ type: "Grass" }, { type: "Fire" }]);
  assert.deepEqual(resolveEnergyMarkers([]), []);
  const plain = { name: "Seedling", set: "TWM", number: "1" };
  assert.equal(selectReplayArtworkPrinting("Seedling", [{ ...plain, name: "Seedling ex" }]), null);
  assert.deepEqual(selectReplayArtworkPrinting("Seedling", [{ ...plain, name: "Seedling ex" }, plain]), plain);
  const printingPage = `<select data-card-language data-location="MEP/56"></select><p class="card-text-title"><span class="card-text-name"><a href="/cards/MEP/56">Torchic</a></span> - Fire - 60 HP</p><div class="card-image"><img src="https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/MEP/MEP_056_R_EN.png"></div>`;
  const exactPrint = { name: "Torchic", localId: "056", hp: 60 };
  assert.deepEqual(selectExactReplayArtwork(printingPage, exactPrint, "MEP"), { imageUrl: "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/MEP/MEP_056_R_EN.png", sourceUrl: "https://limitlesstcg.com/cards/MEP/56" });
  assert.equal(selectExactReplayArtwork(printingPage, { ...exactPrint, hp: 70 }, "MEP"), null, "same-name artwork with different HP is not the selected printing");
  assert.equal(selectExactReplayArtwork(printingPage, { ...exactPrint, localId: "52" }, "MEP"), null, "another collector number cannot supply this printing's artwork");
  assert.equal(selectExactReplayArtwork(printingPage.replace("Torchic", "Torchic ex"), exactPrint, "MEP"), null, "the full canonical name must agree");
  assert.equal(selectExactReplayArtwork(printingPage.replace("limitlesstcg.nyc3.cdn.digitaloceanspaces.com", "example.com"), exactPrint, "MEP"), null, "external artwork must stay on the admitted provider");
  const artSource = compileBattleReplay(source([section("", [
    action("PlayerOne played Seedling to the Active Spot."),
    action("PlayerOne played Seedling to the Bench."),
    action("PlayerTwo played Other to the Active Spot."),
  ])]));
  assert.deepEqual(collectMissingReplayArtworkNames(artSource), ["Seedling", "Other"]);
  const lookupLines = ["PlayerOne played Seedling to the Active Spot.", "PlayerOne played Seedling to the Bench.", "PlayerTwo played Other to the Active Spot.", "PlayerOne's Seedling used Gather.", "PlayerOne attached Forest Seal Stone to Seedling in the Active Spot."];
  const definitionNames = collectReplayDefinitionNames(artSource, [...lookupLines, "PlayerOne used Gather."], ["PlayerOne", "PlayerTwo"]);
  assert.ok(definitionNames.includes("Seedling"));
  assert.ok(definitionNames.includes("Forest Seal Stone"));
  assert.ok(definitionNames.every((name) => !/PlayerOne|PlayerTwo|used|played|attached|Active Spot|Bench/i.test(name)), "metadata lookup receives public card names, not player identities or action sentences");
  assert.equal(new Set(definitionNames).size, definitionNames.length);
  const linkedCards = [{ name: "Seedling", set: "TST", number: "1", count: 2 }, { name: "Seedling", set: "ALT", number: "2", count: 2 }, { name: "Basic {D} Energy", set: "ENE", number: "7", count: 56 }];
  assert.equal(getReplayLinkedDeckListCompatibility(linkedCards, ["Seedling", "Basic Darkness Energy"]).status, "compatible", "symbolic Basic Energy names agree with canonical recorded names");
  assert.deepEqual(getReplayLinkedDeckListCompatibility(linkedCards, ["Torchic"]), { status: "conflicting", missingNames: ["Torchic"] }, "a full live list cannot narrow an owned game that independently evidences an absent card");
  assert.equal(getReplayLinkedDeckListCompatibility(linkedCards.map((card) => ({ ...card, count: 1 })), ["Seedling"]).status, "unavailable", "partial inventory cannot establish a complete linked-list snapshot");
  const linkedPrints = [syntheticCardDefinition({ setId: "synthetic", localId: "1" }), syntheticCardDefinition({ sourceCardId: "synthetic-other", setId: "alternate", localId: "2", hp: 80 })];
  const linkedEvidence = { seedling: resolveCardDefinition(buildCardDefinitionIndex(linkedPrints), { name: "Seedling" }) };
  assert.equal(getLinkedReplayDefinitions(linkedCards, linkedEvidence, { synthetic: "TST", alternate: "ALT" }).seedling.candidates.length, 2, "same-name mixed printings remain separate viable instances");
  const incompleteLinked = getLinkedReplayDefinitions(linkedCards, linkedEvidence, { synthetic: "TST" }).seedling;
  assert.equal(incompleteLinked.coverage, "incomplete", "missing set mapping cannot manufacture precise printing evidence");
  const oneListedCopy = [{ ...linkedCards[0], count: 1 }, { ...linkedCards[2], count: 59 }];
  assert.equal(getReplayLinkedDeckListCompatibility(oneListedCopy, ["Seedling"], { Seedling: 2 }).status, "conflicting", "simultaneous observed copies veto an insufficient selected inventory");
  assert.equal(getReplayLinkedDeckListCompatibility(linkedCards, ["Seedling"], { Seedling: 4 }).status, "compatible", "the counts of different listed same-name printings add together");
  const incidentalWords = collectReplayDefinitionNames(artSource, ["- PlayerOne drew 2 cards and played them to the Bench.", "- PlayerOne drew Seedling and played it to the Bench.", "• 6 attached Energy: 300 damage"], ["PlayerOne", "PlayerTwo"]);
  assert.ok(incidentalWords.every((name) => !/^(?:it|them|energy:|energy )/i.test(name)), "pronouns and damage-breakdown text are not card identities");

  const noArtwork = structuredClone(artSource);
  const removeArtwork = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    Reflect.deleteProperty(value, "imageUrl");
    Object.values(value).forEach(removeArtwork);
  };
  removeArtwork(noArtwork);
  assert.deepEqual(collectReplayDefinitionNames(noArtwork, []), ["Other", "Seedling"], "card metadata discovery depends on recorded identity, not artwork fields");

  const lookedUp: string[] = [];
  const originalArtSource = structuredClone(artSource);
  const artwork = await resolveReplayArtwork(artSource, async (name) => {
    lookedUp.push(name);
    if (name === "Other") throw new Error("Synthetic provider unavailable");
    return [plain];
  });
  assert.deepEqual(lookedUp.sort(), ["Other", "Seedling"], "duplicate frame identities need only one exact-name artwork lookup");
  assert.deepEqual(Object.keys(artwork), ["Seedling"]);
  assert.match(artwork.Seedling, /TWM_001_R_EN_LG\.png$/);
  assert.deepEqual(artSource, originalArtSource, "representative artwork must not rewrite recorded identity or HP");

  const catalogueArtIndex = buildCardDefinitionIndex([
    syntheticCardDefinition({ sourceCardId: "older-art", setReleaseDate: "2025-01-01", imageUrl: "https://assets.tcgdex.net/en/sv/old/1/high.webp" }),
    syntheticCardDefinition({ sourceCardId: "newer-art", setReleaseDate: "2026-01-01", imageUrl: "https://assets.tcgdex.net/en/sv/new/1/high.webp" }),
    syntheticCardDefinition({ name: "Other", imageUrl: "https://assets.tcgdex.net/en/sv/new/2/high.webp" }),
  ]);
  const catalogueArt = { seedling: resolveCardDefinition(catalogueArtIndex, { name: "Seedling" }), other: resolveCardDefinition(catalogueArtIndex, { name: "Other" }) };
  let providerCalls = 0;
  const coveredArt = await resolveReplayArtwork(artSource, async () => { providerCalls++; return []; }, undefined, catalogueArt);
  assert.equal(providerCalls, 0, "covered names use stored representative artwork without an external provider lookup");
  assert.equal(coveredArt.Seedling, "https://assets.tcgdex.net/en/sv/new/1/high.webp", "the newest verified named candidate is selected deterministically");
  for (const unusableArt of [
    { ...catalogueArt.seedling, coverage: "incomplete" as const },
    { ...catalogueArt.seedling, candidates: catalogueArt.seedling.candidates.map((card) => ({ ...card, name: "Seedling ex" })) },
    { ...catalogueArt.seedling, candidates: catalogueArt.seedling.candidates.map((card) => ({ ...card, imageUrl: "https://untrusted.invalid/card/high.webp" })) },
  ]) {
    const fallbacks: string[] = [];
    const fallbackArt = await resolveReplayArtwork(artSource, async (name) => { fallbacks.push(name); return [plain]; }, undefined, { ...catalogueArt, seedling: unusableArt });
    assert.deepEqual(fallbacks, ["Seedling"]);
    assert.match(fallbackArt.Seedling, /TWM_001_R_EN_LG\.png$/);
  }
  assert.deepEqual(artSource, originalArtSource, "stored or fallback representative artwork never rewrites replay identities or HP");

  const originTitle = "PlayerOne's Seedling used Recover.";
  const movementSource = source([section("", [
    action("PlayerOne drew 7 cards for the opening hand.", ["• Seedling, Basic Grass Energy, Supply, Buddy, Sprout, Forest Seal Stone, Double Turbo Energy"]),
    action("PlayerOne played Seedling to the Active Spot."),
    action("PlayerOne discarded a card.", ["- Basic Grass Energy"]),
    action(originTitle, ["PlayerOne attached Basic Grass Energy to Seedling in the Active Spot."]),
    action("PlayerOne played Buddy to the Bench."),
    action("PlayerOne's Seedling is now Paralyzed."),
    action("PlayerOne's Buddy was switched with PlayerOne's Seedling to become the Active Pokémon.", ["PlayerOne's Buddy is now in the Active Spot."]),
    action("PlayerOne evolved Seedling to Sprout on the Bench."),
    action("PlayerOne attached Forest Seal Stone to Sprout on the Bench."),
    action("PlayerOne attached Double Turbo Energy to Sprout on the Bench."),
    action("PlayerOne's Sprout was Knocked Out!", ["4 cards were discarded from PlayerOne's Sprout.", "• Seedling, Basic Grass Energy, Double Turbo Energy, Forest Seal Stone"]),
    action("PlayerOne moved Seedling from their discard pile to their hand."),
    action("PlayerOne shuffled Double Turbo Energy from their discard pile into their deck."),
  ])]);
  const movements = compileBattleReplay({ ...movementSource,
    effectTags: { [originTitle]: "ability", "PlayerOne attached Forest Seal Stone to Sprout on the Bench.": "tool" },
    effectOrigins: { [originTitle]: "discard" },
  });
  assert.deepEqual(movements.frames[4].self.active?.energy, ["Grass"]);
  assert.deepEqual(movements.frames[4].self.discard, []);
  assert.equal(movements.frames[4].self.handCount, 5, "catalog-proven discard attachment must not also debit hand");
  assert.equal(movements.frames[7].self.active?.name, "Buddy");
  assert.deepEqual(movements.frames[7].self.bench.map((card) => card.name), ["Seedling"]);
  assert.deepEqual(movements.frames[7].self.bench[0].conditions, [], "switching clears the outgoing Pokémon's conditions");
  assert.deepEqual(movements.frames[11].self.discard.map((card) => card.name), ["Sprout", "Seedling", "Basic Grass Energy", "Double Turbo Energy", "Forest Seal Stone"], "KO and its explicit attachment detail must discard each physical card once");
  assert.deepEqual(movements.frames[12].self.discard.map((card) => card.name), ["Sprout", "Basic Grass Energy", "Double Turbo Energy", "Forest Seal Stone"]);
  assert.deepEqual(movements.frames[13].self.discard.map((card) => card.name), ["Sprout", "Basic Grass Energy", "Forest Seal Stone"]);
  assert.equal(movements.frames[13].self.deckCount, null);
  assert.deepEqual(movements.diagnostics.unresolvedActions, []);

  const repeatedAttachment = "- PlayerOne attached Basic Grass Energy to Seedling in the Active Spot.";
  const scopedOrigins = compileBattleReplay({ ...source([section("PlayerOne", [
    action("PlayerOne drew 4 cards for the opening hand.", ["• Seedling, Basic Grass Energy, Supply, Supply"]),
    action("PlayerOne played Seedling to the Active Spot."),
    action("PlayerOne discarded Basic Grass Energy."),
    action("PlayerOne's Seedling used First.", [repeatedAttachment]),
    action("PlayerOne's Seedling used Second.", [repeatedAttachment]),
  ])]), effectTags: { "PlayerOne's Seedling used First.": "ability", "PlayerOne's Seedling used Second.": "ability" },
    effectOrigins: { [repeatedAttachment]: "hand" }, effectDetailOrigins: { "3:0": "deck", "4:0": "discard" } });
  assert.deepEqual(scopedOrigins.diagnostics.unresolvedActions, []);
  assert.deepEqual(scopedOrigins.frames[5].self.active?.energy, ["Grass", "Grass"]);
  assert.deepEqual(scopedOrigins.frames[5].self.discard, []);
  assert.equal(scopedOrigins.frames[5].self.handCount, 2, "identical attachment wording under two effects retains each effect's source zone");

  const definitions = [
    syntheticCardDefinition(),
    syntheticCardDefinition({ sourceCardId: "synthetic-2", localId: "2", hp: 90, attacks: [{ name: "Wave", text: null, damage: "20", cost: ["Grass"] }] }),
    syntheticCardDefinition({ name: "Sprout", hp: 150, stage: "Stage2" }),
    syntheticCardDefinition({ name: "Rival", hp: 100 }),
    syntheticCardDefinition({ name: "HP Tool", hp: null, category: "Trainer", trainerType: "Tool", attacks: [], rules: ["The Pokémon this card is attached to gets +100 HP."] }),
  ];
  const definitionIndex = buildCardDefinitionIndex(definitions);
  const cardDefinitions = Object.fromEntries(["Seedling", "Sprout", "Rival", "HP Tool"].map((name) => [name.toLowerCase(), resolveCardDefinition(definitionIndex, { name })]));
  const hpInput = { ...source([section("PlayerOne", [
    action("PlayerOne played Seedling to the Active Spot."),
    action("PlayerTwo played Rival to the Active Spot."),
    action("PlayerOne's Seedling used Tap on PlayerTwo's Rival for 20 damage."),
    action("PlayerTwo's Rival used Tap on PlayerOne's Seedling for 20 damage."),
    action("PlayerOne played Seedling to the Bench."),
    action("PlayerOne evolved Seedling to Sprout in the Active Spot."),
    action("PlayerOne attached HP Tool to Sprout in the Active Spot."),
  ])]), cardDefinitions, effectTags: { "PlayerOne attached HP Tool to Sprout in the Active Spot.": "tool" as const } };
  const hpReplay = compileBattleReplay(hpInput);
  assert.equal(hpReplay.frames[2].self.active?.baseHp, 70, "later native attack evidence identifies the same physical printing from its entry");
  assert.equal(hpReplay.frames[2].self.active?.hpBasis, "known");
  const beforePrintingWitness = compileBattleReplay({ ...hpInput, sections: hpInput.sections.map((entry) => ({ ...entry, actions: entry.actions.slice(0, 2) })) });
  assert.equal(beforePrintingWitness.frames[2].self.active?.baseHp, 70);
  assert.equal(beforePrintingWitness.frames[2].self.active?.hpBasis, "probable", "a representative choice never becomes proof without a later witness");
  assert.equal(hpReplay.frames[3].self.active?.baseHp, 70);
  const sourceCoverage = { scope: "tcgdex-listed-en-physical" as const, listedPrintings: 2, unlistedSets: [] };
  const narrowed = replayCardDefinitionEvidence(hpReplay.frames[3].self.active!, { seedling: { ...cardDefinitions.seedling, sourceCoverage } });
  assert.equal(narrowed?.hp, 70);
  assert.deepEqual(narrowed?.sourceCoverage, sourceCoverage, "per-instance narrowing retains the source coverage qualification");

  assert.equal(hpReplay.frames[5].self.bench[0].baseHp, 70, "another copy retains its own probable catalogue HP");
  assert.equal(hpReplay.frames[5].self.bench[0].hpBasis, "probable", "one physical copy's attack cannot identify another copy");
  assert.equal(hpReplay.frames[4].self.active?.remainingHp, 50);
  assert.equal(hpReplay.frames[6].self.active?.baseHp, 150);
  assert.equal(hpReplay.frames[6].self.active?.damage, 20, "evolution preserves damage, not remaining HP");
  assert.equal(hpReplay.frames[6].self.active?.remainingHp, 130);
  assert.equal(hpReplay.frames[7].self.active?.maxHp, 250);
  assert.equal(hpReplay.frames[7].self.active?.remainingHp, 230);
  assert.deepEqual(hpReplay.diagnostics.unresolvedActions, []);
  // Real PTCGL wording with anonymized players; public card metadata isolates
  // immutable top-printing evidence from the evolving physical stack.
  const festivalPrint = syntheticCardDefinition({ name: "Dipplin", sourceCardId: "sv06-018", setId: "sv06", localId: "018", hp: 80, stage: "Stage1", setReleaseDate: "2024-05-24", sourceUrl: "https://api.tcgdex.net/v2/en/cards/sv06-018", imageUrl: "https://assets.tcgdex.net/en/sv/sv06/018/high.webp",
    abilities: [{ name: "Festival Lead", type: "Ability", text: "If Festival Grounds is in play, this Pokémon may use an attack it has twice. If the first attack Knocks Out your opponent's Active Pokémon, you may attack again after your opponent chooses a new Active Pokémon." }],
    attacks: [{ name: "Do the Wave", text: "This attack does 20 damage for each of your Benched Pokémon.", damage: "20×", cost: ["Grass"] }] });
  const dipplinPrints = [festivalPrint, { ...festivalPrint, sourceCardId: "sv06-170", localId: "170", sourceUrl: "https://api.tcgdex.net/v2/en/cards/sv06-170", imageUrl: "https://assets.tcgdex.net/en/sv/sv06/170/high.webp" },
    { ...festivalPrint, sourceCardId: "sv10-017", setId: "sv10", localId: "017", hp: 90, setReleaseDate: "2025-05-30", sourceUrl: "https://api.tcgdex.net/v2/en/cards/sv10-017", imageUrl: "https://assets.tcgdex.net/en/sv/sv10/017/high.webp", abilities: [], attacks: [{ name: "Energy Loop", text: "Put an Energy attached to this Pokémon into your hand.", damage: "50", cost: ["Grass"] }] }];
  const dipplinSource = { ...source([
    section("", [action("PlayerTwo played Applin to the Active Spot."), action("PlayerTwo played Applin to the Bench."), action("PlayerOne played Budew to the Active Spot.")]),
    section("PlayerTwo", [action("PlayerTwo evolved Applin to Dipplin in the Active Spot."), action("PlayerTwo evolved Applin to Dipplin on the Bench.")]),
    section("PlayerOne", [action("PlayerOne drew a card.")]),
    section("PlayerTwo", [action("PlayerTwo's Dipplin used Do the Wave on PlayerOne’s Budew for 100 damage.", ["- Damage breakdown:", "• 5 Benched Pokémon: 100 damage"])]),
  ]), cardDefinitions: {
    applin: resolveCardDefinition(buildCardDefinitionIndex([syntheticCardDefinition({ name: "Applin", hp: 40, abilities: [], attacks: [] })]), { name: "Applin" }),
    dipplin: resolveCardDefinition(buildCardDefinitionIndex(dipplinPrints), { name: "Dipplin" }),
  } };
  const dipplinReplay = compileBattleReplay(dipplinSource);
  assert.equal(dipplinReplay.frames[3].opponent.active?.baseHp, 40, "later evolution evidence cannot rewrite the earlier Basic top");
  for (const frame of dipplinReplay.frames.slice(4)) {
    assert.equal(frame.opponent.active?.baseHp, 80, "native Do the Wave proves Festival Lead HP throughout this top epoch");
    assert.equal(frame.opponent.active?.hpBasis, "known");
    const resolution = dipplinReplay.cardResolutions?.[frame.opponent.active!.definitionKey!];
    assert.equal(resolution?.displayBasis, "representative", "functional agreement does not establish the exact artwork printing");
    assert.equal(resolution?.candidatePrintingIds?.length, 2);
  }
  assert.equal(dipplinReplay.frames[5].opponent.bench[0].hpBasis, "probable", "the other physical Dipplin has no native witness");
  const evolvedPreview = dipplinReplay.events[3].transaction?.stages.find((entry) => entry.kind === "evolve")?.cards[0];
  const evolvedPreviewResolution = dipplinReplay.cardResolutions?.[evolvedPreview?.definitionKey ?? ""];
  assert.equal(evolvedPreviewResolution?.printedHp, 80, "the original evolution preview uses the same later-proven top printing as the board");
  assert.equal(evolvedPreviewResolution?.hpBasis, "known");
  const noDipplinWitness = compileBattleReplay({ ...dipplinSource, sections: dipplinSource.sections.slice(0, -1) });
  assert.equal(noDipplinWitness.frames.at(-1)!.opponent.active?.baseHp, 90);
  assert.equal(noDipplinWitness.frames.at(-1)!.opponent.active?.hpBasis, "probable");

  const unwitnessedCopy = dipplinReplay.frames[5].opponent.bench[0];
  const probableFamily = resolveReplayCardPreviewDefinition(unwitnessedCopy, dipplinReplay);
  assert.equal(unwitnessedCopy.baseHp, 80, "same-owner native family guides the unproven copy's probable HP");
  assert.equal(probableFamily?.probableHpBasis, "same_owner_witnessed_family");
  assert.equal(probableFamily?.printingPreferenceBasis, "same_owner_witnessed_family");
  assert.ok(dipplinPrints.slice(0, 2).some((printing) => printing.imageUrl === probableFamily?.selectedPrinting?.imageUrl));
  assert.equal(probableFamily?.candidatePrintingIds?.length, 3, "a probable representative preference cannot prune physical alternatives");
  assert.deepEqual(unwitnessedCopy.observedEffects ?? [], [], "another copy's native effect is never inherited as proof");
  const probableEvolution = dipplinReplay.events[4].transaction?.stages.find((stage) => stage.kind === "evolve")?.cards[0] as ReplayCard;
  assert.equal(probableEvolution.baseHp, 80);
  assert.equal(probableEvolution.maxHp, 80, "the new copy's evolution snapshot uses the same probable baseline as its board display");
  const nativeResolver = createReplayHpContext(dipplinSource.cardDefinitions);
  assert.equal(nativeResolver.resolve(unwitnessedCopy)?.candidates.length, 3, "semantic definition lookup retains every viable printing");
  const nativePlan = collectReplayPrintingProofs(dipplinReplay, nativeResolver.resolve);
  // Pure display-query guards reuse the recorded source and validated native
  // plan; altered public metadata isolates ambiguity without inventing logs.
  const isolatedOwner = structuredClone(noDipplinWitness);
  createReplayHpContext(dipplinSource.cardDefinitions).applySeenPrintingPreferences(isolatedOwner, nativePlan.map((proof) => ({ ...proof, actor: "self" as const })));
  assert.equal(isolatedOwner.frames.at(-1)!.opponent.bench[0].baseHp, 90, "a different player's witnessed family cannot select this owner's version");
  const exactTarget = structuredClone(noDipplinWitness);
  const exactBench = exactTarget.frames.at(-1)!.opponent.bench[0];
  Object.assign(exactBench, { setId: "sv10", localId: "017" });
  const exactContext = createReplayHpContext(dipplinSource.cardDefinitions);
  exactContext.update(exactTarget.frames.at(-1)!); exactContext.decorateState(exactTarget.frames.at(-1)!);
  exactContext.applySeenPrintingPreferences(exactTarget, nativePlan);
  const exactResolution = exactContext.collectResolutions()[exactBench.definitionKey!];
  assert.equal(exactBench.baseHp, 90, "recorded printing identity wins over a sibling's preferred native family");
  assert.equal(exactResolution.displayBasis, "played_evidence");
  assert.equal(exactResolution.printingPreferenceBasis, undefined);
  const swapPlayers = (text: string) => text.replaceAll("PlayerOne", "PlayerTemporary").replaceAll("PlayerTwo", "PlayerOne").replaceAll("PlayerTemporary", "PlayerTwo");
  const linkedChoice = { dipplin: { ...resolveCardDefinition(buildCardDefinitionIndex([dipplinPrints[2]]), { name: "Dipplin" }), evidenceBasis: "linked_deck_list" as const } };
  const linkedDisplay = compileBattleReplay({ ...dipplinSource, selfCardDefinitions: linkedChoice,
    sections: dipplinSource.sections.slice(0, -1).map((entry) => ({ ...entry, player: swapPlayers(entry.player),
      actions: entry.actions.map((entry) => ({ ...entry, title: swapPlayers(entry.title), details: entry.details.map(swapPlayers) })) })),
  });
  const linkedContext = createReplayHpContext(dipplinSource.cardDefinitions, undefined, linkedChoice);
  linkedContext.applySeenPrintingPreferences(linkedDisplay, nativePlan.map((proof) => ({ ...proof, actor: "self" as const, setId: "sv06", localId: "018" })));
  const linkedBench = linkedDisplay.frames.at(-1)!.self.bench[0];
  linkedContext.decorateCard(linkedBench);
  assert.equal(linkedBench.baseHp, 90, "accepted linked-list printing wins over another copy's witnessed family");
  assert.equal(linkedContext.collectResolutions()[linkedBench.definitionKey!].probableHpBasis, "linked_deck_list");

  const mixedDefinitions = { ...dipplinSource.cardDefinitions, dipplin: resolveCardDefinition(buildCardDefinitionIndex([
    ...dipplinPrints.slice(0, 2), { ...dipplinPrints[2], attacks: festivalPrint.attacks },
  ]), { name: "Dipplin" }) };
  const mixedPreference = structuredClone(noDipplinWitness);
  createReplayHpContext(mixedDefinitions).applySeenPrintingPreferences(mixedPreference, nativePlan);
  assert.equal(mixedPreference.frames.at(-1)!.opponent.bench[0].baseHp, 90, "incompatible native-supported gameplay families refuse a probable preference");
  const equalHpDefinitions = { ...dipplinSource.cardDefinitions, dipplin: resolveCardDefinition(buildCardDefinitionIndex(dipplinPrints.map((printing) => ({ ...printing, hp: 80 }))), { name: "Dipplin" }) };
  const equalHpReplay = compileBattleReplay({ ...dipplinSource, cardDefinitions: equalHpDefinitions });
  const equalHpBench = equalHpReplay.frames[5].opponent.bench[0];
  const equalHpResolution = resolveReplayCardPreviewDefinition(equalHpBench, equalHpReplay);
  assert.equal(equalHpBench.hpBasis, "known", "independent HP agreement remains known while printing choice is representative");
  assert.equal(equalHpResolution?.printingPreferenceBasis, "same_owner_witnessed_family");
  assert.ok(dipplinPrints.slice(0, 2).some((printing) => printing.imageUrl === equalHpResolution?.selectedPrinting?.imageUrl), "equal HP cannot suppress the preferred gameplay family artwork");
  assert.equal(equalHpResolution?.candidatePrintingIds?.length, 3);

  const setterDefinitions = { ...dipplinSource.cardDefinitions,
    dipplin: resolveCardDefinition(buildCardDefinitionIndex(dipplinPrints.map((printing) => ({ ...printing,
      abilities: [...printing.abilities, { name: "HP Setter", type: "Ability", text: "The maximum HP of each of your Dipplin in play is now 130." }],
    }))), { name: "Dipplin" }),
  };
  const setterProgram = structuredClone(noDipplinWitness);
  const setterContext = createReplayHpContext(setterDefinitions);
  const setterFrame = setterProgram.frames.at(-1)!;
  const setterBench = setterFrame.opponent.bench[0]; setterBench.tool = "Unverified Tool";
  setterContext.update(setterFrame);
  assert.equal(setterBench.maxHp, 130);
  assert.equal(setterBench.hpBasis, "probable", "unverified attachment does not prove that an independently known setter disappeared");
  const setterSnapshot = structuredClone(setterBench);
  setterContext.copySnapshotHpProvenance([setterBench], [setterSnapshot]);
  const lastEvent = setterProgram.events.at(-1)!;
  lastEvent.transaction = { actor: "opponent", title: "Printing display projection", stages: [{ kind: "evolve", label: "Snapshot", actor: "opponent", cards: [setterSnapshot] }] };
  setterContext.applySeenPrintingPreferences(setterProgram, nativePlan);
  assert.equal(setterBench.baseHp, 80);
  assert.equal(setterBench.maxHp, 130, "probable printed HP preference does not change a known effective-HP setter");
  assert.equal(setterSnapshot.baseHp, 80);
  assert.equal(setterSnapshot.maxHp, 130, "transaction snapshots preserve setter provenance even with an unverified attachment");

  // Anonymized recorded placements, native attacks, switch and KO wording.
  // Unrelated source actions are omitted; attachment/position uncertainty may
  // not erase an independently proven physical top's printing family.
  const continuitySource = { ...source([
    section("", [action("PlayerTwo played Applin to the Active Spot."), action("PlayerTwo played Applin to the Bench."), action("PlayerTwo played Grookey to the Bench."), action("PlayerOne played Budew to the Active Spot.")]),
    section("PlayerTwo", [
      action("PlayerTwo attached Basic Grass Energy to Applin on the Bench."),
      action("PlayerTwo evolved Applin to Dipplin in the Active Spot."),
      action("PlayerTwo evolved Applin to Dipplin on the Bench."),
      action("PlayerTwo evolved Grookey to Thwackey on the Bench."),
      action("PlayerTwo attached Basic Grass Energy to Dipplin in the Active Spot."),
      action("PlayerTwo attached Brave Bangle to Dipplin in the Active Spot."),
      action("PlayerTwo's Dipplin used Do the Wave on PlayerOne’s Budew for 100 damage.", ["- Damage breakdown:", "• 5 Benched Pokémon: 100 damage"]),
    ]),
    section("PlayerOne", [action("PlayerOne played Boss's Orders.", ["- PlayerTwo's Thwackey was switched with PlayerTwo's Dipplin to become the Active Pokémon.", "PlayerTwo's Thwackey is now in the Active Spot."])]),
    section("PlayerTwo", [
      action("PlayerTwo played Kieran.", ["- PlayerTwo chose Switch your Active Pokémon with 1 of your Benched Pokémon.", "- PlayerTwo's Dipplin was switched with PlayerTwo's Thwackey to become the Active Pokémon.", "PlayerTwo's Dipplin is now in the Active Spot."]),
      action("PlayerTwo's Dipplin used Do the Wave on PlayerOne’s Budew for 100 damage.", ["- Damage breakdown:", "• 5 Benched Pokémon: 100 damage"]),
    ]),
    section("PlayerOne", [
      action("PlayerTwo's Dipplin was Knocked Out!", ["- 3 cards were discarded from PlayerTwo's Dipplin.", "• Basic Grass Energy, Applin, Brave Bangle"]),
      action("PlayerTwo's Dipplin was Knocked Out!", ["- 2 cards were discarded from PlayerTwo's Dipplin.", "• Basic Grass Energy, Applin"]),
    ]),
  ]), cardDefinitions: { ...dipplinSource.cardDefinitions,
    grookey: resolveCardDefinition(buildCardDefinitionIndex([syntheticCardDefinition({ name: "Grookey", hp: 70, abilities: [], attacks: [] })]), { name: "Grookey" }),
    thwackey: resolveCardDefinition(buildCardDefinitionIndex([syntheticCardDefinition({ name: "Thwackey", hp: 100, stage: "Stage1", abilities: [], attacks: [] })]), { name: "Thwackey" }),
    "brave bangle": resolveCardDefinition(buildCardDefinitionIndex([syntheticCardDefinition({ name: "Brave Bangle", category: "Trainer", trainerType: "Tool", hp: null, attacks: [], rules: ["If the Pokémon this card is attached to doesn't have a Rule Box, the attacks it uses do 30 more damage to your opponent's Active Pokémon ex (before applying Weakness and Resistance). (Pokémon ex, Pokémon V, etc. have Rule Boxes.)"] })]), { name: "Brave Bangle" }),
  }, effectTags: { "PlayerTwo attached Brave Bangle to Dipplin in the Active Spot.": "tool" as const } };
  const printingContinuity = compileBattleReplay(continuitySource);
  const witnessedPhysicalId = printingContinuity.frames[11].opponent.active?.physicalCardId;
  assert.ok(witnessedPhysicalId, "printing continuity has a physical identity independent of the stack's presentation ID");
  const basicPhysicalId = printingContinuity.frames[11].opponent.active?.underlying[0]?.physicalCardId;
  const otherCopyPhysicalId = printingContinuity.frames[11].opponent.bench[0]?.physicalCardId;
  assert.ok(basicPhysicalId);
  assert.ok(otherCopyPhysicalId);
  assert.notEqual(witnessedPhysicalId, basicPhysicalId, "the evolved top and its Basic layer are separate physical cards");
  assert.notEqual(witnessedPhysicalId, otherCopyPhysicalId, "same-name copies have separate physical printing identities");
  const establishedImage = resolveReplayCardPreviewDefinition(printingContinuity.frames[11].opponent.active!, printingContinuity)?.selectedPrinting?.imageUrl;
  assert.ok(dipplinPrints.slice(0, 2).some((print) => print.imageUrl === establishedImage));
  const assertPrintingFamily = (card: ReplayZoneCard, message: string, program = printingContinuity, requiresRetainedNativeEffect = true) => {
    const preview = resolveReplayCardPreviewDefinition(card, program);
    assert.equal(preview?.printedHp, 80, message);
    assert.equal(preview?.hpBasis, "known", message);
    assert.deepEqual(preview?.candidatePrintingIds?.slice().sort(), ["sv06-018", "sv06-170"], message);
    assert.equal(preview?.selectedPrinting?.imageUrl, establishedImage, message);
    assert.equal(preview?.selectedDefinition?.imageUrl, establishedImage, message);
    if (requiresRetainedNativeEffect) assert.ok(card.observedEffects?.includes("Do the Wave"), message);
  };
  for (const position of [6, 9, 10, 11]) {
    assert.equal(printingContinuity.frames[position].opponent.active?.physicalCardId, witnessedPhysicalId);
    assertPrintingFamily(printingContinuity.frames[position].opponent.active!, "attachment changes preserve the native-witness printing from evolution onwards");
  }
  assertPrintingFamily(printingContinuity.frames[13].opponent.active!, "a continuous Active episode retains its later native printing before the attack even when the incoming original copy is unresolved", printingContinuity, false);
  assert.equal(printingContinuity.frames[13].opponent.active?.physicalCardId, undefined, "functional printing evidence for the Active episode does not assign an original physical copy");
  const separateEpisodes = compileBattleReplay({ ...continuitySource,
    sections: continuitySource.sections.map((entry, index) => index === 1 ? { ...entry, actions: entry.actions.slice(0, -1) } : entry),
  });
  const separatingSwitch = separateEpisodes.events.findIndex((entry) => entry.sourceTitle === "PlayerOne played Boss's Orders.");
  const earlierUnwitnessedTop = separateEpisodes.frames[separatingSwitch].opponent.active!;
  assert.ok(resolveReplayCardPreviewDefinition(earlierUnwitnessedTop, separateEpisodes)?.candidatePrintingIds?.includes("sv10-017"),
    "a native witness in a later ambiguous Active episode cannot identify an earlier episode across a recorded switch");
  assert.ok(!earlierUnwitnessedTop.observedEffects?.includes("Do the Wave"));
  const firstKo = printingContinuity.events.findIndex((entry) => entry.sourceDetails.some((detail) => detail.includes("Brave Bangle") && detail.startsWith("•")));
  const discardedTop = printingContinuity.frames[firstKo + 1].opponent.discard.find((card) => card.name === "Dipplin")!;
  assert.equal(discardedTop.physicalCardId, witnessedPhysicalId, "the complete named KO bundle identifies the original Tool carrier without guessing its position");
  assertPrintingFamily(discardedTop, "the named Tool KO witness retains the established top printing after an ambiguous same-name promotion");
  const discardedPreview = printingContinuity.events[firstKo].transaction?.stages.find((stage) => stage.kind === "discard")?.cards.find((card) => card.name === "Dipplin");
  assert.ok(discardedPreview, "the identified KO supplies its top-card transaction preview");
  assert.equal(discardedPreview.physicalCardId, witnessedPhysicalId);
  assertPrintingFamily(discardedPreview, "KO transaction artwork and discard preview preserve the same native printing evidence");
  assertPrintingFamily(printingContinuity.frames.at(-1)!.opponent.discard.find((card) => card.id === discardedTop.id)!, "a later same-name KO cannot replace an earlier discard printing query");
  const recoveryTitle = "PlayerTwo played Lana's Aid.";
  const printingRecoverySource = { ...dipplinSource,
    // The recorded seven-card opening and six-Prize setup establish an empty
    // prior discard; a placement-only excerpt cannot prove unique recovery.
    sections: [section("", [action("PlayerOne drew 7 cards for the opening hand."), action("PlayerTwo drew 7 cards for the opening hand."), ...dipplinSource.sections[0].actions]),
    ...dipplinSource.sections.slice(1, -1), section("PlayerTwo", [
      action("PlayerTwo attached Basic Grass Energy to Dipplin in the Active Spot."),
      ...dipplinSource.sections.at(-1)!.actions,
    ]), section("PlayerOne", [action("PlayerTwo's Dipplin was Knocked Out!", ["- 2 cards were discarded from PlayerTwo's Dipplin.", "• Basic Grass Energy, Applin"])]),
    section("PlayerTwo", [action(recoveryTitle, ["- PlayerTwo moved PlayerTwo's 3 cards to their hand.", "• Applin, Dipplin, Basic Grass Energy"])])],
    cardDefinitions: { ...dipplinSource.cardDefinitions,
      "lana's aid": resolveCardDefinition(buildCardDefinitionIndex([syntheticCardDefinition({ name: "Lana's Aid", category: "Trainer", trainerType: "Supporter", hp: null, attacks: [], rules: ["Put up to 3 in any combination of Pokémon that don't have a Rule Box and Basic Energy cards from your discard pile into your hand. (Pokémon ex, Pokémon V, etc. have Rule Boxes.)"] })]), { name: "Lana's Aid" }),
    }, effectOrigins: { [recoveryTitle]: "discard" },
  } satisfies ReplayLogSource;
  const printingRecovery = compileBattleReplay(printingRecoverySource);
  const recoveredTop = printingRecovery.frames.at(-1)!.opponent.knownHand.find((card) => card.name === "Dipplin")!;
  const recoveryKoIndex = printingRecovery.events.findIndex((entry) => entry.sourceTitle === "PlayerTwo's Dipplin was Knocked Out!");
  const recoveredPhysicalId = printingRecovery.frames[recoveryKoIndex].opponent.active?.physicalCardId;
  assert.ok(recoveredPhysicalId);
  assert.equal(recoveredTop.physicalCardId, recoveredPhysicalId, "a unique discard recovery retains physical identity rather than allocating a new name-only card");
  assertPrintingFamily(recoveredTop, "recovering the sole named discarded top retains its proven native family and artwork", printingRecovery);
  const recoveryPreview = printingRecovery.events.at(-1)?.transaction?.stages.find((stage) => stage.kind === "return")?.cards.find((card) => card.name === "Dipplin");
  assert.ok(recoveryPreview, "the named recovery supplies its returned top-card transaction preview");
  assert.equal(recoveryPreview.physicalCardId, recoveredPhysicalId);
  assertPrintingFamily(recoveryPreview, "recovery transaction and hand preview preserve the discard's printing evidence", printingRecovery);
  const partialPrintingRecovery = compileBattleReplay({ ...printingRecoverySource,
    sections: printingRecoverySource.sections.map((entry, index) => index ? entry : { ...entry, actions: entry.actions.slice(2) }),
  });
  assert.equal(partialPrintingRecovery.frames.at(-1)!.opponent.knownHand.find((card) => card.name === "Dipplin")?.physicalCardId, undefined,
    "a placement-only excerpt cannot identify which discarded namesake was recovered before the saved game boundary");

  // Recorded Dunsparce/Dudunsparce wording: the verified Ability and its
  // departing top exist only in transaction snapshots after this action.
  const runawayPrint = syntheticCardDefinition({ name: "Dudunsparce", sourceCardId: "sv05-129", setId: "sv05", localId: "129", hp: 140, stage: "Stage1", types: ["Colorless"], evolvesFrom: "Dunsparce", rules: null,
    imageUrl: "https://assets.tcgdex.net/en/sv/sv05/129/high.webp", sourceUrl: "https://api.tcgdex.net/v2/en/cards/sv05-129", setReleaseDate: "2024-03-22",
    abilities: [{ name: "Run Away Draw", type: "Ability", text: "Once during your turn, you may draw 3 cards. If you drew any cards in this way, shuffle this Pokémon and all attached cards into your deck." }],
    attacks: [{ name: "Land Crush", text: null, damage: "90", cost: ["Colorless", "Colorless", "Colorless"] }] });
  const departureDefinitions = {
    dunsparce: resolveCardDefinition(buildCardDefinitionIndex([syntheticCardDefinition({ name: "Dunsparce", hp: 70, abilities: [], attacks: [] })]), { name: "Dunsparce" }),
    dudunsparce: resolveCardDefinition(buildCardDefinitionIndex([runawayPrint,
      { ...runawayPrint, sourceCardId: "sv08.5-080", setId: "sv08.5", localId: "080", setReleaseDate: "2025-01-17", imageUrl: "https://assets.tcgdex.net/en/sv/sv08.5/080/high.webp", sourceUrl: "https://api.tcgdex.net/v2/en/cards/sv08.5-080" },
      { ...runawayPrint, sourceCardId: "sv02-157", setId: "sv02", localId: "157", setReleaseDate: "2023-06-09", imageUrl: "https://assets.tcgdex.net/en/sv/sv02/157/high.webp", sourceUrl: "https://api.tcgdex.net/v2/en/cards/sv02-157", abilities: [],
        attacks: [{ name: "Mud-Slap", text: null, damage: "30", cost: ["Colorless"] }, { name: "Dig Away Flash", text: "Your opponent's Active Pokémon is now Paralyzed. Shuffle this Pokémon and all attached cards into your deck.", damage: "100", cost: ["Colorless", "Colorless", "Colorless", "Colorless"] }] },
    ]), { name: "Dudunsparce" }),
  };
  const stageDeparture = compileBattleReplay({ ...source([section("", [action("PlayerTwo played Dunsparce to the Active Spot."), action("PlayerTwo played Shuppet to the Bench.")]), section("PlayerTwo", [
    action("PlayerTwo evolved Dunsparce to Dudunsparce in the Active Spot."),
    action("PlayerTwo played Dudunsparce.", ["- PlayerTwo drew 3 cards.", "- PlayerTwo shuffled 2 cards into their deck.", "• Dudunsparce, Dunsparce", "PlayerTwo's Shuppet is now in the Active Spot."]),
  ])]), cardDefinitions: departureDefinitions, effectTags: { "PlayerTwo played Dudunsparce.": "ability" } });
  const departingTop = stageDeparture.frames[3].opponent.active!;
  const departureFamily = ["sv05-129", "sv08.5-080"];
  assert.deepEqual(resolveReplayCardPreviewDefinition(departingTop, stageDeparture)?.candidatePrintingIds?.slice().sort(), departureFamily,
    "a verified native Ability followed by departure proves its earlier physical top even with equal printed HP across families");
  assert.ok(departingTop.observedEffects?.includes("Run Away Draw"));
  assert.equal(stageDeparture.frames[4].opponent.active?.name, "Shuppet");
  for (const stage of stageDeparture.events[3].transaction!.stages.filter((entry) => entry.kind === "ability" || entry.kind === "shuffle")) {
    const top = stage.cards.find((card) => card.name === "Dudunsparce")!;
    assert.equal(top.physicalCardId, departingTop.physicalCardId);
    assert.deepEqual(resolveReplayCardPreviewDefinition(top, stageDeparture)?.candidatePrintingIds?.slice().sort(), departureFamily);
  }
  const departureHp = createReplayHpContext(departureDefinitions);
  const departurePlan = collectReplayPrintingProofs(stageDeparture, departureHp.resolve);
  const unrelatedNamesake = { ...departingTop, physicalCardId: `${departingTop.physicalCardId}-other`, observedEffects: [] };
  departureHp.applyPrintingProofToCard(unrelatedNamesake, "opponent", 3, departurePlan);
  assert.deepEqual(unrelatedNamesake.observedEffects, [], "a transaction-only native witness cannot identify another same-name physical top");
  assert.equal(departureHp.resolve(unrelatedNamesake)?.candidates.length, 3);

  const absentRival = { ...cardDefinitions };
  delete absentRival.rival;
  const absentBoardDefinition = compileBattleReplay({ ...hpInput, cardDefinitions: absentRival });
  assert.equal(absentBoardDefinition.frames[4].self.active?.baseHp, 70);
  assert.equal(absentBoardDefinition.frames[4].self.active?.maxHp, 70, "missing opposing metadata alone does not establish an HP-changing effect");
  const partialBoardDefinition = compileBattleReplay({ ...hpInput, cardDefinitions: { ...cardDefinitions, rival: { ...cardDefinitions.rival, coverage: "incomplete" } } });
  assert.equal(partialBoardDefinition.frames[4].self.active?.baseHp, 70);
  assert.equal(partialBoardDefinition.frames[4].self.active?.remainingHp, 50, "partial metadata alone does not hide independently known HP and damage");
  const emptyEffectRival = resolveCardDefinition(buildCardDefinitionIndex([syntheticCardDefinition({ name: "Rival", hp: 100, attacks: [], abilities: [] })]), { name: "Rival" });
  const unknownBoardEffects = compileBattleReplay({ ...hpInput, cardDefinitions: { ...cardDefinitions, rival: emptyEffectRival } });
  assert.equal(unknownBoardEffects.frames[4].self.active?.baseHp, 70);
  assert.equal(unknownBoardEffects.frames[4].self.active?.maxHp, 70, "no recorded HP-changing effect means visible HP remains usable");
  const offboardDefinition = compileBattleReplay({ ...hpInput, cardDefinitions: { ...cardDefinitions, unseen: resolveCardDefinition(buildCardDefinitionIndex([]), { name: "Unseen" }, "unavailable") } });
  assert.equal(offboardDefinition.frames[7].self.active?.maxHp, 250, "unavailable metadata for an off-board card cannot invalidate the visible board");

  const pooledTool = compileBattleReplay({ ...source([section("PlayerOne", [
    action("PlayerOne played Rival to the Active Spot."), action("PlayerOne played Seedling to the Bench."), action("PlayerOne played Seedling to the Bench."),
    action("PlayerOne attached HP Tool to Seedling on the Bench."),
    action("PlayerOne's Seedling was switched with PlayerOne's Rival to become the Active Pokémon."),
    action("HP Tool was discarded from PlayerOne's Seedling."),
  ])]), cardDefinitions, effectTags: { "PlayerOne attached HP Tool to Seedling on the Bench.": "tool" } });
  const toolPool = pooledTool.frames[5].self.boardPools!.find((pool) => pool.cards.some((card) => card.name === "HP Tool"))!;
  assert.equal(toolPool.cards.length, 1, "the disputed Tool remains one visible physical card across a switch");
  assert.ok([pooledTool.frames[5].self.active!, ...pooledTool.frames[5].self.bench].filter((card) => toolPool.memberIds.includes(card.id)).every((card) => card.maxHp === null), "the HP-changing Tool's assignment is unresolved only on its possible holders");
  assert.equal(pooledTool.frames[5].self.bench.find((card) => card.name === "Rival")?.maxHp, 100);
  assert.ok([pooledTool.frames[6].self.active!, ...pooledTool.frames[6].self.bench].filter((card) => card.name === "Seedling").every((card) => card.maxHp === 70), "discarding the pooled HP source recovers every possible holder's maximum");
  assert.equal(pooledTool.frames[6].self.boardPools?.flatMap((pool) => pool.cards).length, 0);
  assert.equal(pooledTool.frames[6].self.discard.find((card) => card.name === "HP Tool")?.id, toolPool.cards[0].id, "moving pooled cards preserves their recorded physical identity");
  const conditionalModifierState = structuredClone(pooledTool.frames[5]);
  const modifierPool = conditionalModifierState.self.boardPools!.find((pool) => pool.id === toolPool.id)!;
  modifierPool.memberIds = [modifierPool.memberIds[0]];
  modifierPool.uncertainCards = [{ cards: modifierPool.cards.splice(0), destinations: ["discard"] }];
  const modifierContext = createReplayHpContext(cardDefinitions);
  modifierContext.update(conditionalModifierState);
  const possibleHolder = [conditionalModifierState.self.active!, ...conditionalModifierState.self.bench].find((card) => card.id === modifierPool.memberIds[0])!;
  assert.equal(possibleHolder.maxHp, null, "a conditional HP source can remain attached even when only one eligible holder survives");
  modifierPool.memberIds = []; modifierContext.update(conditionalModifierState);
  assert.equal(possibleHolder.maxHp, 70, "memberless conditional locations cannot modify a surviving Pokémon's HP");

  const conditionalTool = syntheticCardDefinition({ ...definitions[4], rules: ["If this Pokémon is Basic, it gets +100 HP."] });
  const conditionalHp = compileBattleReplay({ ...hpInput, cardDefinitions: { ...cardDefinitions, "hp tool": resolveCardDefinition(buildCardDefinitionIndex([conditionalTool]), { name: "HP Tool" }) } });
  assert.equal(conditionalHp.frames[7].self.active?.baseHp, 150);
  assert.equal(conditionalHp.frames[7].self.active?.maxHp, null, "unmodelled conditional HP cannot be presented as an exact total");
  assert.equal(conditionalHp.frames[7].self.active?.remainingHp, null);
  const braveryCharm = syntheticCardDefinition({ ...definitions[4], rules: ["The Basic Pokémon this card is attached to gets +50 HP."] });
  const braveryEvidence = resolveCardDefinition(buildCardDefinitionIndex([braveryCharm]), { name: "HP Tool" });
  const nonBasicCharm = compileBattleReplay({ ...hpInput, cardDefinitions: { ...cardDefinitions, "hp tool": braveryEvidence } });
  assert.equal(nonBasicCharm.frames[7].self.active?.maxHp, 150, "a Basic-only Tool has no HP effect on a Stage 2 Pokémon");
  const basicInput = { ...hpInput, sections: [section("PlayerOne", [...hpInput.sections[0].actions.slice(0, 5), action("PlayerOne attached HP Tool to Seedling in the Active Spot.")])],
    effectTags: { "PlayerOne attached HP Tool to Seedling in the Active Spot.": "tool" as const }, cardDefinitions: { ...cardDefinitions, "hp tool": braveryEvidence } };
  const basicCharm = compileBattleReplay(basicInput);
  assert.equal(basicCharm.frames[6].self.active?.maxHp, 120);
  assert.equal(basicCharm.frames[6].self.active?.remainingHp, 100);
  const absentToolEvidence: NonNullable<ReplayLogSource["cardDefinitions"]> = { ...basicInput.cardDefinitions }; delete absentToolEvidence["hp tool"];
  const absentTool = compileBattleReplay({ ...basicInput, cardDefinitions: absentToolEvidence });
  assert.equal(absentTool.frames[6].self.active?.maxHp, 70);
  assert.equal(absentTool.frames[6].self.active?.hpBasis, "probable", "an attached Tool without catalogue rules cannot establish a zero HP adjustment");
  assert.equal(absentTool.frames[6].self.active?.hpModifierBasis, "unverified_attachment");
  assert.equal(absentTool.frames[6].opponent.active?.hpBasis, "known", "an unverified Tool stays local to its recorded recipient");
  const missingToolRules = compileBattleReplay({ ...basicInput, cardDefinitions: { ...basicInput.cardDefinitions,
    "hp tool": resolveCardDefinition(buildCardDefinitionIndex([{ ...braveryCharm, rules: null }]), { name: "HP Tool" }) } });
  assert.equal(missingToolRules.frames[6].self.active?.maxHp, 70);
  assert.equal(missingToolRules.frames[6].self.active?.hpBasis, "probable");
  const suppressionTower = syntheticCardDefinition({ name: "Null Tower", hp: null, category: "Trainer", trainerType: "Stadium", attacks: [], rules: ["Pokémon Tools attached to each Pokémon (both yours and your opponent's) have no effect."] });
  const suppressedTool = compileBattleReplay({ ...basicInput, sections: [section("PlayerOne", [...basicInput.sections[0].actions, action("PlayerOne played Null Tower to the Stadium spot.")])],
    cardDefinitions: { ...basicInput.cardDefinitions, "null tower": resolveCardDefinition(buildCardDefinitionIndex([suppressionTower]), { name: "Null Tower" }) } });
  assert.equal(suppressedTool.frames[7].self.active?.baseHp, 70);
  assert.equal(suppressedTool.frames[7].self.active?.maxHp, 70, "verified Tool suppression removes the otherwise-applicable +50 HP");
  assert.equal(suppressedTool.frames[7].self.active?.remainingHp, 50);
  const conditionalSuppression = syntheticCardDefinition({ name: "Lock Tool", hp: null, category: "Trainer", trainerType: "Tool", attacks: [], rules: ["As long as the Pokémon this card is attached to is in the Active Spot, Pokémon Tools attached to your opponent's Active Pokémon have no effect."] });
  const uncertainSuppressedTool = compileBattleReplay({ ...basicInput, sections: [section("PlayerOne", [...basicInput.sections[0].actions, action("PlayerTwo attached Lock Tool to Rival in the Active Spot.")])],
    effectTags: { ...basicInput.effectTags, "PlayerTwo attached Lock Tool to Rival in the Active Spot.": "tool" },
    cardDefinitions: { ...basicInput.cardDefinitions, "lock tool": resolveCardDefinition(buildCardDefinitionIndex([conditionalSuppression]), { name: "Lock Tool" }) } });
  assert.equal(uncertainSuppressedTool.frames[7].self.active?.baseHp, 70);
  assert.equal(uncertainSuppressedTool.frames[7].self.active?.maxHp, null, "unmodelled conditional suppression cannot leave a Tool HP bonus asserted");
  const unknownStage = resolveCardDefinition(buildCardDefinitionIndex(definitions.slice(0, 2).map((card) => ({ ...card, stage: null }))), { name: "Seedling" });
  const uncertainCharm = compileBattleReplay({ ...basicInput, cardDefinitions: { ...basicInput.cardDefinitions, seedling: unknownStage } });
  assert.equal(uncertainCharm.frames[6].self.active?.baseHp, 70);
  assert.equal(uncertainCharm.frames[6].self.active?.maxHp, null, "unknown evolution stage cannot decide a Basic-only HP bonus");
  const gravity = syntheticCardDefinition({ name: "Gravity Mountain", hp: null, category: "Trainer", trainerType: "Stadium", attacks: [], rules: ["Each Stage 2 Pokémon in play (both yours and your opponent's) gets -30 HP."] });
  const gravityReplay = compileBattleReplay({ ...hpInput, sections: [section("PlayerOne", [...hpInput.sections[0].actions, action("PlayerOne played Gravity Mountain to the Stadium spot.")])],
    cardDefinitions: { ...cardDefinitions, "gravity mountain": resolveCardDefinition(buildCardDefinitionIndex([gravity]), { name: "Gravity Mountain" }) } });
  assert.equal(gravityReplay.frames[8].self.active?.maxHp, 220, "Stage 2 base150 plus Tool100 minus Stadium30");
  assert.equal(gravityReplay.frames[8].self.active?.remainingHp, 200);
  assert.equal(gravityReplay.frames[8].opponent.active?.maxHp, 100, "a Stage 2 Stadium modifier leaves Basic Pokémon unaffected");


  const lunarDefinitions = [
    syntheticCardDefinition(), syntheticCardDefinition({ name: "Lunatone", hp: 90 }),
    syntheticCardDefinition({ name: "Solrock", abilities: [{ name: "Sunbeam", type: "Ability", text: "The maximum HP of each of your Lunatone in play is 130." }] }),
    syntheticCardDefinition({ name: "Solrock", sourceCardId: "other-solrock", hp: 90, abilities: [{ name: "Sunbeam", type: "Ability", text: "The maximum HP for each Lunatone you have in play is now 80." }] }),
  ];
  const lunarIndex = buildCardDefinitionIndex(lunarDefinitions);
  const lunarHp = compileBattleReplay({ ...source([section("PlayerOne", [
    action("PlayerOne played Seedling to the Active Spot."), action("PlayerTwo played Lunatone to the Active Spot."),
    action("PlayerOne played Lunatone to the Bench."), action("PlayerOne played Solrock to the Bench."),
  ])]), cardDefinitions: Object.fromEntries(["Seedling", "Lunatone", "Solrock"].map((name) => [name.toLowerCase(), resolveCardDefinition(lunarIndex, { name })])) });
  assert.equal(lunarHp.frames[4].self.active?.maxHp, 70, "a named HP effect cannot suppress unrelated Pokémon");
  assert.equal(lunarHp.frames[4].self.bench[0].baseHp, 90);
  assert.equal(lunarHp.frames[4].self.bench[0].maxHp, null, "conflicting named HP setters leave their actual target unresolved");
  assert.equal(lunarHp.frames[4].opponent.active?.maxHp, 90, "your named Pokémon does not include the opposing player");

  const silentField = syntheticCardDefinition({ name: "Silent Field", hp: null, category: "Trainer", trainerType: "Stadium", attacks: [], rules: ["Each Basic Pokémon in play, in each player's hand, and in each player's discard pile has no Abilities."] });
  const suppressor = syntheticCardDefinition({ name: "Suppressor", stage: "Stage1", abilities: [{ name: "Block", type: "Ability", text: "If this Pokémon has a Pokémon Tool card attached to it, each Pokémon in play, in each player's hand, and in each player's discard pile has no Abilities (except for Garbotoxin)." }] });
  const suppressionIndex = buildCardDefinitionIndex([...lunarDefinitions.slice(0, 3), silentField, suppressor, definitions[4]]);
  const suppressionEvidence = Object.fromEntries(["Seedling", "Lunatone", "Solrock", "Silent Field", "Suppressor", "HP Tool"].map((name) => [name.toLowerCase(), resolveCardDefinition(suppressionIndex, { name })]));
  const suppressionActions = [action("PlayerOne played Seedling to the Active Spot."), action("PlayerOne played Lunatone to the Bench."), action("PlayerOne played Solrock to the Bench.")];
  const suppressedAbility = compileBattleReplay({ ...source([section("PlayerOne", [...suppressionActions, action("PlayerOne played Silent Field to the Stadium spot.")])]), cardDefinitions: suppressionEvidence });
  assert.equal(suppressedAbility.frames[3].self.bench[0].maxHp, 130);
  assert.equal(suppressedAbility.frames[4].self.bench[0].baseHp, 90);
  assert.equal(suppressedAbility.frames[4].self.bench[0].maxHp, null, "possibly suppressed HP-setting Abilities cannot continue supplying an exact maximum");
  assert.equal(suppressedAbility.frames[4].self.active?.maxHp, 70, "suppression ambiguity stays with the HP-setting Ability's target");
  const historicalField = { ...silentField, rules: ["This card stays in play when you play it. Discard this card if another Stadium card comes into play. Ignore Poké-Bodies for all Basic Pokémon in play (both yours and your opponent's) (excluding Pokémon-ex and Pokémon that has an owner in its name)."] };
  const historicalIndex = buildCardDefinitionIndex([lunarDefinitions[0], { ...lunarDefinitions[1], hp: 60 }, { ...lunarDefinitions[2], abilities: [{ name: "Sunbeam", type: "Poke-BODY", text: "The maximum HP for each Lunatone you have in play is now 80." }] }, historicalField]);
  const historicalSuppression = compileBattleReplay({ ...source([section("PlayerOne", [...suppressionActions, action("PlayerOne played Silent Field to the Stadium spot.")])]),
    cardDefinitions: Object.fromEntries(["Seedling", "Lunatone", "Solrock", "Silent Field"].map((name) => [name.toLowerCase(), resolveCardDefinition(historicalIndex, { name })])) });
  assert.equal(historicalSuppression.frames[3].self.bench[0].maxHp, 80);
  assert.equal(historicalSuppression.frames[4].self.bench[0].baseHp, 60);
  assert.equal(historicalSuppression.frames[4].self.bench[0].maxHp, null, "unresolved historical Poké-Body suppression cannot leave its HP setter active");
  const attachedSuppressor = compileBattleReplay({ ...source([section("PlayerOne", [...suppressionActions, action("PlayerOne played Suppressor to the Bench."), action("PlayerOne attached HP Tool to Suppressor on the Bench.")])]),
    cardDefinitions: suppressionEvidence, effectTags: { "PlayerOne attached HP Tool to Suppressor on the Bench.": "tool" } });
  assert.equal(attachedSuppressor.frames[4].self.bench[0].maxHp, 130, "the Tool-conditioned suppression is inactive without a Tool");
  assert.equal(attachedSuppressor.frames[5].self.bench[0].maxHp, null);
  assert.equal(attachedSuppressor.frames[5].self.active?.maxHp, 70);

  const input = source([
    section("", [
      action("PlayerOne chose heads for the opening coin flip.", ["PlayerOne won the coin toss."]),
      action("PlayerOne decided to go first.", [
        "PlayerOne drew 7 cards for the opening hand.", "- 7 drawn cards.",
        "• Seedling, Sprout, Basic Grass Energy, Supply, Seedling, Supply, Supply",
        "PlayerTwo drew 7 cards for the opening hand.", "- 7 drawn cards.",
      ]),
      action("PlayerOne played Seedling to the Active Spot."),
      action("PlayerTwo played Rival to the Active Spot."),
    ]),
    { ...section("PlayerOne", [
      action("PlayerOne drew Supply."),
      action("PlayerOne attached Basic Grass Energy to Seedling in the Active Spot."),
      action("PlayerOne's Seedling is now Poisoned."),
      action("PlayerOne evolved Seedling to Sprout in the Active Spot."),
      action("PlayerOne's Sprout used Tap on PlayerTwo’s Rival for 20 damage."),
      action("PlayerTwo's Rival was Knocked Out!"),
      action("PlayerOne took a Prize card.", ["Supply was added to PlayerOne's hand."]),
    ]), prizesAfterTurn: { PlayerOne: 5, PlayerTwo: 6 } },
    { ...section("PlayerTwo", [
      action("PlayerTwo drew a card."),
      action("PlayerTwo played Replacement to the Active Spot."),
      action("PlayerTwo ended their turn."),
    ]), prizesAfterTurn: { PlayerOne: 5, PlayerTwo: 6 } },
    { ...section("PlayerOne", [
      action("PlayerOne's Sprout used its Ability Gather."),
      action("PlayerOne shuffled 2 cards from their hand into their deck.", ["• Supply, Seedling"]),
    ]), prizesAfterTurn: { PlayerOne: 5, PlayerTwo: 6 } },
  ]);
  const before = structuredClone(input);
  const replay = compileBattleReplay(input);
  assert.deepEqual(input, before, "compilation must not mutate the saved record");
  assert.deepEqual(replay, compileBattleReplay(input));
  assert.deepEqual(JSON.parse(JSON.stringify(replay)), replay, "no functions or undefined values cross the renderer boundary");
  assert.equal(replay.events.length, 16);
  assert.equal(replay.frames.length, 17);
  assert.deepEqual(replay.events.map((event) => event.sourceTitle), input.sections.flatMap((part) => part.actions.map((item) => item.title)));
  assert.deepEqual(replay.events[1].sourceDetails, input.sections[0].actions[1].details);
  assert.deepEqual(replay.events.map((event) => event.sourceSectionIndex), [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 3, 3]);
  assert.equal(replay.events[4].turn, replay.events[11].turn, "both players have a first turn");
  assert.notEqual(replay.events[4].sourceSectionIndex, replay.events[11].sourceSectionIndex);
  assert.equal(replay.events[9].actor, "opponent", "an opponent knockout can happen inside the owner's turn");
  assert.equal(replay.events[9].sourceSectionIndex, replay.events[8].sourceSectionIndex);
  assert.equal(replay.source.result, "Unknown");
  assert.equal(replay.source.playedOn, "2026-10-01");
  assert.deepEqual(replay.diagnostics.unresolvedActions, []);
  assert.equal(replay.frames[0].self.handCount, 0);
  assert.equal(replay.frames[0].self.deckCount, 60);
  assert.equal(replay.frames[2].self.handCount, 7);
  assert.equal(replay.frames[4].self.handCount, 6);
  assert.deepEqual(replay.frames[7].self.active?.conditions, ["Poisoned"]);
  const evolved = replay.frames[8].self.active;
  assert.equal(evolved?.name, "Sprout");
  assert.equal(evolved?.id, replay.frames[3].self.active?.id);
  assert.deepEqual(evolved?.underlying.map((card) => card.name), ["Seedling"]);
  assert.deepEqual(evolved?.energy, ["Grass"]);
  assert.deepEqual(evolved?.conditions, []);
  assert.equal(evolved?.hp, null);
  assert.equal(evolved?.imageUrl, "");
  assert.equal(replay.frames[9].opponent.active?.damage, 20);
  assert.equal(replay.frames[10].opponent.active, null);
  assert.deepEqual(replay.frames[10].opponent.discard.map((card) => card.name), ["Rival"]);
  assert.equal(replay.frames[11].self.prizesRemaining, 5);
  assert.equal(replay.frames[11].self.handCount, 6);
  assert.equal(replay.events[14].label, "Ability");
  assert.equal(replay.frames[15].self.active?.abilityUsed, true);
  assert.equal(replay.frames[16].self.handCount, 4, "an explicitly recorded hand shuffle can move hand cards");
  assert.ok(replay.frames[16].self.knownHand.every((card) => card.name === "Supply"));
  assert.equal(replay.status, "partial", "unknown HP and deck count remain explicit limitations");
});

// 10/10: uncertainty must prevent invented state while independent explicit
// evidence survives and later exact zone facts can recover useful reconstruction.
test("unsupported details and ambiguous targets preserve evidence and expose uncertainty", () => {
  const twins = compileBattleReplay(source([
    section("", [
      action("PlayerOne played Seedling to the Active Spot."),
      action("PlayerOne played Twin to the Bench."),
      action("PlayerOne played Twin to the Bench."),
    ]),
    section("PlayerOne", [
      action("PlayerOne attached Basic Grass Energy to Twin on the Bench."),
      action("PlayerOne attached Basic Fire Energy to Twin on the Bench."),
      action("PlayerOne's Seedling used its Ability Gather.", ["- PlayerOne attached Basic Grass Energy to Seedling in the Active Spot.", "- PlayerOne drew Supply."]),
    ]),
  ]));
  assert.equal(twins.events[3].unresolved, undefined, "identical bare copies have equivalent visible outcomes");
  assert.deepEqual(twins.frames[4].self.bench.map((card) => card.energy), [["Grass"], []]);
  assert.match(twins.events[4].unresolved?.[0] ?? "", /which Twin/);
  assert.deepEqual(twins.frames[5].self.bench.map((card) => card.energy), [["Grass"], []], "a new ambiguous attachment cannot remove the previously recorded Energy");
  assert.deepEqual(twins.frames[5].self.boardPools?.flatMap((pool) => pool.cards.map((card) => card.name)), ["Basic Fire Energy"], "the incoming Energy remains in play on one of the eligible copies");
  assert.ok(twins.frames[5].self.bench.every((card) => card.instanceUncertain));
  assert.ok(twins.frames[5].self.uncertainZones?.includes("board"));
  assert.equal(twins.events[4].transaction, undefined, "a rejected attachment cannot animate as successful");
  assert.match(twins.events[5].unresolved?.[0] ?? "", /origin/);
  assert.equal(twins.frames[6].self.active?.abilityUsed, true, "the explicit Ability itself remains evidenced");
  assert.deepEqual(twins.frames[6].self.active?.energy, []);
  assert.deepEqual(twins.frames[6].self.knownHand.map((card) => card.name), ["Supply"], "a later independent draw survives an unsupported attachment detail");

  // The first copy has passed through Active and a turn reset; the second
  // arrived later. Those histories do not distinguish their present bare state.
  const interchangeable = compileBattleReplay(source([
    section("", [action("PlayerOne played Dreepy to the Active Spot."), action("PlayerOne played Dreepy to the Bench.")]),
    section("PlayerOne", [
      action("PlayerOne played Buddy to the Bench."),
      action("PlayerOne retreated Dreepy to the Bench.", ["PlayerOne's Buddy is now in the Active Spot."]),
      action("PlayerOne's Buddy was Knocked Out!"),
      action("PlayerOne's Dreepy is now in the Active Spot."),
      action("PlayerOne evolved Dreepy to Drakloak in the Active Spot."),
    ]),
  ]));
  assert.deepEqual(interchangeable.diagnostics.unresolvedActions, [], "equivalent copies remain interchangeable after different recorded histories");
  assert.equal(interchangeable.frames[6].self.active?.name, "Dreepy");
  assert.equal(interchangeable.frames[7].self.active?.name, "Drakloak");
  assert.deepEqual(interchangeable.frames[7].self.active?.underlying.map((card) => card.name), ["Dreepy"]);
  assert.deepEqual(interchangeable.frames[7].self.bench.map((card) => card.name), ["Dreepy"]);

  const timedEvolution = compileBattleReplay(source([
    section("", [action("PlayerOne played Munkidori to the Active Spot."), action("PlayerOne played Dreepy to the Bench.")]),
    section("PlayerOne", [action("PlayerOne attached Basic Psychic Energy to Dreepy on the Bench."), action("PlayerOne ended their turn.")]),
    section("PlayerTwo", [action("PlayerTwo ended their turn.")]),
    section("PlayerOne", [action("PlayerOne played Dreepy to the Bench."), action("PlayerOne evolved Dreepy to Drakloak on the Bench.")]),
  ]));
  assert.deepEqual(timedEvolution.diagnostics.unresolvedActions, [], "normal evolution timing identifies the older eligible physical copy");
  assert.deepEqual(timedEvolution.frames[7].self.bench.map((card) => ({ name: card.name, energy: card.energy })), [{ name: "Drakloak", energy: ["Psychic"] }, { name: "Dreepy", energy: [] }]);

  const ordinaryAttacker = syntheticCardDefinition({ name: "Attacker", attacks: [{ name: "Pollen", damage: "10", cost: [], text: "During your opponent's next turn, they can't play any Item cards from their hand." }] });
  const ordinaryAttackInput = source([section("PlayerOne", [
    action("PlayerOne played Attacker to the Active Spot."), action("PlayerTwo played Twin to the Active Spot."),
    action("PlayerTwo attached Basic Grass Energy to Twin in the Active Spot."), action("PlayerTwo played Twin to the Bench."),
    action("PlayerOne's Attacker used Pollen on PlayerTwo's Twin for 10 damage."),
  ])]);
  const ordinaryAttackEvidence = resolveCardDefinition(buildCardDefinitionIndex([ordinaryAttacker]), { name: "Attacker" });
  const ordinaryAttack = compileBattleReplay({ ...ordinaryAttackInput, cardDefinitions: { attacker: ordinaryAttackEvidence } });
  assert.deepEqual(ordinaryAttack.diagnostics.unresolvedActions, []);
  assert.equal(ordinaryAttack.frames[5].opponent.active?.damage, 10, "complete ordinary-attack rules identify the Active target despite a different same-name Bench copy");
  assert.equal(ordinaryAttack.frames[5].opponent.bench[0].damage, 0);
  for (const unsupportedAttack of [
    { ...ordinaryAttacker.attacks[0], text: "This attack does 10 damage to 1 of your opponent's Benched Pokémon." },
    { ...ordinaryAttacker.attacks[0], text: "Choose 1 of your opponent's Pokémon. This attack does 10 damage to it." },
    { ...ordinaryAttacker.attacks[0], text: null },
    { ...ordinaryAttacker.attacks[0], damage: "10+" },
  ]) {
    const candidates = buildCardDefinitionIndex([ordinaryAttacker, { ...ordinaryAttacker, sourceCardId: "other-attacker", attacks: [unsupportedAttack] }]);
    const uncertainAttack = compileBattleReplay({ ...ordinaryAttackInput, cardDefinitions: { attacker: resolveCardDefinition(candidates, { name: "Attacker" }) } });
    assert.deepEqual(uncertainAttack.diagnostics.unresolvedActions, [4], "every viable printing must establish the same ordinary Active-target contract");
    assert.equal(uncertainAttack.frames[5].opponent.active?.damage, 0);
    assert.equal(uncertainAttack.frames[5].opponent.bench[0].damage, 0);
  }
  assert.deepEqual(compileBattleReplay({ ...ordinaryAttackInput, cardDefinitions: { attacker: { ...ordinaryAttackEvidence, coverage: "incomplete" } } }).diagnostics.unresolvedActions, [4]);

  const unprovenRecovery = compileBattleReplay(source([section("PlayerOne", [
    action("PlayerOne drew 2 cards for the opening hand.", ["• Seedling, Supply"]),
    action("PlayerOne played Seedling to the Active Spot."),
    action("PlayerOne put 2 damage counters on PlayerOne's Seedling."),
    action("PlayerOne moved Damage Pump to their hand."),
    action("PlayerOne drew Supply."),
  ])]));
  assert.match(unprovenRecovery.events[3].unresolved?.[0] ?? "", /origin/);
  assert.equal(unprovenRecovery.frames[4].self.handCount, null, "a card name containing Damage cannot hide an unresolved hand movement");
  assert.deepEqual(unprovenRecovery.frames[4].self.knownHand, []);
  assert.ok(unprovenRecovery.frames[4].self.uncertainZones?.includes("discard"), "the omitted source could be the discard pile");
  assert.equal(unprovenRecovery.frames[4].self.active?.damage, 20, "Damage Pump is a card name, not a recorded damage change");
  assert.deepEqual(unprovenRecovery.frames[5].self.knownHand.map((card) => card.name), ["Supply"], "subsequent independent evidence still survives");

  const handOnly = compileBattleReplay(source([section("PlayerOne", [
    action("PlayerOne drew 2 cards for the opening hand.", ["• Seedling, Supply"]),
    action("PlayerOne played Seedling to the Active Spot."),
    action("PlayerOne put 2 damage counters on PlayerOne's Seedling."),
    action("PlayerOne rearranged unknown cards in their hand."),
  ])]));
  assert.equal(handOnly.frames[4].self.handCount, 1, "a hand permutation cannot change its physical card count");
  assert.deepEqual(handOnly.frames[4].self.knownHand, []);
  assert.equal(handOnly.frames[4].self.active?.damage, 20);
  assert.notEqual(handOnly.frames[4].self.active?.damageKnown, false, "a hand-only unknown action cannot invalidate recorded damage");
  assert.deepEqual(handOnly.frames[4].self.uncertainZones, ["hand"]);

  const reconText = "Once during your turn, you may look at the top 2 cards of your deck and put 1 of them into your hand. Put the other card on the bottom of your deck.";
  const reconCard = syntheticCardDefinition({ name: "Drakloak", hp: 90, abilities: [{ name: "Recon Directive", type: "Ability", text: reconText }] });
  const reconEvidence = resolveCardDefinition(buildCardDefinitionIndex([reconCard]), { name: "Drakloak" });
  const reconTitle = "PlayerOne's Drakloak used Recon Directive.";
  const repeatInput = { ...source([
    section("", [action("PlayerOne played Seedling to the Active Spot."), action("PlayerOne played Drakloak to the Bench."), action("PlayerOne played Drakloak to the Bench.")]),
    section("PlayerOne", [action(reconTitle, ["PlayerOne drew Supply."]), action(reconTitle, ["PlayerOne drew Supply."])]),
  ]), effectTags: { [reconTitle]: "ability" as const }, cardDefinitions: { drakloak: reconEvidence } };
  const repeatedAbility = compileBattleReplay(repeatInput);
  assert.deepEqual(repeatedAbility.diagnostics.unresolvedActions, [], "verified once-per-copy wording selects the remaining unused equivalent copy");
  assert.deepEqual(repeatedAbility.frames[5].self.bench.map((card) => card.abilityUsed), [true, true]);
  const threeCopyRecon = compileBattleReplay({ ...source([
    section("", [
      action("PlayerOne drew 7 cards for the opening hand."), action("PlayerTwo drew 7 cards for the opening hand."),
      action("PlayerOne played Dreepy to the Active Spot."), action("PlayerOne played Dreepy to the Bench."), action("PlayerOne played Dreepy to the Bench."),
      action("PlayerTwo played Dreepy to the Active Spot."),
    ]),
    section("PlayerOne", [action("PlayerOne drew a card."), action("PlayerOne attached Basic Psychic Energy to Dreepy in the Active Spot.")]),
    section("PlayerTwo", [action("PlayerTwo drew a card.")]),
    section("PlayerOne", [
      action("PlayerOne drew a card."), action("PlayerOne evolved Dreepy to Drakloak in the Active Spot."),
      action("PlayerOne evolved Dreepy to Drakloak on the Bench."), action("PlayerOne evolved Dreepy to Drakloak on the Bench."),
      action(reconTitle, ["PlayerOne drew a card."]), action(reconTitle, ["PlayerOne drew a card."]), action(reconTitle, ["PlayerOne drew a card."]),
    ]),
  ]), effectTags: { [reconTitle]: "ability" }, cardDefinitions: { drakloak: reconEvidence } });
  const reconCopies = (index: number) => [threeCopyRecon.frames[index].self.active, ...threeCopyRecon.frames[index].self.bench].filter((card): card is ReplayCard => Boolean(card));
  assert.equal(reconCopies(15).filter((card) => card.abilityUsed).length < 3, true, "two uses cannot prove three per-copy markers");
  assert.deepEqual(reconCopies(16).map((card) => card.abilityUsed), [true, true, true], "three once-per-copy uses prove all three despite different attachment state and unknown order");
  assert.deepEqual(threeCopyRecon.frames[16].self.active?.energy, ["Psychic"], "Ability copy ambiguity cannot relocate an independently recorded attachment");
  for (const frame of threeCopyRecon.frames) for (const actor of ["self", "opponent"] as const) {
    const side = frame[actor];
    assert.equal(side.deckCount! + side.handCount! + side.prizesRemaining! + side.inPlayCount! + side.discardCount!, 60);
  }
  for (const restriction of ["You can't use more than 1 Recon Directive Ability during your turn.", "You may use only 1 Recon Directive each turn."]) {
    const globallyLimited = { ...reconCard, abilities: [{ ...reconCard.abilities[0], text: `${reconText} ${restriction}` }] };
    const globallyCapped = compileBattleReplay({ ...repeatInput, cardDefinitions: { drakloak: resolveCardDefinition(buildCardDefinitionIndex([globallyLimited]), { name: "Drakloak" }) } });
    assert.ok(globallyCapped.events[4].unresolved?.length, "a global use limit does not prove a second copy was eligible");
  }
  const missingSource = compileBattleReplay({ ...source([section("PlayerOne", [
    action("PlayerOne played Seedling to the Active Spot."), action("PlayerOne put 2 damage counters on PlayerOne's Seedling."),
    action(reconTitle, ["PlayerOne drew Supply."]),
  ])]), effectTags: { [reconTitle]: "ability" }, cardDefinitions: { drakloak: reconEvidence } });
  assert.ok(missingSource.events[2].unresolved?.length);
  assert.deepEqual(missingSource.frames[3].self.uncertainZones ?? [], [], "a verified selection plus its recorded draw preserves independent zone facts despite a missing source copy");
  assert.equal(missingSource.frames[3].self.active?.damage, 20);
  assert.notEqual(missingSource.frames[3].self.active?.damageKnown, false);

  const completeSetup = section("", [
    action("PlayerOne drew 7 cards for the opening hand."), action("PlayerTwo drew 7 cards for the opening hand."),
    action("PlayerOne played Starter to the Active Spot."), action("PlayerTwo played Rival to the Active Spot."),
    action("PlayerOne played Twin to the Bench."), action("PlayerOne played Twin to the Bench."),
  ]);
  const countInput = { ...source([completeSetup, section("PlayerOne", [
    action("PlayerOne attached Basic Grass Energy to Twin on the Bench."),
    action("PlayerOne attached Basic Water Energy to Twin on the Bench."),
    action("PlayerOne evolved Twin to Sprout on the Bench."),
    action(reconTitle, ["PlayerOne drew Supply."]),
    action("PlayerOne's Twin was Knocked Out!", ["2 cards were discarded from PlayerOne's Twin.", "• Basic Grass Energy, Basic Water Energy"]),
    action("PlayerOne attached Basic Fire Energy from their deck to Twin on the Bench."),
    action("PlayerOne drew 2 cards."),
    action("PlayerOne shuffled 5 cards from their hand into their deck."),
  ])]), effectTags: { [reconTitle]: "ability" as const }, cardDefinitions: { drakloak: reconEvidence } };
  const counted = compileBattleReplay(countInput);
  assert.equal(counted.frames[6].self.deckCount, 47);
  assert.equal(counted.frames[6].self.handCount, 4);
  assert.equal(counted.frames[8].self.handCount, 2, "one Energy leaves hand even when the receiving Twin is ambiguous");
  assert.equal(counted.frames[9].self.handCount, 1, "one evolution card leaves hand independently of the underlying copy choice");
  assert.equal(counted.frames[9].self.inPlayCount, 6, "ambiguous attachment and evolution destinations preserve their independent physical-card totals");
  const displayedInventory = (side: ReplaySide) => [side.active, ...side.bench, ...(side.unplaced ?? [])].reduce((sum, card) => sum + (card ? 1 + card.energy.length + card.underlying.length + Number(Boolean(card.tool)) : 0), 0)
    + (side.boardPools ?? []).reduce((sum, pool) => sum + pool.cards.length, 0);
  assert.equal(displayedInventory(counted.frames[8].self), 5, "both recorded Energy remain visible before the ambiguous evolution");
  assert.equal(displayedInventory(counted.frames[9].self), 6, "evolution retains every prior physical card, with uncertain assignment explicitly pooled");
  assert.equal(counted.frames[10].self.deckCount, 46);
  assert.equal(counted.frames[10].self.handCount, 2);
  assert.equal(counted.frames[11].self.deckCount, 46, "KO and attachment-discard ambiguity cannot change the deck");
  assert.equal(counted.frames[11].opponent.deckCount, 47, "the other player's deck remains independent");
  assert.equal(counted.frames[12].self.deckCount, 45, "an explicit deck attachment moves one card even if its recipient is ambiguous");
  assert.equal(counted.frames[13].self.deckCount, 43);
  assert.equal(counted.frames[13].self.handCount, 4);
  assert.equal(counted.frames[14].self.deckCount, null, "returning five cards from a reconstructed four-card hand is a genuine count contradiction");
  assert.equal(counted.frames[14].self.handCount, null);
  assert.ok(counted.events[13].unresolved?.length);
  assert.equal(counted.frames[14].opponent.deckCount, 47);
  const countedKo = compileBattleReplay(source([completeSetup, section("PlayerOne", [
    action("PlayerOne attached Basic Grass Energy to Twin on the Bench."),
    action("PlayerOne attached Basic Water Energy to Twin on the Bench."),
    action("PlayerOne's Twin was Knocked Out!", ["2 cards were discarded from PlayerOne's Twin."]),
    action("PlayerOne's Twin was Knocked Out!"),
  ])]));
  assert.equal(countedKo.frames[8].self.inPlayCount, 5);
  assert.equal(countedKo.frames[9].self.inPlayCount, 2, "recorded KO attachment counts identify a physical total without selecting a receiving copy");
  assert.equal(countedKo.frames[9].self.discardCount, 3, "KO moves its top Pokémon and two attachments exactly once even when identities are missing");
  assert.equal(displayedInventory(countedKo.frames[9].self), 2, "the recorded KO removes pooled attachment quantity from the visible board once");
  assert.equal(countedKo.frames[9].self.deckCount, 47);
  assert.equal(countedKo.frames[9].self.handCount, 2);
  assert.equal(countedKo.frames[10].self.inPlayCount, 1, "a bare surviving copy recovers its stack quantity after its potential attachment pool is exhausted");
  assert.equal(countedKo.frames[10].self.discardCount, 4);

  const movementRows = [
    syntheticCardDefinition({ name: "Pivot", hp: null, category: "Trainer", trainerType: "Item", rules: ["Switch your Active Pokémon with 1 of your Benched Pokémon."] }),
    syntheticCardDefinition({ name: "Shift", hp: null, category: "Trainer", trainerType: "Item", rules: ["Move a Basic Energy from 1 of your Pokémon to another of your Pokémon."] }),
    syntheticCardDefinition({ name: "Archive", hp: null, category: "Trainer", trainerType: "Stadium", rules: ["Once during each player's turn, that player may put a card from their hand on top of their deck."] }),
    syntheticCardDefinition({ name: "Exchange", hp: null, category: "Trainer", trainerType: "Stadium", rules: ["Once during each player's turn, that player may discard 2 cards from their hand in order to draw a card."] }),
    syntheticCardDefinition({ name: "Lookup", hp: null, category: "Trainer", trainerType: "Stadium", rules: ["Once during each player's turn, that player may search their deck for a Keeper's Pokémon, reveal it, and put it into their hand. Then, that player shuffles their deck."] }),
    syntheticCardDefinition({ name: "Keeper's Seed", hp: 60 }),
    syntheticCardDefinition({ name: "Clock", hp: null, category: "Trainer", trainerType: "Item", rules: ["Devolve 1 of your evolved {P} Pokémon by putting any number of Evolution cards on it into your hand. (That Pokémon can't evolve this turn.)"] }),
    syntheticCardDefinition({ name: "Twin", hp: 80, types: ["Psychic"], stage: "Basic" }),
    syntheticCardDefinition({ name: "Middle", hp: 100, types: ["Psychic"], stage: "Stage1" }),
    syntheticCardDefinition({ name: "Sprout", hp: 150, types: ["Psychic"], stage: "Stage2", abilities: [{ type: "Ability", name: "Recall", text: "Once during your turn, you may draw 2 cards. If you drew any cards in this way, shuffle this Pokémon and all attached cards into your deck." }], attacks: [{ name: "Flame", text: "Put 6 damage counters on your opponent's Benched Pokémon in any way you like.", damage: "20", cost: ["Fire", "Psychic"] }] }),
    syntheticCardDefinition({ name: "Starter", hp: 80, abilities: [{ type: "Ability", name: "Recall", text: "Once during your turn, you may draw 2 cards. If you drew any cards in this way, shuffle this Pokémon and all attached cards into your deck." }] }), syntheticCardDefinition({ name: "Rival", hp: 100 }),
  ];
  const movementIndex = buildCardDefinitionIndex(movementRows);
  const movementEvidence = Object.fromEntries(movementRows.map((card) => [card.name.toLowerCase(), resolveCardDefinition(movementIndex, { name: card.name })]));
  const catalogueItem = compileBattleReplay({ ...source([completeSetup, section("PlayerOne", [action("PlayerOne played Pivot.")])]), cardDefinitions: movementEvidence });
  assert.equal(catalogueItem.frames.at(-1)?.self.discardCount, 1, "complete Trainer subtype evidence establishes disposition without a supplied tag");
  assert.equal(catalogueItem.frames.at(-1)?.self.inPlayCount, 3);
  const stadiumMovement = compileBattleReplay({ ...source([completeSetup, section("PlayerTwo", [action("PlayerTwo played Exchange to the Stadium spot.")]), section("PlayerOne", [
    action("PlayerOne played Exchange.", ["- PlayerOne discarded 2 cards.", "• Supply, Supply", "- PlayerOne drew Supply."]),
    action("PlayerOne played Archive to the Stadium spot."), action("PlayerOne played Archive.", ["- PlayerOne put a card on top of their deck."]),
  ])]), cardDefinitions: movementEvidence });
  assert.equal(stadiumMovement.frames[8].self.deckCount, 46);
  assert.equal(stadiumMovement.frames[8].self.handCount, 3);
  assert.equal(stadiumMovement.frames[8].self.discardCount, 2);
  assert.equal(stadiumMovement.frames[8].opponent.inPlayCount, 2, "another player activating the existing Stadium does not replace its ownership");
  assert.equal(stadiumMovement.frames.at(-1)?.self.deckCount, 47);
  assert.equal(stadiumMovement.frames.at(-1)?.self.handCount, 1);
  const namedStadiumSearch = (drawn: string) => compileBattleReplay({ ...source([completeSetup, section("PlayerTwo", [action("PlayerTwo played Lookup to the Stadium spot.")]), section("PlayerOne", [action("PlayerOne played Lookup.", [`- PlayerOne drew ${drawn}.`])])]), cardDefinitions: movementEvidence });
  const namedSearch = namedStadiumSearch("Keeper's Seed");
  assert.equal(namedSearch.frames.at(-1)?.self.deckCount, 46);
  assert.equal(namedSearch.frames.at(-1)?.self.handCount, 5);
  assert.equal(namedSearch.frames.at(-1)?.opponent.discardCount, 0, "a named, verified search activates the current Stadium without replaying its placement");
  assert.ok(namedStadiumSearch("a card").events.at(-1)?.unresolved, "an anonymous draw cannot establish the search's recorded Pokémon selector");
  const receivedPoolKo = compileBattleReplay({ ...source([completeSetup, section("PlayerOne", [
    action("PlayerOne attached Basic Grass Energy to Twin on the Bench."),
    action("PlayerOne attached Basic Fire Energy to Twin on the Bench."),
    action("PlayerOne played Shift.", ["- PlayerOne attached Basic Fire Energy to Starter in the Active Spot."]),
    action("PlayerOne's Starter was Knocked Out."),
  ])]), cardDefinitions: movementEvidence });
  assert.ok(receivedPoolKo.frames.at(-2)?.self.boardPools?.some((pool) => pool.cards.some((card) => card.name === "Basic Fire Energy") && pool.memberIds.length === 1));
  assert.equal(receivedPoolKo.frames.at(-1)?.self.inPlayCount, 3, "a uniquely knocked-out recipient's sole-member pool is part of its physical stack transfer");
  assert.equal(receivedPoolKo.frames.at(-1)?.self.discardCount, 3);
  assert.deepEqual(receivedPoolKo.events.at(-1)?.transaction?.stages.filter((stage) => stage.kind === "discard").flatMap((stage) => stage.cards.map((card) => card.name)), ["Starter", "Basic Fire Energy"]);
  const receivedPoolReturn = compileBattleReplay({ ...source([completeSetup, section("PlayerOne", [
    action("PlayerOne attached Basic Grass Energy to Twin on the Bench."),
    action("PlayerOne attached Basic Fire Energy to Twin on the Bench."),
    action("PlayerOne played Shift.", ["- PlayerOne attached Basic Fire Energy to Starter in the Active Spot."]),
    action("PlayerOne played Starter.", ["- PlayerOne drew 2 cards.", "- PlayerOne shuffled 2 cards into their deck.", "• Starter, Basic Fire Energy"]),
  ])]), cardDefinitions: movementEvidence });
  assert.equal(receivedPoolReturn.frames.at(-1)?.self.inPlayCount, 3);
  assert.equal(receivedPoolReturn.frames.at(-1)?.self.discardCount, 1);
  assert.equal(receivedPoolReturn.frames.at(-1)?.self.deckCount, 47);
  const returnedEnergy = receivedPoolReturn.events.at(-1)?.transaction?.stages.find((stage) => stage.kind === "shuffle")?.cards.find((card) => card.name === "Basic Fire Energy");
  assert.equal(returnedEnergy?.id, receivedPoolReturn.frames.at(-2)?.self.boardPools?.find((pool) => pool.memberIds.includes(receivedPoolReturn.frames.at(-2)!.self.active!.id))?.cards[0].id, "the originating return transaction retains the guaranteed pooled Energy's physical ID");
  const costInput = { ...source([completeSetup, section("PlayerOne", [
    action("PlayerOne attached Basic Fire Energy to Twin on the Bench."), action("PlayerOne attached Basic Psychic Energy to Twin on the Bench."),
    action("PlayerOne evolved Twin to Sprout on the Bench."), action("PlayerOne's Sprout is now in the Active Spot."),
    action("PlayerOne's Sprout used Flame on PlayerTwo's Rival for 20 damage."),
  ])]), cardDefinitions: movementEvidence };
  const costWitness = compileBattleReplay(costInput);
  const holder = costWitness.frames.at(-1)!.self.active!;
  const guaranteedHolderEnergy = [
    ...holder.energy.map((energy) => /Energy$/.test(energy) ? energy : `Basic ${energy} Energy`),
    ...(costWitness.frames.at(-1)!.self.boardPools ?? []).filter((pool) => pool.memberIds.length === 1 && pool.memberIds[0] === holder.id).flatMap((pool) => pool.cards.filter((card) => /Energy$/.test(card.name)).map((card) => card.name)),
  ];
  assert.deepEqual(guaranteedHolderEnergy.sort(), ["Basic Fire Energy", "Basic Psychic Energy"], "a native attack's complete cost proves the required attachments on its attacker");
  const missingCostText = compileBattleReplay({ ...costInput, cardDefinitions: { ...movementEvidence, sprout: { ...movementEvidence.sprout, candidates: movementEvidence.sprout.candidates.map((card) => ({ ...card, attacks: card.attacks.map((attack) => ({ ...attack, text: null })) })) } } });
  assert.ok(missingCostText.frames.at(-1)!.self.boardPools?.some((pool) => pool.cards.length && pool.memberIds.length > 1), "missing native cost-effect text cannot bind an attachment to the attacker");

  const devolution = compileBattleReplay({ ...source([completeSetup, section("PlayerOne", [
    action("PlayerOne evolved Twin to Middle on the Bench."), action("PlayerOne evolved Middle to Sprout on the Bench."), action("PlayerOne evolved Twin to Sprout on the Bench."),
  ]), section("PlayerTwo", [action("PlayerTwo ended their turn.")]), section("PlayerOne", [action("PlayerOne drew a card."), action("PlayerOne played Clock.", [
    "- PlayerOne devolved PlayerOne's Sprout to Twin on the Bench.", "- PlayerOne moved PlayerOne's Sprout to their hand.",
  ])])]), cardDefinitions: movementEvidence });
  const devolved = devolution.frames.at(-1)!.self;
  assert.deepEqual(devolved.bench.map((card) => card.name).sort(), ["Sprout", "Twin"], "the recorded endpoint replaces one evolved top even when the old copy is unidentified");
  assert.equal(devolved.deckCount, 46); assert.equal(devolved.discardCount, 1); assert.equal(devolved.prizesRemaining, 6);
  assert.equal(devolved.handCount, null); assert.equal(devolved.inPlayCount, null, "different source-compatible suffix lengths remain uncertain only across board and hand");
  assert.deepEqual(devolved.boardPools?.flatMap((pool) => pool.possiblyReturnedCards ?? []).map((card) => card.name), ["Middle"]);
  assert.equal(devolved.boardPools?.flatMap((pool) => pool.cards).filter((card) => card.name === "Middle").length, 0, "a possibly returned layer cannot be represented as certainly in play");
  assert.equal(devolved.knownHand.filter((card) => card.name === "Sprout").length, 1, "the named returned top is an annotation of the same devolution movement");
  const devolvedBaseId = devolved.bench.find((card) => card.name === "Twin")!.id;
  assert.ok(devolved.boardPools?.filter((pool) => pool.cards.some((card) => card.boardRole === "evolution") || pool.possiblyReturnedCards?.length).every((pool) => !pool.memberIds.includes(devolvedBaseId)), "confirmed Basic endpoints cannot retain or possibly own older Evolution layers");
  const mixedConditionalDepartureInput = { ...source([
    section("", [...completeSetup.actions, action("PlayerOne played Twin to the Bench.")]),
    section("PlayerOne", [action("PlayerOne drew 3 cards."), action("PlayerOne evolved Twin to Middle on the Bench."),
      action("PlayerOne evolved Middle to Sprout on the Bench."), action("PlayerOne evolved Twin to Middle on the Bench."), action("PlayerOne evolved Middle to Sprout on the Bench."), action("PlayerOne evolved Twin to Sprout on the Bench.")]),
    section("PlayerTwo", [action("PlayerTwo ended their turn.")]),
    section("PlayerOne", [action("PlayerOne drew a card."), action("PlayerOne played Clock.", ["- PlayerOne devolved PlayerOne's Sprout to Twin on the Bench.", "- PlayerOne moved PlayerOne's Sprout to their hand."]),
      action("PlayerOne's Sprout was Knocked Out."),
      action("PlayerOne played Sprout.", ["- PlayerOne drew 2 cards.", "- PlayerOne shuffled 3 cards into their deck.", "• Sprout"]),
    ]),
  ]), cardDefinitions: movementEvidence };
  const mixedConditionalDeparture = compileBattleReplay(mixedConditionalDepartureInput);
  const firstDeparture = mixedConditionalDeparture.frames.at(-2)!.self;
  const partialLocations = firstDeparture.boardPools?.find((pool) => pool.possiblyReturnedCards?.length);
  assert.equal(partialLocations?.memberIds.length, 1);
  assert.deepEqual(partialLocations?.possibleReturnedDestinations, ["discard"], "each departure contributes its location before the pool's last member leaves");
  assert.equal(firstDeparture.deckCount, 43, "an unknown KO allocation does not affect the independent deck");
  assert.equal(firstDeparture.discardCount, null, "a possible layer may have accompanied the KO, so its destination total is now unresolved");
  assert.ok(firstDeparture.boardPools?.some((pool) => pool.uncertainCards?.some((group) => group.cards.length)), "unassigned departing components cannot all remain certified under the sole surviving stack");
  const finalLocations = mixedConditionalDeparture.frames.at(-1)!.self.boardPools?.find((pool) => pool.possiblyReturnedCards?.length);
  assert.deepEqual(finalLocations?.memberIds, []);
  assert.deepEqual(finalLocations?.possibleReturnedDestinations?.slice().sort(), ["deck", "discard"], "mixed departure history remains available after no in-play assignment remains");
  assert.equal(finalLocations?.cards.length, 0, "orphan guaranteed components cannot remain duplicated in a conditional pool");
  assert.equal(mixedConditionalDeparture.frames.at(-1)!.self.discardCount, null);
  assert.equal(mixedConditionalDeparture.frames.at(-1)!.self.prizesRemaining, 6);
  assert.equal(mixedConditionalDeparture.frames.at(-1)!.self.deckCount, 44, "the later recorded draw-two and return-three delta remains exact despite unresolved component identities");
  const completeConditionalReturnInput = structuredClone(mixedConditionalDepartureInput);
  completeConditionalReturnInput.sections.at(-1)!.actions.at(-1)!.details = ["- PlayerOne drew 2 cards.", "- PlayerOne shuffled 3 cards into their deck.", "• Sprout, Twin, Middle"];
  const completeConditionalReturn = compileBattleReplay(completeConditionalReturnInput);
  assert.equal(completeConditionalReturn.frames.at(-1)!.self.deckCount, 44);
  assert.ok(completeConditionalReturn.frames.at(-1)!.self.boardPools?.find((pool) => pool.possiblyReturnedCards?.some((card) => card.name === "Middle"))?.possibleReturnedDestinations?.includes("deck"), "a complete name list cannot exclude a same-name physical alternative in another conditional location group");


  const evolvedKoActions = [
    action("PlayerOne evolved Twin to Sprout on the Bench."),
    action("PlayerOne evolved Twin to Sprout on the Bench."),
  ];
  const evolvedKo = compileBattleReplay(source([completeSetup, section("PlayerOne", [
    ...evolvedKoActions,
    action("PlayerOne attached Basic Grass Energy to Sprout on the Bench."),
    action("PlayerOne attached Basic Water Energy to Sprout on the Bench."),
    action("PlayerOne's Sprout was Knocked Out!", ["2 cards were discarded from PlayerOne's Sprout.", "• Twin, Basic Grass Energy"]),
  ])]));
  assert.equal(evolvedKo.frames[10].self.inPlayCount, 7);
  assert.equal(evolvedKo.frames[11].self.inPlayCount, 4, "the KO detail's two cards already include the underlying evolution card");
  assert.equal(evolvedKo.frames[11].self.discardCount, 3, "recorded cards below the top Pokémon plus that top card move once");
  assert.equal(evolvedKo.frames[11].self.deckCount, 47);
  const malformedKo = compileBattleReplay(source([completeSetup, section("PlayerOne", [
    ...evolvedKoActions,
    action("PlayerOne attached Basic Grass Energy to Sprout on the Bench."),
    action("PlayerOne attached Basic Water Energy to Sprout on the Bench."),
    action("PlayerOne's Sprout was Knocked Out!", ["2 cards were discarded from PlayerOne's Sprout.", "• Twin, Basic Grass Energy, Basic Water Energy"]),
  ])]));
  assert.equal(malformedKo.frames[11].self.inPlayCount, null, "a list longer than the recorded KO quantity cannot establish a physical stack count");
  assert.equal(malformedKo.frames[11].self.discardCount, null);
  assert.equal(malformedKo.frames[11].self.deckCount, 47);
  const namedLayerKo = compileBattleReplay(source([completeSetup, section("PlayerOne", [
    ...evolvedKoActions,
    action("PlayerOne put a damage counter on PlayerOne's Sprout."),
    action("PlayerOne's Sprout was Knocked Out!", ["Twin was discarded from PlayerOne's Sprout."]),
  ])]));
  assert.equal(namedLayerKo.frames[10].self.inPlayCount, 3, "a named underlying card is part of the already-counted KO stack");
  assert.equal(namedLayerKo.frames[10].self.discardCount, 2);
  assert.equal(namedLayerKo.frames[10].self.deckCount, 47);
  const uniqueToolTitle = "PlayerOne attached HP Tool to Sprout on the Bench.";
  const contradictoryKnownKo = compileBattleReplay({ ...source([completeSetup, section("PlayerOne", [
    evolvedKoActions[0],
    action("PlayerOne attached Basic Grass Energy to Sprout on the Bench."),
    action(uniqueToolTitle),
    action("PlayerOne's Sprout was Knocked Out!", ["2 cards were discarded from PlayerOne's Sprout.", "• Basic Grass Energy, HP Tool"]),
  ])]), effectTags: { [uniqueToolTitle]: "tool" } });
  assert.equal(contradictoryKnownKo.frames[9].self.inPlayCount, 6);
  assert.equal(contradictoryKnownKo.frames[10].self.inPlayCount, null, "a numeric KO total contradicting a fully known stack cannot silently omit its evolution layer");
  assert.equal(contradictoryKnownKo.frames[10].self.discardCount, null);
  assert.equal(contradictoryKnownKo.frames[10].self.deckCount, 47);
  assert.equal(contradictoryKnownKo.frames[10].self.handCount, 1);
  assert.ok(contradictoryKnownKo.events[9].unresolved?.length);
  const anonymousBench = compileBattleReplay(source([completeSetup, section("PlayerOne", [
    action("PlayerOne drew 2 cards and played them to the Bench."),
  ])]));
  assert.equal(anonymousBench.frames[7].self.deckCount, 45);
  assert.equal(anonymousBench.frames[7].self.handCount, 4);
  assert.equal(anonymousBench.frames[7].self.inPlayCount, 5, "anonymous board identities do not hide an explicit two-card Bench transfer");
  const incompleteSetup = compileBattleReplay({ ...countInput, sections: [section("", completeSetup.actions.slice(1))] });
  assert.equal(incompleteSetup.frames.at(-1)?.self.deckCount, null);
  assert.equal(incompleteSetup.frames.at(-1)?.opponent.deckCount, null, "one missing opening hand cannot establish a complete setup");
  const missingDraw = compileBattleReplay({ ...countInput, sections: [completeSetup, section("PlayerOne", [action(reconTitle)])] });
  assert.equal(missingDraw.frames[7].self.deckCount, null, "effect text alone does not establish how many optional selections occurred");
  const mulligan = compileBattleReplay(source([section("", [
    action("PlayerOne drew 7 cards for the opening hand."), action("PlayerTwo drew 7 cards for the opening hand."),
    action("PlayerOne took a mulligan."), action("PlayerOne drew 7 cards for the opening hand."),
    action("PlayerTwo drew 2 cards."), action("PlayerOne played Starter to the Active Spot."), action("PlayerTwo played Rival to the Active Spot."),
  ])]));
  assert.deepEqual(mulligan.diagnostics.unresolvedActions, []);
  assert.equal(mulligan.frames.at(-1)?.self.deckCount, 47, "a mulligan returns the previous opening hand before redrawing");
  assert.equal(mulligan.frames.at(-1)?.opponent.deckCount, 45, "recorded bonus draws reduce the opponent's deck separately from Prize setup");
  const incompleteRedraw = compileBattleReplay(source([section("", [
    ...completeSetup.actions, action("PlayerOne took a mulligan."),
  ])]));
  assert.equal(incompleteRedraw.frames[0].self.deckCount, null, "a setup with no redraw after a mulligan cannot establish the game boundary");
  const lateMulligan = compileBattleReplay(source([section("", [
    ...completeSetup.actions, action("PlayerOne took a mulligan."), action("PlayerOne drew 7 cards for the opening hand."),
  ])]));
  assert.equal(lateMulligan.frames[0].self.deckCount, null, "mulligans cannot occur after setup Pokémon placements");
  const duplicateOpening = compileBattleReplay(source([section("", [
    ...completeSetup.actions, action("PlayerOne drew 7 cards for the opening hand."),
  ])]));
  assert.equal(duplicateOpening.frames[0].self.deckCount, null, "a duplicate opening hand without a mulligan cannot establish the game boundary");
  const incompletePrizes = compileBattleReplay(source([{ ...completeSetup, prizesAfterTurn: { PlayerOne: 6, PlayerTwo: 5 } }]));
  assert.equal(incompletePrizes.frames[0].self.deckCount, null, "the six-card Prize setup is required for the standard game boundary");

  const countScope = compileBattleReplay(source([completeSetup, section("PlayerOne", [
    action("PlayerOne discarded 5 cards."),
    action("PlayerOne drew 2 cards."),
  ])]));
  assert.equal(countScope.frames[7].self.handCount, null, "a hand-only removal contradicts the four-card hand");
  assert.equal(countScope.frames[7].self.deckCount, 47, "a contradictory hand discard cannot invalidate the independently evidenced deck");
  assert.equal(countScope.frames[7].self.discardCount, null, "a failed hand-to-discard transfer invalidates both sides of that quantity boundary");
  assert.ok([countScope.frames[7].self.deckCount, countScope.frames[7].self.handCount, countScope.frames[7].self.inPlayCount, countScope.frames[7].self.discardCount, countScope.frames[7].self.prizesRemaining]
    .reduce<number>((total, value) => total + (value ?? 0), 0) <= 60, "known lower bounds cannot exceed sixty even while another zone is unknown");
  assert.equal(countScope.frames[8].self.deckCount, 45, "subsequent recorded draws continue from the evidenced deck count");
  assert.equal(countScope.frames[7].opponent.deckCount, 47);
  const deckDiscard = compileBattleReplay(source([completeSetup, section("PlayerOne", [
    action("PlayerOne discarded 2 cards from their deck."),
  ])]));
  assert.equal(deckDiscard.frames[7].self.handCount, 4, "a deck discard cannot erase the independent hand count");
  assert.equal(deckDiscard.frames[7].self.deckCount, 45, "recorded deck removals establish totals even with unidentified discarded cards");
  assert.equal(deckDiscard.frames[7].self.discardCount, 2, "the whole discard pile can be counted without knowing its card identities");
  assert.equal(deckDiscard.frames[7].self.discard.length, 0);
  assert.deepEqual(deckDiscard.frames[7].self.uncertainZones, ["discard"]);

  const inspiration = syntheticCardDefinition({ name: "Slowking", hp: 120, abilities: [], attacks: [{ name: "Seek Inspiration", cost: ["Psychic", "Colorless"], damage: null,
    text: "Discard the top card of your deck, and if that card is a Pokémon that doesn't have a Rule Box, choose 1 of its attacks and use it as this attack. (Pokémon ex, Pokémon V, etc. have Rule Boxes.)" }] });
  const deckCopyInput = { ...source([
    section("", [
      action("PlayerOne drew 7 cards for the opening hand.", ["• Slowking, Basic Psychic Energy, Ultra Ball, Rare Candy, Buddy-Buddy Poffin, Night Stretcher, Iono"]),
      action("PlayerTwo drew 7 cards for the opening hand."),
      action("PlayerOne played Slowking to the Active Spot."), action("PlayerTwo played Meowth ex to the Active Spot."),
    ]),
    section("PlayerOne", [action("PlayerOne's Slowking used Seek Inspiration on PlayerTwo’s Meowth ex for 300 damage.", [
      "- Damage breakdown:", "• Base damage: 150 damage", "• Total damage: 300 damage", "- PlayerOne chose Metallic Hammer", "- PlayerOne discarded Metagross.",
    ])]),
  ]), cardDefinitions: { slowking: resolveCardDefinition(buildCardDefinitionIndex([inspiration]), { name: "Slowking" }) } };
  const deckCopy = compileBattleReplay(deckCopyInput);
  assert.equal(deckCopy.frames[5].self.handCount, 6, "a verified top-deck attack discard never removes the named card from hand");
  assert.equal(deckCopy.frames[5].self.deckCount, 46);
  assert.equal(deckCopy.frames[5].self.discardCount, 1);
  assert.deepEqual(deckCopy.frames[5].self.discard.map((card) => card.name), ["Metagross"]);
  assert.ok(!deckCopy.events[4].unresolved?.some((message) => /count|hand removal/.test(message)));
  assert.equal(deckCopy.frames[5].self.deckCount! + deckCopy.frames[5].self.handCount! + deckCopy.frames[5].self.prizesRemaining! + deckCopy.frames[5].self.inPlayCount! + deckCopy.frames[5].self.discardCount!, 60);

  const unidentifiedRecovery = compileBattleReplay(source([completeSetup, section("PlayerOne", [
    action("PlayerOne discarded 2 cards from their deck."),
    action("PlayerOne moved 2 cards from their discard pile into their deck."),
  ])]));
  assert.equal(unidentifiedRecovery.frames[8].self.handCount, 4, "unidentified discard recovery affects its source and destination zones only");
  assert.equal(unidentifiedRecovery.frames[8].self.deckCount, 47, "recorded recovery totals are independent of discarded card identities");
  assert.equal(unidentifiedRecovery.frames[8].self.discardCount, 0);
  assert.deepEqual(unidentifiedRecovery.frames[8].self.uncertainZones, ["discard"]);
  assert.notEqual(unidentifiedRecovery.frames[8].self.active?.damageKnown, false);
  assert.equal(unidentifiedRecovery.frames[8].opponent.deckCount, 47);
  const impossibleRecovery = compileBattleReplay(source([completeSetup, section("PlayerOne", [
    action("PlayerOne moved 2 cards from their discard pile into their deck."),
  ])]));
  assert.equal(impossibleRecovery.frames[7].self.deckCount, null, "a recovery from a known empty discard cannot manufacture two extra physical cards");
  assert.equal(impossibleRecovery.frames[7].self.discardCount, null);
  assert.equal(impossibleRecovery.frames[7].self.handCount, 4);
  assert.equal(impossibleRecovery.frames[7].self.inPlayCount, 3);
  assert.equal(impossibleRecovery.frames[7].opponent.deckCount, 47);
  const contradictoryRecovery = compileBattleReplay(source([completeSetup, section("PlayerOne", [
    action("PlayerOne moved a card from their discard pile into their deck.", ["• Supply, Extra"]),
  ])]));
  assert.equal(contradictoryRecovery.frames[7].self.deckCount, null, "a moved-card list contradicting its count invalidates that destination");
  assert.equal(contradictoryRecovery.frames[7].self.handCount, 4);
  assert.notEqual(contradictoryRecovery.frames[7].self.active?.damageKnown, false);
  const conservedRecovery = compileBattleReplay(source([completeSetup, section("PlayerOne", [
    action("PlayerOne drew 2 cards.", ["• Supply, Extra, Another"]),
    action("PlayerOne shuffled their hand into their deck."),
    action("PlayerOne drew 2 cards."),
  ])]));
  assert.equal(conservedRecovery.frames[7].self.deckCount, null, "a contradictory draw cannot establish either hidden-zone total");
  assert.equal(conservedRecovery.frames[8].self.handCount, 0);
  assert.equal(conservedRecovery.frames[8].self.deckCount, 51, "a complete hand return restores deck=60−Prizes−inPlay−discard even if its size was unknown");
  assert.equal(conservedRecovery.frames[9].self.deckCount, 49);
  assert.ok(conservedRecovery.events[6].unresolved?.length, "later conservation does not erase the original source contradiction");

  const recovery = compileBattleReplay(source([section("PlayerOne", [
    action("PlayerOne drew 3 cards for the opening hand.", ["• Seedling, Supply, Supply"]),
    action("PlayerOne played Seedling to the Active Spot."),
    action("PlayerOne rearranged unknown cards in their hand."),
    action("PlayerOne drew Supply."),
    action("PlayerOne shuffled their hand into their deck."),
    action("PlayerOne drew 2 cards.", ["- Seedling, Supply"]),
    action("PlayerOne played Seedling to the Bench."),
    action("PlayerOne conceded the game."),
  ])]));
  assert.equal(recovery.frames[2].self.handCount, 2);
  assert.equal(recovery.frames[3].self.handCount, 2, "unsupported ordering does not change independently known hand membership counts");
  assert.deepEqual(recovery.frames[3].self.knownHand, []);
  assert.equal(recovery.frames[4].self.handCount, 3);
  assert.deepEqual(recovery.frames[4].self.knownHand.map((card) => card.name), ["Supply"]);
  assert.equal(recovery.frames[5].self.handCount, 0);
  assert.deepEqual(recovery.frames[5].self.knownHand, []);
  assert.equal(recovery.frames[6].self.handCount, 2);
  assert.deepEqual(recovery.frames[6].self.knownHand.map((card) => card.name), ["Seedling", "Supply"]);
  assert.equal(recovery.frames[7].self.handCount, 1);
  assert.deepEqual(recovery.frames[7].self.bench.map((card) => card.name), ["Seedling"]);
  assert.ok(!recovery.frames[7].self.uncertainZones?.includes("hand"), "an entire-hand replacement restores hand certainty");
  assert.equal(recovery.frames[7].self.deckCount, null);
  assert.deepEqual(recovery.diagnostics.unresolvedActions, [2]);

  for (const detail of [
    "PlayerOne healed 10 damage from PlayerOne's Seedling.",
    "PlayerOne healed 10 damage from PlayerOne's Seedling",
    "- PlayerOne healed 10 damage from PlayerOne's Seedling.",
    "• PlayerOne healed 10 damage from PlayerOne's Seedling",
    "- PlayerOne's Seedling healed 10 damage.",
  ]) {
    const independentDetails = compileBattleReplay(source([section("PlayerOne", [
      action("PlayerOne played Seedling to the Active Spot."),
      action("PlayerOne put 2 damage counters on PlayerOne's Seedling."),
      action("PlayerOne's Seedling used its Ability Gather.", ["PlayerOne drew 2 cards.", detail]),
    ])]));
    assert.deepEqual(independentDetails.frames[3].self.knownHand, [], "a following operation is never a drawn card's identity");
    assert.equal(independentDetails.frames[3].self.active?.damage, 10, "the independent healing detail must execute after a hidden draw");
    assert.deepEqual(independentDetails.diagnostics.unresolvedActions, []);
  }

  const handBottom = compileBattleReplay({ ...source([section("PlayerOne", [
    action("PlayerOne played Seedling to the Active Spot."), action("PlayerOne put 2 damage counters on PlayerOne's Seedling."),
    action("PlayerTwo drew 5 cards for the opening hand.", ["• One, Two, Three, Four, Five"]),
    action("PlayerOne played Hand Reset.", ["- PlayerTwo shuffled their hand.", "- PlayerTwo put 5 cards on the bottom of their deck.", "- PlayerTwo drew 3 cards."]),
    action("Pokémon Checkup"),
  ])]), effectTags: { "PlayerOne played Hand Reset.": "item" } });
  assert.equal(handBottom.frames[4].opponent.handCount, 3);
  assert.deepEqual(handBottom.frames[4].opponent.knownHand, []);
  assert.equal(handBottom.frames[4].self.active?.damage, 20);
  assert.deepEqual(handBottom.frames[5].self.active, handBottom.frames[4].self.active, "Checkup is a phase label; damage and conditions require their own recorded actions");
  assert.equal(handBottom.frames[5].opponent.handCount, 3);
  assert.deepEqual(handBottom.diagnostics.unresolvedActions, []);
  const unknownBottom = compileBattleReplay(source([section("PlayerOne", [action("PlayerTwo drew 5 cards for the opening hand."), action("PlayerTwo put 5 cards on the bottom of their deck.")])]));
  assert.deepEqual(unknownBottom.diagnostics.unresolvedActions, [1], "bottom-of-deck destination alone does not identify a source zone");

  const staleHand = compileBattleReplay(source([section("PlayerOne", [
    action("PlayerOne drew 2 cards for the opening hand.", ["• Seedling, Supply"]),
    action("PlayerOne played Twin to the Bench."),
    action("PlayerOne attached Basic Grass Energy to Twin on the Bench."),
  ])]));
  assert.deepEqual(staleHand.frames[2].self.bench.map((card) => card.name), ["Twin"], "a stale hand cannot erase an explicitly recorded board placement");
  assert.equal(staleHand.frames[2].self.handCount, null);
  assert.deepEqual(staleHand.frames[2].self.knownHand, []);
  assert.deepEqual(staleHand.frames[3].self.bench[0]?.energy, ["Grass"], "subsequent recorded actions remain usable after count drift");

  const canonicalTitle = "PlayerOne's Seedling used Gather.";
  const usedSource = source([section("PlayerOne", [
    action("PlayerOne played Seedling to the Active Spot."),
    action(canonicalTitle, ["PlayerOne drew Supply."]),
  ])]);
  const unavailableMetadata = compileBattleReplay(usedSource);
  assert.ok(unavailableMetadata.events[1].unresolved?.length);
  assert.equal(Boolean(unavailableMetadata.frames[2].self.active?.abilityUsed), false);
  assert.deepEqual(unavailableMetadata.frames[2].self.knownHand.map((card) => card.name), ["Supply"]);
  const ability = compileBattleReplay({ ...usedSource, effectTags: { [canonicalTitle]: "ability" } });
  assert.equal(ability.events[1].label, "Ability");
  assert.equal(ability.frames[2].self.active?.abilityUsed, true);
  assert.deepEqual(ability.diagnostics.unresolvedActions, []);
  const attack = compileBattleReplay({ ...usedSource, effectTags: { [canonicalTitle]: "attack" } });
  assert.equal(attack.events[1].label, "Attack");
  assert.equal(Boolean(attack.frames[2].self.active?.abilityUsed), false, "catalogued attacks cannot silently become Abilities");

  const unresolvedShuffle = compileBattleReplay(source([section("PlayerOne", [
    action("PlayerOne drew 2 cards for the opening hand.", ["• Supply, Seedling"]),
    action("PlayerOne shuffled 2 cards into their deck.", ["• Supply, Seedling"]),
  ])]));
  assert.ok(unresolvedShuffle.events[1].unresolved?.length);
  assert.equal(unresolvedShuffle.frames[2].self.handCount, null, "missing shuffle origin cannot select hand or preserve its old exact count");
  assert.deepEqual(unresolvedShuffle.frames[2].self.knownHand, []);
  assert.equal(unresolvedShuffle.frames[2].self.deckCount, null);

  const contradictions = compileBattleReplay(source([section("PlayerOne", [
    action("PlayerOne played Seedling to the Active Spot."),
    action("PlayerTwo played Rival to the Active Spot."),
    action("PlayerOne's Seedling used Tap on PlayerTwo's Rival for 20 damage.", ["Damage breakdown:", "Total damage: 40 damage", "PlayerOne drew Supply."]),
  ])]));
  assert.ok(contradictions.events[2].unresolved?.length);
  assert.equal(contradictions.frames[3].opponent.active?.damageKnown, false, "contradictory attack totals cannot display certain damage");
  assert.deepEqual(contradictions.frames[3].self.knownHand.map((card) => card.name), ["Supply"]);
  assert.equal(contradictions.status, "partial");

  const nested = compileBattleReplay({ ...source([section("PlayerOne", [
    action("PlayerTwo played Dipplin to the Active Spot."), action("PlayerOne played Munkidori to the Active Spot."),
    action("PlayerTwo's Dipplin used Festival Lead.", ["- Damage breakdown:", "• 5 Benched Pokémon: 100 damage", "- PlayerTwo's Dipplin used Do the Wave on PlayerOne’s Munkidori for 100 damage.", "- PlayerTwo chose Do the Wave"]),
  ])]), effectTags: { "PlayerTwo's Dipplin used Festival Lead.": "ability" } });
  assert.deepEqual(nested.diagnostics.unresolvedActions, []);
  assert.equal(nested.frames[3].self.active?.damage, 100, "a complete nested attack establishes damage after its explanatory breakdown");
  assert.notEqual(nested.frames[3].self.active?.damageKnown, false);
  assert.deepEqual(nested.frames[3].self.uncertainZones ?? [], []);

  const realMulligan = compileBattleReplay(source([section("", [
    action("PlayerOne drew 7 cards for the opening hand."), action("PlayerTwo drew 7 cards for the opening hand."),
    action("PlayerOne took a mulligan.", ["Cards revealed from Mulligan 1", "• Supply, Supply, Supply, Supply, Supply, Supply, Supply"]),
    action("PlayerTwo drew 1 more card because PlayerOne took at least 1 mulligan.", ["- PlayerTwo drew Buddy-Buddy Poffin."]),
    action("PlayerOne played Starter to the Active Spot."), action("PlayerTwo played Rival to the Active Spot."),
  ])]));
  assert.deepEqual(realMulligan.diagnostics.unresolvedActions, []);
  assert.deepEqual([realMulligan.frames[6].self.deckCount, realMulligan.frames[6].self.handCount, realMulligan.frames[6].opponent.deckCount, realMulligan.frames[6].opponent.handCount], [47, 6, 46, 7]);
  assert.deepEqual(realMulligan.frames[4].opponent.knownHand.map((card) => card.name), ["Buddy-Buddy Poffin"], "the named bonus annotation reveals the already-counted card once");
  assert.deepEqual(realMulligan.frames[3].self.knownHand, [], "revealed mulligan cards belong to the returned opening, not the implicit replacement hand");
  const numericBonus = compileBattleReplay(source([section("", [
    action("PlayerOne drew 7 cards for the opening hand."), action("PlayerTwo drew 7 cards for the opening hand."),
    action("PlayerOne took 2 mulligans.", ["Cards revealed from Mulligan 1", "• Boss's Orders, Ultra Ball, Gwynn, Banette, Poké Pad, Switch, Gwynn", "PlayerTwo drew 2 more cards because PlayerOne took at least 1 mulligan.", "- PlayerTwo drew 2 cards."]),
    action("PlayerOne played Starter to the Active Spot."), action("PlayerTwo played Rival to the Active Spot."),
  ])]));
  assert.deepEqual([numericBonus.frames[5].opponent.deckCount, numericBonus.frames[5].opponent.handCount], [45, 8], "the numeric detail annotates the same two mulligan bonus cards");

  const adrena = syntheticCardDefinition({ name: "Munkidori", hp: 110, abilities: [{ name: "Adrena-Brain", type: "Ability", text: "Once during your turn, if this Pokémon has any Darkness Energy attached, you may move up to 3 damage counters from 1 of your Pokémon to 1 of your opponent's Pokémon." }] });
  const counters = compileBattleReplay({ ...source([section("PlayerOne", [
    action("PlayerOne played Munkidori to the Active Spot."), action("PlayerOne put 4 damage counters on PlayerOne's Munkidori."),
    action("PlayerTwo played Dipplin to the Active Spot."), action("PlayerTwo played Dipplin to the Bench."),
    action("PlayerOne's Munkidori used Adrena-Brain.", ["- PlayerOne moved 3 damage counters from PlayerOne's Munkidori to PlayerOne's Dipplin."]),
  ])]), effectTags: { "PlayerOne's Munkidori used Adrena-Brain.": "ability" }, cardDefinitions: { munkidori: resolveCardDefinition(buildCardDefinitionIndex([adrena]), { name: "Munkidori" }) } });
  assert.equal(counters.frames[5].self.active?.damage, 10, "a unique donor's recorded reduction remains exact when only the receiving physical copy is unidentified");
  assert.notEqual(counters.frames[5].self.active?.damageKnown, false);
  assert.equal(counters.frames[5].opponent.active?.damageKnown, false);
  assert.equal(counters.frames[5].opponent.bench[0].damageKnown, false);
  const diver = syntheticCardDefinition({ name: "Dragapult ex", attacks: [{ name: "Phantom Dive", damage: "200", cost: [], text: "Put 6 damage counters on your opponent's Benched Pokémon in any way you like." }] });
  const benchOnlyCounters = compileBattleReplay({ ...source([section("PlayerOne", [
    action("PlayerOne played Dragapult ex to the Active Spot."), action("PlayerTwo played Thwackey to the Active Spot."),
    action("PlayerTwo played Thwackey to the Bench."), action("PlayerTwo played Thwackey to the Bench."),
    action("PlayerOne's Dragapult ex used Phantom Dive on PlayerTwo’s Thwackey for 200 damage.", ["- PlayerOne put 6 damage counters on PlayerOne's Thwackey."]),
  ])]), cardDefinitions: { "dragapult ex": resolveCardDefinition(buildCardDefinitionIndex([diver]), { name: "Dragapult ex" }) } });
  assert.equal(benchOnlyCounters.frames[5].opponent.active?.damage, 200);
  assert.notEqual(benchOnlyCounters.frames[5].opponent.active?.damageKnown, false, "Bench-only counter copy ambiguity cannot erase independently recorded Active attack damage");
  assert.ok(benchOnlyCounters.frames[5].opponent.bench.every((card) => card.damageKnown === false));


  // Username-substituted source excerpt; unrelated actions are omitted. The
  // third Dhelmise enters after the attachment and cannot be its carrier.
  const dhelmiseHistory = compileBattleReplay({ ...source([
    section("", [action("PlayerTwo played Dunsparce to the Active Spot.")]),
    section("PlayerTwo", [action("PlayerTwo played Shuppet to the Bench."), action("PlayerTwo attached Telepathic Psychic Energy to Shuppet on the Bench."),
      action("Telepathic Psychic Energy was activated.", ["- PlayerTwo drew 2 cards and played them to the Bench.", "• Dhelmise, Dhelmise"])]),
    section("PlayerTwo", [action("PlayerTwo attached Telepathic Psychic Energy to Dhelmise on the Bench."),
      action("Telepathic Psychic Energy was activated.", ["- PlayerTwo drew Dhelmise and played it to the Bench."]),
      action("PlayerTwo evolved Dunsparce to Dudunsparce in the Active Spot."),
      action("PlayerTwo played Dudunsparce.", ["- PlayerTwo drew 3 cards.", "- PlayerTwo shuffled 2 cards into their deck.", "• Dudunsparce, Dunsparce", "PlayerTwo's Shuppet is now in the Active Spot."]),
      action("PlayerTwo evolved Shuppet to Banette in the Active Spot.")]),
    section("PlayerOne", [action("PlayerOne played Fezandipiti ex to the Bench.")]),
    section("PlayerTwo", [action("PlayerTwo retreated Banette to the Bench.", ["- Telepathic Psychic Energy was discarded from PlayerTwo's Banette.", "PlayerTwo's Dhelmise is now in the Active Spot."]),
      action("PlayerTwo took 2 Prize cards.", ["A card was added to PlayerTwo's hand.", "A card was added to PlayerTwo's hand.", "PlayerOne's Fezandipiti ex is now in the Active Spot."])]),
    section("PlayerOne", [action("PlayerOne's Fezandipiti ex used Cruel Arrow on PlayerTwo’s Dhelmise for 200 damage. PlayerTwo's Dhelmise took 100 more damage because of Darkness Weakness.", ["- Damage breakdown:", "• Weakness to Darkness: 100 damage"]),
      action("PlayerTwo's Dhelmise was Knocked Out!", ["Telepathic Psychic Energy was discarded from PlayerTwo's Dhelmise."])]),
  ]), effectTags: { "PlayerTwo played Dudunsparce.": "ability" }, cardDefinitions: {
    dudunsparce: resolveCardDefinition(buildCardDefinitionIndex([syntheticCardDefinition({ name: "Dudunsparce", sourceCardId: "sv05-129", setId: "sv05", localId: "129", hp: 140,
      abilities: [{ name: "Run Away Draw", type: "Ability", text: "Once during your turn, you may draw 3 cards. If you drew any cards in this way, shuffle this Pokémon and all attached cards into your deck." }], attacks: [{ name: "Land Crush", cost: ["Colorless", "Colorless", "Colorless"], damage: "90", text: null }] })]), { name: "Dudunsparce" }),
    "fezandipiti ex": resolveCardDefinition(buildCardDefinitionIndex([syntheticCardDefinition({ name: "Fezandipiti ex", sourceCardId: "sv06.5-038", setId: "sv06.5", localId: "038", hp: 210,
      abilities: [{ name: "Flip the Script", type: "Ability", text: "Once during your turn, if any of your Pokémon were Knocked Out during your opponent's last turn, you may draw 3 cards. You can't use more than 1 Flip the Script Ability each turn." }],
      attacks: [{ name: "Cruel Arrow", cost: ["Colorless", "Colorless", "Colorless"], damage: null, text: "This attack does 100 damage to 1 of your opponent's Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)" }] })]), { name: "Fezandipiti ex" }),
    dhelmise: resolveCardDefinition(buildCardDefinitionIndex([syntheticCardDefinition({ name: "Dhelmise", sourceCardId: "me05-039", setId: "me05", localId: "039", hp: 140, abilities: [],
      attacks: [{ name: "Vengeful Anchor", cost: ["Psychic"], damage: "30+", text: "If you have 4 or more Pokémon that have the Hide 'n' Sneak Ability in your discard pile, this attack does 140 more damage." }] })]), { name: "Dhelmise" }),
    banette: resolveCardDefinition(buildCardDefinitionIndex([syntheticCardDefinition({ name: "Banette", sourceCardId: "me05-034", setId: "me05", localId: "034", hp: 80,
      abilities: [{ name: "Hide 'n' Sneak", type: "Ability", text: "Prevent all effects of your opponent's Pokémon's attacks and Abilities done to this Pokémon. (Damage is not an effect.)" }],
      attacks: [{ name: "Puppet Pull", cost: ["Psychic"], damage: "80", text: "You may search your deck for a card and put it into your hand. Then, shuffle your deck." }] })]), { name: "Banette" }),
    "telepathic psychic energy": resolveCardDefinition(buildCardDefinitionIndex([syntheticCardDefinition({ name: "Telepathic Psychic Energy", sourceCardId: "me03-088", setId: "me03", localId: "088", category: "Energy", hp: null, abilities: [], attacks: [],
      rules: ["As long as this card is attached to a Pokémon, it provides {P} Energy.\nWhen you attach this card from your hand to a {P} Pokémon, search your deck for up to 2 Basic {P} Pokémon and put them onto your Bench. Then, shuffle your deck."] })]), { name: "Telepathic Psychic Energy" }),
  } });
  const earlyDhelmiseIds = dhelmiseHistory.frames[5].opponent.bench.filter((card) => card.name === "Dhelmise").map((card) => card.id);
  const laterCarrier = dhelmiseHistory.frames[13].opponent.active;
  assert.equal(laterCarrier?.name, "Dhelmise");
  assert.deepEqual(laterCarrier?.energy, ["Telepathic Psychic Energy"], "the exact KO discard proves the earlier attachment/promotion relation");
  assert.ok(earlyDhelmiseIds.includes(laterCarrier!.id), "the carrier was already present before the third identical copy entered");
  const bareSurvivors = dhelmiseHistory.frames[14].opponent.bench.filter((card) => card.name === "Dhelmise");
  assert.equal(bareSurvivors.length, 2);
  assert.ok(bareSurvivors.every((card) => card.damage === 0 && card.damageKnown !== false && card.energy.length === 0), "the two untouched surviving copies remain bare and undamaged");

  const ambiguousKoPosition = compileBattleReplay(source([section("PlayerOne", [
    action("PlayerOne played Twin to the Active Spot."), action("PlayerOne played Twin to the Bench."),
    action("PlayerOne attached Basic Grass Energy to Twin in the Active Spot."), action("PlayerOne's Twin was Knocked Out!", ["Basic Grass Energy was discarded from PlayerOne's Twin."]),
    action("PlayerOne's Twin is now in the Active Spot."),
  ])]));
  assert.equal(ambiguousKoPosition.frames[4].self.active, null, "the explicit attachment discard identifies the knocked-out Active copy");
  assert.equal(ambiguousKoPosition.frames[4].self.unplaced?.length ?? 0, 0);
  assert.equal(ambiguousKoPosition.frames[4].self.bench.length, 1);
  assert.notEqual(ambiguousKoPosition.frames[4].self.activeUncertain, true);
  assert.equal(ambiguousKoPosition.frames[5].self.active?.name, "Twin", "later recorded promotion re-establishes Active presence");
  assert.equal(ambiguousKoPosition.frames[5].self.unplaced?.length, 0);
  assert.notEqual(ambiguousKoPosition.frames[5].self.active?.instanceUncertain, true, "the bare survivor's later promotion preserves its proven lineage");
  assert.equal(displayedInventory(ambiguousKoPosition.frames[3].self), 3);
  assert.equal(displayedInventory(ambiguousKoPosition.frames[4].self), 1, "the explicit KO attachment identity leaves the pool for discard");
  assert.equal(displayedInventory(ambiguousKoPosition.frames[5].self), 1, "promotion preserves the surviving physical inventory");
});

// 9/10: the compiler's public input seam must reject unusable and over-budget
// saved sources without throwing, truncating their story or substituting a pilot.
test("unusable and oversized saved sources return an unavailable replay", () => {
  const empty = compileBattleReplay(source([]));
  assert.equal(empty.status, "unsupported");
  assert.equal(empty.events.length, 0);
  assert.equal(empty.frames.length, 1);
  const invalid = source([section("", [action("PlayerOne drew a card.")])]);
  Reflect.set(invalid.sections[0].actions[0], "details", null);
  assert.equal(compileBattleReplay(invalid).status, "unsupported");
  assert.equal(compileBattleReplay({ ...source([]), selfPlayerName: "" }).status, "unsupported");
  const oversized = compileBattleReplay(source([section("PlayerOne", Array.from({ length: 601 }, () => action("PlayerOne drew a card.")))]));
  assert.equal(oversized.status, "unsupported");
  assert.equal(oversized.events.length, 0);
  assert.match(oversized.diagnostics.messages[0], /limit/);
  const foreignLanguage = compileBattleReplay(source([section("PlayerOne", [action("PlayerOne zieht eine Karte.")])]));
  assert.equal(foreignLanguage.status, "unsupported");
  assert.equal(foreignLanguage.events.length, 1, "unknown-language actions remain available as source evidence");
  assert.ok(foreignLanguage.events[0].unresolved?.length);
  assert.equal(foreignLanguage.frames[1].self.handCount, null);
});
