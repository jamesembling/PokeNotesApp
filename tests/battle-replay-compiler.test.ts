import assert from "node:assert/strict";
import test from "node:test";
import { compileBattleReplay, type ReplayLogSource } from "@/lib/battle-replay/compiler";
import type { LogAction, LogSection } from "@/types/index";
import type { ReplayCard, ReplaySide } from "@/lib/battle-replay/types";
import { collectMissingReplayArtworkNames, resolveReplayArtwork, selectReplayArtworkPrinting } from "@/lib/battle-replay/artwork";
import { replayCardDefinitionEvidence } from "@/lib/battle-replay/hp";
import { collectReplayDefinitionNames } from "@/lib/battle-replay/metadata";
import { resolveEnergyMarkers } from "@/lib/battle-replay/preview";
import { canonicalReplayGame, expectedGameChanges, syntheticCardDefinition, type ExpectedSide } from "./fixtures/battle-replay-game";

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
  assert.equal(hpReplay.frames[2].self.active?.baseHp, null, "conflicting candidate HP stays unknown before identifying evidence");
  assert.equal(hpReplay.frames[3].self.active?.baseHp, 70);
  const sourceCoverage = { scope: "tcgdex-listed-en-physical" as const, listedPrintings: 2, unlistedSets: [] };
  const narrowed = replayCardDefinitionEvidence(hpReplay.frames[3].self.active!, { seedling: { ...cardDefinitions.seedling, sourceCoverage } });
  assert.equal(narrowed?.hp, 70);
  assert.deepEqual(narrowed?.sourceCoverage, sourceCoverage, "per-instance narrowing retains the source coverage qualification");

  assert.equal(hpReplay.frames[5].self.bench[0].baseHp, null, "one physical copy's attack cannot identify another copy");
  assert.equal(hpReplay.frames[4].self.active?.remainingHp, 50);
  assert.equal(hpReplay.frames[6].self.active?.baseHp, 150);
  assert.equal(hpReplay.frames[6].self.active?.damage, 20, "evolution preserves damage, not remaining HP");
  assert.equal(hpReplay.frames[6].self.active?.remainingHp, 130);
  assert.equal(hpReplay.frames[7].self.active?.maxHp, 250);
  assert.equal(hpReplay.frames[7].self.active?.remainingHp, 230);
  assert.deepEqual(hpReplay.diagnostics.unresolvedActions, []);
  const absentRival = { ...cardDefinitions };
  delete absentRival.rival;
  const absentBoardDefinition = compileBattleReplay({ ...hpInput, cardDefinitions: absentRival });
  assert.equal(absentBoardDefinition.frames[4].self.active?.baseHp, 70);
  assert.equal(absentBoardDefinition.frames[4].self.active?.maxHp, null, "an actual opposing Pokémon with missing metadata could have a global HP Ability");
  const partialBoardDefinition = compileBattleReplay({ ...hpInput, cardDefinitions: { ...cardDefinitions, rival: { ...cardDefinitions.rival, coverage: "incomplete" } } });
  assert.equal(partialBoardDefinition.frames[4].self.active?.baseHp, 70);
  assert.equal(partialBoardDefinition.frames[4].self.active?.remainingHp, null);
  const emptyEffectRival = resolveCardDefinition(buildCardDefinitionIndex([syntheticCardDefinition({ name: "Rival", hp: 100, attacks: [], abilities: [] })]), { name: "Rival" });
  const unknownBoardEffects = compileBattleReplay({ ...hpInput, cardDefinitions: { ...cardDefinitions, rival: emptyEffectRival } });
  assert.equal(unknownBoardEffects.frames[4].self.active?.baseHp, 70);
  assert.equal(unknownBoardEffects.frames[4].self.active?.maxHp, null, "a Pokémon with neither effect list available cannot establish absence of a global HP Ability");
  const offboardDefinition = compileBattleReplay({ ...hpInput, cardDefinitions: { ...cardDefinitions, unseen: resolveCardDefinition(buildCardDefinitionIndex([]), { name: "Unseen" }, "unavailable") } });
  assert.equal(offboardDefinition.frames[7].self.active?.maxHp, 250, "unavailable metadata for an off-board card cannot invalidate the visible board");

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
  assert.deepEqual(twins.frames[5].self.bench.map((card) => card.energy), [["Grass"], []], "distinct physical copies must not be guessed");
  assert.ok(twins.frames[5].self.uncertainZones?.includes("board"));
  assert.equal(twins.events[4].transaction, undefined, "a rejected attachment cannot animate as successful");
  assert.match(twins.events[5].unresolved?.[0] ?? "", /origin/);
  assert.equal(twins.frames[6].self.active?.abilityUsed, true, "the explicit Ability itself remains evidenced");
  assert.deepEqual(twins.frames[6].self.active?.energy, []);
  assert.deepEqual(twins.frames[6].self.knownHand.map((card) => card.name), ["Supply"], "a later independent draw survives an unsupported attachment detail");

  // The first copy has passed through Active and a turn reset; the second
  // arrived later. Those histories do not distinguish their present bare state.
  const interchangeable = compileBattleReplay(source([
    section("", [action("PlayerOne played Dreepy to the Active Spot.")]),
    section("PlayerOne", [
      action("PlayerOne played Dreepy to the Bench."),
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
  ])]));
  assert.equal(countedKo.frames[8].self.inPlayCount, 5);
  assert.equal(countedKo.frames[9].self.inPlayCount, 2, "recorded KO attachment counts identify a physical total without selecting a receiving copy");
  assert.equal(countedKo.frames[9].self.discardCount, 3, "KO moves its top Pokémon and two attachments exactly once even when identities are missing");
  assert.equal(countedKo.frames[9].self.deckCount, 47);
  assert.equal(countedKo.frames[9].self.handCount, 2);
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
