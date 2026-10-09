import assert from "node:assert/strict";
import test from "node:test";
import { compileBattleReplay, isReplayPurePreventionStadiumRules, replayPassiveInventoriesComplete, type ReplayLogSource } from "@/lib/battle-replay/compiler";
import type { LogAction, LogSection } from "@/types/index";
import type { ReplayCard, ReplaySide, ReplayZoneCard } from "@/lib/battle-replay/types";
import { collectMissingReplayArtworkNames, resolveReplayArtwork, selectReplayArtworkPrinting } from "@/lib/battle-replay/artwork";
import { createReplayHpContext, replayCardDefinitionEvidence } from "@/lib/battle-replay/hp";
import { selectExactReplayArtwork } from "@/lib/battle-replay/selected-artwork-server";
import { collectReplayDefinitionNames } from "@/lib/battle-replay/metadata";
import { resolveEnergyMarkers, resolveReplayCardPreviewDefinition, resolveReplayBoardDisplay, resolveReplayDisplayEvent } from "@/lib/battle-replay/preview";
import { resolveReplayEffectConstraint } from "@/lib/battle-replay/effect-targets";
import { isReplayAbilityLimitContextNeutral, isReplayCopyIndependentOnceAbilityText, isReplaySelfAttackPermission, resolveReplayAbilityActivation, stripReplayNamedAbilityLimits, supportsReplayActiveAbilityPredicate } from "@/lib/battle-replay/ability-eligibility";
import { collectReplayPrintingProofs } from "@/lib/battle-replay/printing-proofs";
import { hasReplayCopyProofs, replayCopyKey, resolveReplayKnockoutHpInventory, solveReplayCopyConstraints, type CopyFact, type CopyStep } from "@/lib/battle-replay/copy-constraints";
import { canonicalReplayGame, expectedGameChanges, syntheticCardDefinition, type ExpectedSide } from "./fixtures/battle-replay-game";

import { getLinkedReplayDefinitions, getReplayLinkedDeckListCompatibility } from "@/lib/battle-replay/linked-deck-list";
import { selectRetainedCardDefinitions } from "@/lib/card-definition-catalog/retention.mjs";
import { buildCardDefinitionIndex, getCardDefinitionTrainerFieldAgreement, resolveCardDefinition } from "@/lib/card-definition-catalog/resolve";
import { identifiedBattleLog, identifiedCardDefinitions } from "./fixtures/battle-log-card-identifiers";
import { parseBattleLog } from "@/lib/log-import/parser";
import { logCardIdentity, stripLogCardIdentifiers } from "@/lib/battle-log/card-identifiers";
import { createReplayEffectEvidenceResolver } from "@/lib/battle-replay/effect-evidence";
import { replayAttachmentCards } from "@/lib/battle-replay/preview";
import type { IdentificationCatalog } from "@/lib/log-import/types";

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

  // The real PTCGL export protects the importer -> compiler boundary for both
  // tokenized printings and the existing name-only form, without rewriting raw evidence.
  const catalog: IdentificationCatalog = {
    pokemon: { bySlug: new Map(), normalizedNameToSlug: new Map(["Relicanth", "Totodile", "Croconaw", "Metang"].map((name) => [name.toLowerCase(), name.toLowerCase()])), slugToAncestors: new Map(), slugToFamilyRoot: new Map(), maxNameTokens: 1 },
    archetypes: { byId: new Map(), normalizedLabelToIds: new Map(), spriteToCandidateArchetypes: new Map(), familyRootToCandidateArchetypes: new Map() },
  };
  const importAndReplay = (rawLog: string, exact = true) => {
    const parsed = parseBattleLog({ rawLog, ptcglUsername: "JammerUK1993", catalog });
    const rows = [...identifiedCardDefinitions];
    // A different gameplay printing must not displace the source's exact ID.
    if (exact) rows.push({ ...rows.find((card) => card.name === "Totodile")!, setId: "sv03", localId: "038", sourceCardId: "sv03-038", hp: 120 });
    const index = buildCardDefinitionIndex(rows);
    const definitions = Object.fromEntries([...index.keys()].map((name) => [name, resolveCardDefinition(index, { name })]));
    // This export supplies no format; don't impose Standard rotation on Jacq.
    const resolver = createReplayEffectEvidenceResolver(definitions, [], { playedOn: "2026-10-09" });
    const effectTags = Object.fromEntries(parsed.sections.flatMap((section) => section.actions.flatMap((action) => [action.title, ...action.details]))
      .flatMap((line) => { const tag = resolver.tag(line); return tag === "supporter" || tag === "item" || tag === "tool" || tag === "stadium" || tag === "ability" || tag === "attack" ? [[line, tag]] : []; }));
    return { parsed, program: compileBattleReplay({ ...canonicalReplayGame, ...parsed.players, date: "2026-10-09", format: "", sections: parsed.sections, cardDefinitions: definitions, effectTags }) };
  };
  const identified = importAndReplay(identifiedBattleLog);
  assert.equal(identified.parsed.rawLog, identifiedBattleLog);
  assert.ok(identified.parsed.sections.some((section) => section.actions.some((action) => action.title.includes("(sv5_84) Relicanth"))));
  assert.deepEqual(identified.parsed.stats, { winner: "tyDspen", result: "Loss", totalTurns: 2, coinTossWon: false, goOrder: "Second", selfPrizesTaken: 0, opponentPrizesTaken: 0, selfAttackDamage: 0, opponentAttackDamage: 30, selfMulligans: 0, opponentMulligans: 0, reason: "Concede" });
  assert.deepEqual(identified.program.diagnostics.unresolvedActions, []);
  const final = identified.program.frames.at(-1)!;
  assert.deepEqual([final.self.handCount, final.self.deckCount, final.self.discardCount, final.self.inPlayCount], [4, 44, 4, 2]);
  assert.deepEqual([final.opponent.handCount, final.opponent.deckCount, final.opponent.discardCount, final.opponent.inPlayCount], [6, 43, 1, 4]);
  assert.deepEqual([final.self.active?.name, final.self.active?.setId, final.self.active?.localId, final.self.active?.baseHp, final.self.active?.damage, final.self.active?.remainingHp], ["Totodile", "sv05", "39", 70, 30, 40]);
  assert.equal(resolveReplayCardPreviewDefinition(final.self.active!, identified.program)?.selectedPrinting?.sourceCardId, "sv05-039");
  assert.deepEqual([final.opponent.active?.name, final.opponent.active?.setId, final.opponent.active?.localId, final.opponent.active?.baseHp], ["Croconaw", "sv05", "40", 90]);
  assert.deepEqual(final.opponent.active?.underlying.map((card) => [card.name, card.setId, card.localId]), [["Totodile", "sv05", "39"]]);
  assert.deepEqual(replayAttachmentCards(final.opponent.active!).map((card) => [card.name, card.setId, card.localId]), [["Basic Water Energy", "sve", "3"], ["Basic Water Energy", "sve", "3"]]);
  assert.deepEqual(final.self.discard.map((card) => [card.name, card.setId, card.localId]).sort(), [["Ultra Ball", "sv01", "196"], ...Array.from({ length: 3 }, () => ["Basic Fighting Energy", "sve", "6"])].sort());
  assert.deepEqual(final.self.bench.map((card) => [card.name, card.baseHp, card.energy]), [["Relicanth", 100, []]]);
  assert.deepEqual(final.opponent.knownHand.map((card) => [card.name, card.setId, card.localId]), [["Metang", "sv05", "114"]]);
  const legacy = importAndReplay(stripLogCardIdentifiers(identifiedBattleLog), false);
  assert.deepEqual(legacy.parsed.stats, identified.parsed.stats);
  for (const actor of ["self", "opponent"] as const) {
    assert.deepEqual(legacy.parsed.pokemonEvidence[actor].mentionCounts, identified.parsed.pokemonEvidence[actor].mentionCounts);
    assert.equal(legacy.parsed.pokemonEvidence[actor].normalizedText, identified.parsed.pokemonEvidence[actor].normalizedText);
  }
  assert.deepEqual(legacy.program.frames.map((frame) => [projectSide(frame.self), projectSide(frame.opponent)]), identified.program.frames.map((frame) => [projectSide(frame.self), projectSide(frame.opponent)]));
  const missing = importAndReplay(identifiedBattleLog.replaceAll("(sv5_39)", "(unknown_999)"));
  assert.equal(missing.program.frames.at(-1)!.self.active?.damage, 30, "missing exact catalogue entries never erase recorded damage or the board");
  assert.equal(missing.program.frames.at(-1)!.self.bench[0].baseHp, 100, "a missing printing stays local");
  const mixedEnergyPrintings = importAndReplay(identifiedBattleLog
    .replace("(sv1_196) Ultra Ball, (sve_6) Basic Fighting Energy", "(sv1_196) Ultra Ball, (sve_16) Basic Fighting Energy")
    .replace("attached (sve_6) Basic Fighting Energy to (sv5_84)", "attached (sve_16) Basic Fighting Energy to (sv5_84)")
    .replace("(sve_6) Basic Fighting Energy was discarded", "(sve_16) Basic Fighting Energy was discarded"));
  assert.deepEqual(mixedEnergyPrintings.program.diagnostics.unresolvedActions, []);
  assert.deepEqual(mixedEnergyPrintings.program.frames.at(-1)!.self.discard.filter((card) => card.name === "Basic Fighting Energy").map((card) => card.localId).sort(), ["16", "6", "6"], "same-name cards keep their distinct printing multiset through removal and retreat");
  assert.deepEqual(logCardIdentity("(sv4pt5_001) Pikachu", "Pikachu"), { setId: "sv04.5", localId: "1" });
  const namesakeAttack = "tyDspen's (sv5_39) Totodile used Scratch on JammerUK1993’s (sv3_38) Totodile for 10 damage.";
  assert.deepEqual(logCardIdentity(namesakeAttack, "Totodile", "tyDspen", ["tyDspen", "JammerUK1993"]), { setId: "sv05", localId: "39" });
  assert.deepEqual(logCardIdentity(namesakeAttack, "Totodile", "JammerUK1993", ["tyDspen", "JammerUK1993"]), { setId: "sv03", localId: "38" });
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
  const legalLinkedPrints = [{ ...linkedPrints[0], regulationMark: "H" }, { ...linkedPrints[1], regulationMark: "G" }];
  const legalLinkedEvidence = { seedling: resolveCardDefinition(buildCardDefinitionIndex(legalLinkedPrints), { name: "Seedling" }) };
  const illegalAssociation = getLinkedReplayDefinitions(linkedCards, legalLinkedEvidence, { synthetic: "TST", alternate: "ALT" }, "TEF-30C", "2026-09-27");
  assert.deepEqual(illegalAssociation.seedling.candidatePrintingIds, [legalLinkedPrints[0].sourceCardId], "a live list cannot reintroduce a rotated functional printing into the saved Standard domain");
  assert.equal(illegalAssociation.seedling.formatBasis?.status, "conflicting");
  const legalContext = createReplayHpContext(legalLinkedEvidence, "TEF-30C", illegalAssociation, "2026-09-27");
  assert.equal(legalContext.resolve({ name: "Seedling", definitionOwner: "self" })?.hp, legalLinkedPrints[0].hp, "refusing an invalid association leaves the independent legal domain intact");
  assert.equal(legalContext.resolve({ name: "Seedling", definitionOwner: "self", setId: "alternate", localId: "2" })?.hp, 80, "exact recorded source identity survives its internal format conflict");
  const scopedPrint = { ...legalLinkedPrints[0], attacks: [{ name: "Tap", text: null, damage: "10", cost: ["Colorless"] }] };
  const scopedPool = selectRetainedCardDefinitions([scopedPrint], { savedFormats: ["TEF-30C"], retainedOn: "2026-10-04" });
  const scopedRaw = { seedling: { ...resolveCardDefinition(buildCardDefinitionIndex(scopedPool.definitions), { name: "Seedling" }), sourceCoverage: scopedPool.sourceCoverage } };
  assert.equal(createReplayHpContext(scopedRaw).resolve({ name: "Seedling" })?.coverage, "incomplete", "blank undated compiler context must still evaluate retained-scope completeness");
  assert.equal(createReplayHpContext(scopedRaw).resolve({ name: "Seedling", setId: scopedPrint.setId, localId: scopedPrint.localId })?.hp, scopedPrint.hp, "an exact retained identity is independent of omitted same-name history");
  const staleScoped = { seedling: { ...scopedRaw.seedling, coverage: "stale" as const } };
  const staleHp = createReplayHpContext(staleScoped, "TEF-30C", undefined, "2026-09-27");
  const staleExact: ReplayZoneCard = { id: "stale-exact", name: "Seedling", imageUrl: "", setId: scopedPrint.setId, localId: scopedPrint.localId };
  staleHp.decorateCard(staleExact);
  assert.notEqual(staleHp.collectResolutions()[staleExact.definitionKey!]?.hpBasis, "known", "exact identity cannot promote stale transport HP into a known display fact");
  const scopedLinked = getLinkedReplayDefinitions([linkedCards[0]], scopedRaw, { synthetic: "TST" }, "TEF-30C", "2026-09-27");
  assert.equal(scopedLinked.seedling.coverage, "complete", "a valid dated linked list carries its retained-scope context through the final printing query");
  const scopedHp = createReplayHpContext(scopedRaw, "TEF-30C", scopedLinked, "2026-09-27");
  assert.equal(scopedHp.resolve({ name: "Seedling", definitionOwner: "self", observedEffects: ["Tap"] })?.coverage, "complete", "later linked effect resolution preserves saved format and date");
  const datedAfterSnapshot = createReplayHpContext(scopedRaw, "TEF-30C", undefined, "2026-10-05");
  assert.equal(datedAfterSnapshot.resolve({ name: "Seedling" })?.coverage, "complete", "existing catalogue facts remain usable for games after the snapshot");
  assert.equal(datedAfterSnapshot.resolve({ name: "Seedling", setId: scopedPrint.setId, localId: scopedPrint.localId })?.hp, scopedPrint.hp, "an exact immutable printing may bypass a later snapshot name-domain horizon");
  assert.equal(getLinkedReplayDefinitions([linkedCards[0]], scopedRaw, { synthetic: "TST" }, "TEF-30C", "2026-10-05").seedling.coverage, "complete", "linked retained printings remain usable after catalogue capture");
  const itemRule = "Search your deck for a Pokémon that doesn't have a Rule Box, reveal it, and put it into your hand. Then, shuffle your deck. (Pokémon ex, Pokémon V, etc. have Rule Boxes.)";
  const eligibleItem = syntheticCardDefinition({ name: "Poké Pad", sourceCardId: "me03-081", setId: "me03", localId: "081", setReleaseDate: "2026-03-27",
    category: "Trainer", trainerType: "Item", hp: null, stage: null, types: null, attacks: [], rules: [itemRule], regulationMark: "J" });
  const boundaryItem = { ...eligibleItem, sourceCardId: "30th-126", setId: "30th", localId: "126", setReleaseDate: "2026-09-16" };
  const itemPool = selectRetainedCardDefinitions([eligibleItem, boundaryItem], { savedFormats: ["TEF-PBL"], retainedOn: "2026-10-04" });
  const itemQuery = { name: "Poké Pad", declaredFormat: "TEF-PBL", playedOn: "2026-09-16" };
  const boundaryEvidence = resolveCardDefinition(buildCardDefinitionIndex(itemPool.definitions), itemQuery, "complete", null, itemPool.sourceCoverage);
  assert.equal(boundaryEvidence.coverage, "incomplete", "same-day digital availability remains unverified");
  assert.deepEqual(boundaryEvidence.agreedFacts, {}, "classification does not promote full printing agreement");
  assert.equal(getCardDefinitionTrainerFieldAgreement(boundaryEvidence)?.trainerType, "item", "all possible availability candidates still agree on supplied Trainer subtype");
  const nullableRules = structuredClone(boundaryEvidence);
  nullableRules.unverifiedCandidates![0].rules = null;
  assert.equal(getCardDefinitionTrainerFieldAgreement(nullableRules)?.candidateRules.find((card) => card.sourceCardId === boundaryItem.sourceCardId)?.rules, null, "missing rule text remains available as a disposition-proof blocker");
  const conflictingSubtype = structuredClone(boundaryEvidence);
  conflictingSubtype.unverifiedCandidates![0].trainerType = "Tool";
  assert.equal(getCardDefinitionTrainerFieldAgreement(conflictingSubtype), null, "a conflicting possible subtype cannot borrow Item classification");
  assert.equal(getCardDefinitionTrainerFieldAgreement(resolveCardDefinition(buildCardDefinitionIndex(itemPool.definitions), itemQuery, "incomplete", null, itemPool.sourceCoverage)), null, "an incomplete loaded name domain cannot certify subtype agreement");
  const usedItemIndex = buildCardDefinitionIndex([eligibleItem, { ...boundaryItem, rules: null }]);
  const usedItem = compileBattleReplay({ ...source([section("PlayerOne", [action("PlayerOne played Poké Pad.")])]),
    format: itemQuery.declaredFormat, date: itemQuery.playedOn,
    cardDefinitions: { "poke pad": { ...resolveCardDefinition(usedItemIndex, { name: itemQuery.name }), sourceCoverage: itemPool.sourceCoverage } } });
  assert.deepEqual(usedItem.frames[1].self.discard.map((card) => card.name), ["Poké Pad"], "a completed known Item use follows the owner-discard rule even when possible printing prose is missing");
  assert.deepEqual(usedItem.diagnostics.unresolvedActions, []);
  assert.ok(usedItem.cardResolutions);
  assert.equal(usedItem.cardResolutions[usedItem.frames[1].self.discard[0].definitionKey!].coverage, "incomplete", "ordinary disposition does not certify printing legality or complete card text");
  const livePrint = { ...scopedPrint, setId: "me03", regulationMark: "J", setReleaseDate: "2026-03-27" };
  const liveRaw = { seedling: resolveCardDefinition(buildCardDefinitionIndex([livePrint]), { name: "Seedling" }) };
  const liveList = getLinkedReplayDefinitions([{ ...linkedCards[0], set: "POR" }], liveRaw, { me03: "POR" }, "TEF-POR", "2026-03-26T18:00:00Z");
  assert.equal(liveList.seedling.coverage, "complete", "a source-certified digital launch is usable linked evidence before paper release");
  const liveHp = createReplayHpContext(liveRaw, "TEF-POR", liveList, "2026-03-26T18:00:00Z");
  assert.equal(liveHp.resolve({ name: "Seedling", definitionOwner: "self", observedEffects: ["Tap"] })?.hp, livePrint.hp, "linked activation uses the same digital availability policy as the resolver");
  const liveDisplay: ReplayZoneCard = { id: "live-display", name: "Seedling", imageUrl: "", definitionOwner: "self" };
  liveHp.decorateCard(liveDisplay);
  assert.equal(liveHp.collectResolutions()[liveDisplay.definitionKey!]?.selectedDefinition?.sourceCardId, livePrint.sourceCardId, "display availability cannot hide a source-certified launch-day printing");
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
    syntheticCardDefinition({ attacks: [{ name: "Tap", text: "", damage: "10", cost: ["Grass"] }] }),
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
  // Route elimination is a direct public resolver boundary. The state edits
  // below are module inputs, not claims about an independently recorded game.
  const memory = { name: "Memory Helix", type: "Ability", text: "This Pokémon can use the attacks of any of your Benched Pokémon. (You still need the necessary Energy to use each attack.)" };
  const versatile = { name: "Versatile", type: "Poke-BODY", text: "Mew ex can use the attacks of all Pokémon in play as its own. (You still need the necessary Energy to use each attack.)" };
  const teleport = { name: "Teleportation Burst", damage: "30", cost: [], text: "Switch this Pokémon with 1 of your Benched Pokémon." };
  const gale = { name: "Gale Thrust", damage: "60+", cost: [], text: "If this Pokémon moved from your Bench to the Active Spot this turn, this attack does 170 more damage." };
  const routeDefinitions = [
    syntheticCardDefinition({ name: "Mew ex", sourceCardId: "memory-print", abilities: [memory], attacks: [teleport] }),
    syntheticCardDefinition({ name: "Mew ex", sourceCardId: "versatile-print", abilities: [versatile], attacks: [] }),
    syntheticCardDefinition({ name: "Mega Lopunny ex", sourceCardId: "donor-print", abilities: [], attacks: [gale] }),
    syntheticCardDefinition({ name: "Rival", abilities: [], attacks: [] }),
  ];
  const routeContext = (definitions = routeDefinitions) => {
    const index = buildCardDefinitionIndex(definitions);
    return createReplayHpContext(Object.fromEntries([...new Set(definitions.map((card) => card.name))].map((name) => [name.toLowerCase(), resolveCardDefinition(index, { name })])));
  };
  const routeState = structuredClone(hpReplay.frames[2]);
  const executor = routeState.self.active!; executor.name = "Mew ex"; executor.observedEffects = []; delete executor.setId; delete executor.localId;
  const donor: ReplayCard = { ...structuredClone(executor), id: "route-donor", name: "Mega Lopunny ex" };
  routeState.self.inPlayCount = 1; routeState.opponent.inPlayCount = 1;
  assert.equal(routeContext().attackPrintingEvidence(executor, "Teleportation Burst", routeState).status, "native", "complete route absence permits native execution without attack-name preseeding");
  routeState.self.bench.push(donor); routeState.self.inPlayCount = 2;
  const copiedRoute = routeContext().attackPrintingEvidence(executor, "Gale Thrust", routeState);
  assert.equal(copiedRoute.status, "copied");
  assert.equal(copiedRoute.status === "copied" ? copiedRoute.definitionCard.id : undefined, donor.id);
  assert.equal(copiedRoute.status === "copied" ? copiedRoute.observedEffect : undefined, undefined, "two viable copy permissions do not prove one native Mew printing");
  const mixedRoute = routeContext([...routeDefinitions, syntheticCardDefinition({ name: "Mega Lopunny ex", sourceCardId: "teleport-donor", abilities: [], attacks: [teleport] })]);
  assert.equal(mixedRoute.attackPrintingEvidence(executor, "Teleportation Burst", routeState).status, "unmodelled", "native execution cannot erase a possible same-name borrowed route");
  const missingInventory = structuredClone(routeState); missingInventory.self.inPlayCount = 3;
  assert.equal(routeContext().attackPrintingEvidence(executor, "Gale Thrust", missingInventory).status, "unmodelled", "an unseen donor cannot be omitted to prove route absence");
  const onlyBenchContext = routeContext(routeDefinitions.filter((card) => card.sourceCardId !== "versatile-print"));
  const unplacedDonor = structuredClone(routeState); unplacedDonor.self.bench = []; unplacedDonor.self.unplaced = [donor]; unplacedDonor.self.activeUncertain = true;
  assert.equal(onlyBenchContext.attackPrintingEvidence(executor, "Gale Thrust", unplacedDonor).status, "unmodelled", "unplaced possible Bench donors do not become definite donors");
  const incompleteDonor = routeContext(routeDefinitions.map((card) => card.name === "Mega Lopunny ex" ? { ...card, attacks: [{ ...gale, text: null }] } : card));
  assert.equal(incompleteDonor.attackPrintingEvidence(executor, "Gale Thrust", routeState).status, "unmodelled");
  const unknownPermission = routeContext(routeDefinitions.map((card) => card.sourceCardId === "memory-print" ? { ...card, abilities: [{ ...memory, text: "This Pokémon may use an attack of a Pokémon of your choice." }] } : card));
  assert.equal(unknownPermission.attackPrintingEvidence(executor, "Gale Thrust", routeState).status, "unmodelled");
  const grantingTool = syntheticCardDefinition({ name: "Granting Tool", category: "Trainer", trainerType: "Tool", rules: ["The Pokémon this card is attached to has the following attack."], attacks: [teleport] });
  const toolRoute = structuredClone(routeState); toolRoute.opponent.active!.tool = grantingTool.name;
  assert.equal(routeContext([...routeDefinitions, grantingTool]).attackPrintingEvidence(executor, "Teleportation Burst", toolRoute).status, "unmodelled", "unmodelled foreign granting/suppression context cannot be ignored");
  const departedPermission = syntheticCardDefinition({ name: "Departed source", abilities: [{ name: "Grant", type: "Ability", text: "During this turn, your Pokémon may use the following attack." }], attacks: [] });
  const temporalContext = routeContext([...routeDefinitions, departedPermission]);
  assert.equal(temporalContext.attackPrintingEvidence(executor, "Teleportation Burst", routeState, [
    { card: { ...donor, name: departedPermission.name }, effect: "Grant", kind: "ability" },
  ]).status, "unmodelled", "a recorded same-section grant remains relevant after its source leaves play");
  const departedTrainer = { ...grantingTool, name: "Granting Item", trainerType: "Item" };
  assert.equal(routeContext([...routeDefinitions, departedTrainer]).attackPrintingEvidence(executor, "Teleportation Burst", routeState, [
    { card: { ...donor, name: departedTrainer.name }, kind: "trainer" },
  ]).status, "unmodelled");
  const nullRecordedAttack = routeContext(routeDefinitions.map((card) => card.name === "Mega Lopunny ex" ? { ...card, attacks: [{ ...gale, text: null }] } : card));
  assert.equal(nullRecordedAttack.attackPrintingEvidence(executor, "Teleportation Burst", routeState, [
    { card: donor, effect: "Gale Thrust", kind: "attack" },
  ]).status, "unmodelled", "missing prose on an executed prior attack cannot establish absence of a persistent grant");
  assert.equal(routeContext().attackPrintingEvidence(executor, "Teleportation Burst", routeState, [
    { card: donor, effect: "Absent recorded effect", kind: "attack" },
  ]).status, "unmodelled");
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
    budew: resolveCardDefinition(buildCardDefinitionIndex([syntheticCardDefinition({ name: "Budew", hp: 30, abilities: [], attacks: [] })]), { name: "Budew" }),
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
  // Display-only position assignment must not turn the Active episode's
  // native family into immutable evidence for a projected Bench original.
  const episodeDisplayFrame = structuredClone(printingContinuity.frames[13]);
  const episodeActive = episodeDisplayFrame.opponent.active!;
  const unprovenOriginal = episodeDisplayFrame.opponent.bench.find((card) => card.name === "Dipplin")!;
  const nativeUnproven = episodeDisplayFrame.opponent.boardPools!.flatMap((pool) => pool.memberEvidence ?? []).find((card) => card.id === unprovenOriginal.id)!;
  nativeUnproven.definitionKey = "display-native-broad";
  const nativeDictionary = { ...printingContinuity.cardResolutions, "display-native-broad": { ...resolveReplayCardPreviewDefinition(unprovenOriginal, printingContinuity)!, printedHp: 90, hpBasis: "probable" as const } };
  episodeDisplayFrame.opponent.active = { ...unprovenOriginal, activeEpisodeId: episodeActive.activeEpisodeId, activePrintingEffects: episodeActive.activePrintingEffects,
    definitionKey: episodeActive.definitionKey, baseHp: 80, maxHp: 80, hp: 80, hpBasis: "known" };
  episodeDisplayFrame.opponent.bench = episodeDisplayFrame.opponent.bench.filter((card) => card.id !== unprovenOriginal.id).concat(episodeActive);
  episodeDisplayFrame.boardProjection = { opponent: { basis: "plausible", cards: [episodeActive, unprovenOriginal].map((card) => ({
    id: card.id, name: card.name, position: card.id === episodeActive.id ? "active" : "bench", damage: 0,
    energy: ["Grass"], ...(card.id === episodeActive.id ? { tool: "Brave Bangle" } : {}), underlyingNames: card.underlying.map((layer) => layer.name), plausibleFields: ["position", "tool"],
  })) } };
  const unchangedEpisode = JSON.stringify(episodeDisplayFrame);
  const episodeDisplay = resolveReplayBoardDisplay(episodeDisplayFrame, nativeDictionary);
  assert.equal(episodeDisplay.opponent.active?.baseHp, 80);
  assert.equal(episodeDisplay.opponent.active?.hpBasis, "known", "native position evidence stays on the projected Active episode");
  const projectedBenchOriginal = episodeDisplay.opponent.bench.find((card) => card.id === unprovenOriginal.id)!;
  assert.equal(projectedBenchOriginal.baseHp, 90);
  assert.equal(projectedBenchOriginal.hpBasis, "probable", "an unproven Bench original regains its native broad display query");
  assert.equal(projectedBenchOriginal.activePrintingEffects, undefined);
  assert.equal(JSON.stringify(episodeDisplayFrame), unchangedEpisode);
  assert.equal(resolveReplayBoardDisplay(episodeDisplayFrame).opponent, episodeDisplayFrame.opponent, "without the native dictionary, the position projection refuses rather than leaking an Active-only family onto Bench");
  const uncertainModifierDisplay = structuredClone(episodeDisplayFrame);
  uncertainModifierDisplay.boardProjection!.opponent!.cards.find((card) => card.position === "active")!.hpUncertain = true;
  const uncertainModifierActive = resolveReplayBoardDisplay(uncertainModifierDisplay, nativeDictionary).opponent.active!;
  assert.equal(uncertainModifierActive.baseHp, 80, "modifier uncertainty preserves the Active episode's printed HP");
  assert.equal(uncertainModifierActive.hp, null, "modifier uncertainty applies after restoring the Active episode query");
  assert.equal(uncertainModifierActive.maxHp, null);
  assert.equal(uncertainModifierActive.remainingHp, null);
  assert.equal(uncertainModifierActive.hpBasis, "unknown");
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

  // Exact catalogue wording from Growing Grass Energy (me03-086): the typed
  // attachment predicate must work with printed symbols as well as type names.
  const grassEnergy = syntheticCardDefinition({ name: "Growing Grass Energy", hp: null, category: "Energy", attacks: [],
    rules: ["As long as this card is attached to a Pokémon, it provides {G} Energy.\nThe {G} Pokémon this card is attached to gets +20 HP."] });
  const typedDefinitions = [...definitions.map((card) => ({ ...card, types: [card.name === "Rival" ? "Fire" : "Grass"] })), grassEnergy];
  const typedIndex = buildCardDefinitionIndex(typedDefinitions);
  const typedContext = createReplayHpContext(Object.fromEntries([...typedIndex.keys()].map((name) => [name, resolveCardDefinition(typedIndex, { name })])));
  const typedState = structuredClone(hpReplay.frames[6]);
  typedState.self.active!.energy = ["Growing Grass Energy", "Growing Grass Energy"];
  typedState.opponent.active!.energy = ["Growing Grass Energy"];
  typedContext.update(typedState);
  assert.equal(typedState.self.active?.maxHp, 190, "both applicable typed attachments add their HP bonuses");
  assert.equal(typedState.opponent.active?.maxHp, 100, "the same printed symbol predicate does not boost another type");
  const unknownTypeIndex = buildCardDefinitionIndex(typedDefinitions.map((card) => card.name === "Sprout" ? { ...card, types: null } : card));
  createReplayHpContext(Object.fromEntries([...unknownTypeIndex.keys()].map((name) => [name, resolveCardDefinition(unknownTypeIndex, { name })]))).update(typedState);
  assert.equal(typedState.self.active?.maxHp, null, "missing target type cannot prove the typed HP adjustment");
  assert.equal(typedState.opponent.active?.maxHp, 100, "unknown type remains local to the affected recipient");
  const conflictingTypeIndex = buildCardDefinitionIndex([...typedDefinitions,
    { ...typedDefinitions.find((card) => card.name === "Sprout")!, sourceCardId: "sprout-other-type", types: ["Dragon"] }]);
  createReplayHpContext(Object.fromEntries([...conflictingTypeIndex.keys()].map((name) => [name, resolveCardDefinition(conflictingTypeIndex, { name })]))).update(typedState);
  assert.equal(typedState.self.active?.maxHp, null, "conflicting printing types cannot prove whether the typed HP bonus applies");
  assert.equal(typedState.opponent.active?.maxHp, 100, "a conflicting recipient type does not affect the other player");

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
  assert.ok(twins.frames[5].self.bench.every((card) => !card.instanceUncertain && card.physicalCardId), "an ambiguous Basic Energy attachment does not erase identified Pokemon tops");
  assert.ok(twins.frames[5].self.bench.every((card) => card.knownStackSize === undefined), "a multi-member attachment pool invalidates exact cached stack sizes");
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

  // Anonymized actual placement/attachment/evolution grammar; the altered
  // future consumers below are refusal-boundary inputs, not saved-game evidence.
  const irrelevantHistory = source([
    section("", [action("PlayerOne played Munkidori to the Active Spot."), action("PlayerOne played Torchic to the Bench.")]),
    section("PlayerOne", [action("PlayerOne ended their turn.")]), section("PlayerTwo", [action("PlayerTwo ended their turn.")]),
    section("PlayerOne", [action("PlayerOne played Torchic to the Bench."), action("PlayerOne attached Basic Darkness Energy to Torchic on the Bench.")]),
  ]);
  const historyIndependent = compileBattleReplay(irrelevantHistory);
  assert.equal(historyIndependent.events[5].unresolved, undefined, "unused current-turn history flags cannot distinguish otherwise identical outcomes");
  for (const future of ["PlayerOne evolved Torchic to Blaziken ex on the Bench.", "PlayerOne's Torchic used Fire Spin.", "PlayerOne's Torchic used its Ability: Seething Spirit.", "PlayerOne devolved PlayerOne's Torchic to Torchic."]) {
    const guarded = structuredClone(irrelevantHistory); guarded.sections![3].actions.push(action(future));
    const result = compileBattleReplay(guarded);
    assert.ok(result.events[5].unresolved?.length, "a current/future history consumer preserves the underlying age distinction");
  }
  const restrictiveItem = syntheticCardDefinition({ name: "Rare Candy", category: "Trainer", trainerType: "Item", hp: null, abilities: [],
    rules: ["Choose 1 of your Basic Pokémon in play. If you have a Stage 2 card in your hand that evolves from that Pokémon, put that card on the Basic Pokémon. (This counts as evolving that Pokémon.) You can’t use this card during your first turn or on a Basic Pokémon that was put into play this turn."] });
  const ambiguousTopInput = source([
    section("", [action("PlayerOne played Torchic to the Active Spot."), action("PlayerOne attached Basic Darkness Energy to Torchic in the Active Spot."),
      action("PlayerOne played Torchic to the Bench."), action("PlayerOne played Munkidori to the Bench.")]),
    section("PlayerOne", [action("PlayerOne retreated Torchic to the Bench.", ["PlayerOne's Munkidori is now in the Active Spot."]), action("PlayerOne ended their turn.")]),
    section("PlayerTwo", [action("PlayerTwo ended their turn.")]),
    section("PlayerOne", [action("PlayerOne played Rare Candy.", ["- PlayerOne evolved Torchic to Blaziken ex on the Bench."]), action("PlayerOne's Blaziken ex used its Ability: Seething Spirit.")]),
  ]);
  const ambiguousTopDefinitions = [restrictiveItem, syntheticCardDefinition({ name: "Torchic", abilities: [], attacks: [] }),
    syntheticCardDefinition({ name: "Blaziken ex", abilities: [{ name: "Seething Spirit", type: "Ability", text: "Once during your turn, you may attach a Basic Energy card from your discard pile to 1 of your Pokémon." }], attacks: [] })];
  const ambiguousTop = compileBattleReplay({ ...ambiguousTopInput, cardDefinitions: Object.fromEntries(ambiguousTopDefinitions.map((card) =>
    [card.name.toLowerCase(), resolveCardDefinition(buildCardDefinitionIndex(ambiguousTopDefinitions), { name: card.name })])) });
  assert.ok(ambiguousTop.events[7].unresolved?.length, "different carrier attachments remain unresolved");
  const newTop = ambiguousTop.frames[8].self.bench.find((card) => card.name === "Blaziken ex")!;
  assert.equal(newTop.physicalCardId, "action-7-physical-0", "the newly played evolution top has independent source provenance");
  assert.ok(newTop.instanceUncertain, "new top identity does not prove its old carrier or attachments");
  assert.deepEqual(newTop.observedEffects, ["Seething Spirit"], "later native evidence backfills only the independently identified new top");
  const oldTopReferences = ambiguousTop.frames[8].self.boardPools?.flatMap((pool) => pool.memberEvidence ?? []).filter((card) => card.name === "Torchic") ?? [];
  assert.deepEqual(oldTopReferences.map((card) => card.physicalCardId).sort(), ["action-0-physical-0", "action-2-physical-0"]);
  assert.equal(ambiguousTop.frames[8].self.bench.find((card) => card.name === "Torchic")?.physicalCardId, undefined, "the survivor cannot select either original identity");
  assert.ok(newTop.underlying.every((card) => card.physicalCardId !== newTop.physicalCardId && !card.observedEffects?.includes("Seething Spirit")), "new-top proof never leaks to its underlying namesake");
  const timingInput = { ...source([
    section("", [action("PlayerOne played Munkidori to the Active Spot."), action("PlayerOne played Dreepy to the Bench.")]),
    section("PlayerOne", [action("PlayerOne attached Basic Psychic Energy to Dreepy on the Bench."), action("PlayerOne ended their turn.")]),
    section("PlayerTwo", [action("PlayerTwo ended their turn.")]),
    section("PlayerOne", [action("PlayerOne played Rare Candy."), action("PlayerOne played Dreepy to the Bench."), action("PlayerOne evolved Dreepy to Drakloak on the Bench.")]),
  ]), cardDefinitions: { "rare candy": resolveCardDefinition(buildCardDefinitionIndex([restrictiveItem]), { name: "Rare Candy" }) } };
  const restrictedTiming = compileBattleReplay(timingInput);
  assert.deepEqual(restrictedTiming.diagnostics.unresolvedActions, [], "a separate can't-use sentence is a restriction, not a positive evolution timing exception");
  assert.deepEqual(restrictedTiming.frames.at(-1)?.self.bench.map((card) => ({ name: card.name, energy: card.energy })), [{ name: "Drakloak", energy: ["Psychic"] }, { name: "Dreepy", energy: [] }]);
  const positiveTimingRule = syntheticCardDefinition({ name: "Dreepy", rules: ["This Pokémon can evolve during the turn you played it."] });
  const permittedTiming = compileBattleReplay({ ...timingInput, cardDefinitions: { ...timingInput.cardDefinitions, dreepy: resolveCardDefinition(buildCardDefinitionIndex([positiveTimingRule]), { name: "Dreepy" }) } });
  assert.ok(permittedTiming.events.at(-1)?.unresolved?.length, "a positive exception preserves both possible evolution carriers instead of proving the older one by ordinary timing");

  const ordinaryAttacker = syntheticCardDefinition({ name: "Attacker", attacks: [{ name: "Pollen", damage: "10", cost: [], text: "During your opponent's next turn, they can't play any Item cards from their hand." }] });
  const ordinaryAttackInput = source([section("PlayerOne", [
    action("PlayerOne played Attacker to the Active Spot."), action("PlayerTwo played Twin to the Active Spot."),
    action("PlayerTwo attached Basic Grass Energy to Twin in the Active Spot."), action("PlayerTwo played Twin to the Bench."),
    action("PlayerOne's Attacker used Pollen on PlayerTwo's Twin for 10 damage."),
  ])]);
  const ordinaryAttackEvidence = resolveCardDefinition(buildCardDefinitionIndex([ordinaryAttacker]), { name: "Attacker" });
  const ordinaryContext = { attacker: ordinaryAttackEvidence, twin: resolveCardDefinition(buildCardDefinitionIndex([syntheticCardDefinition({ name: "Twin", abilities: [], attacks: [] })]), { name: "Twin" }) };
  const ordinaryAttack = compileBattleReplay({ ...ordinaryAttackInput, cardDefinitions: ordinaryContext });
  assert.deepEqual(ordinaryAttack.diagnostics.unresolvedActions, []);
  assert.equal(ordinaryAttack.frames[5].opponent.active?.damage, 10, "complete ordinary-attack rules identify the Active target despite a different same-name Bench copy");
  assert.equal(ordinaryAttack.frames[5].opponent.bench[0].damage, 0);
  for (const unsupportedAttack of [
    { ...ordinaryAttacker.attacks[0], text: "This attack does 10 damage to 1 of your opponent's Benched Pokémon." },
    { ...ordinaryAttacker.attacks[0], text: "Choose 1 of your opponent's Pokémon. This attack does 10 damage to it." },
    // Printed selectors include conditional and mid-sentence attack clauses.
    ...[
      "Discard 3 Energy from this Pokémon, and this attack does 280 damage to 1 of your opponent's Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
      "Shuffle all Energy attached to this Pokémon into your deck, and this attack does 220 damage to 1 of your opponent's Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
      "This attack does 60 damage to each of 2 of your opponent's Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
      "This attack does 50 damage to 2 of your opponent's Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
      "This attack does 30 damage to 3 of your opponent's Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
      "This attack does 10 damage for each Pokémon in your discard pile that has the United Wings attack to 1 of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
    ].map((text) => ({ ...ordinaryAttacker.attacks[0], text })),
  ]) {
    const candidates = buildCardDefinitionIndex([ordinaryAttacker, { ...ordinaryAttacker, sourceCardId: "other-attacker", attacks: [unsupportedAttack] }]);
    const uncertainAttack = compileBattleReplay({ ...ordinaryAttackInput, cardDefinitions: { ...ordinaryContext, attacker: resolveCardDefinition(candidates, { name: "Attacker" }) } });
    assert.deepEqual(uncertainAttack.diagnostics.unresolvedActions, [4], "every viable printing must establish the same ordinary Active-target contract");
    assert.equal(uncertainAttack.frames[5].opponent.active?.damage, 0);
    assert.equal(uncertainAttack.frames[5].opponent.bench[0].damage, 0);
  }
  for (const partialAttack of [
    { ...ordinaryAttacker.attacks[0], text: null },
    { ...ordinaryAttacker.attacks[0], damage: "10+" },
  ]) {
    const index = buildCardDefinitionIndex([ordinaryAttacker, { ...ordinaryAttacker, sourceCardId: "other-attacker", attacks: [partialAttack] }]);
    const recordedAttack = compileBattleReplay({ ...ordinaryAttackInput, cardDefinitions: { ...ordinaryContext, attacker: resolveCardDefinition(index, { name: "Attacker" }) } });
    assert.equal(recordedAttack.frames[5].opponent.active?.damage, 10, "the source damage receipt uses the default defending Active despite incomplete prose or a variable printed amount");
    assert.equal(recordedAttack.frames[5].opponent.bench[0].damage, 0, "the same-name Bench copy is not the default attack recipient");
  }
  const incompleteAttack = compileBattleReplay({ ...ordinaryAttackInput, cardDefinitions: { ...ordinaryContext, attacker: { ...ordinaryAttackEvidence, coverage: "incomplete" } } });
  assert.equal(incompleteAttack.frames[5].opponent.active?.damage, 10, "source target evidence does not certify missing catalogue coverage");
  assert.equal(incompleteAttack.frames[5].opponent.bench[0].damage, 0);
  assert.ok(incompleteAttack.cardResolutions);
  assert.equal(incompleteAttack.cardResolutions[incompleteAttack.frames[5].self.active!.definitionKey!].coverage, "incomplete");
  const secondaryAttack = { ...ordinaryAttacker, attacks: [{ ...ordinaryAttacker.attacks[0], text: "This attack also does 90 damage to 1 of your opponent's Benched Pokémon that has any damage counters on it. (Don't apply Weakness and Resistance for Benched Pokémon.)" }] };
  const secondaryDamage = compileBattleReplay({ ...ordinaryAttackInput, cardDefinitions: { ...ordinaryContext, attacker: resolveCardDefinition(buildCardDefinitionIndex([secondaryAttack]), { name: "Attacker" }) } });
  assert.equal(secondaryDamage.frames[5].opponent.active?.damage, 10, "a printed secondary Bench effect does not move the recorded primary damage away from the Active");
  assert.equal(secondaryDamage.frames[5].opponent.bench[0].damage, 0, "secondary damage needs its own recorded execution");

  // Exact public clauses used by the original corpus; this unit seam varies
  // only the recorded amount to ensure domain proof never recomputes damage.
  for (const text of [
    "You may search your deck for a card and put it into your hand. Then, shuffle your deck.",
    "During your next turn, this Pokémon can't attack.",
    "Attach up to 3 Basic {F} Energy cards from your discard pile to your Benched Pokémon in any way you like.",
    "During your next turn, this Pokémon can't use Pollen.",
    "Switch this Pokémon with 1 of your Benched Pokémon.",
  ]) {
    const definition = { ...ordinaryAttacker, attacks: [{ ...ordinaryAttacker.attacks[0], damage: "130", text }] };
    const evidence = resolveCardDefinition(buildCardDefinitionIndex([definition]), { name: "Attacker" });
    const modified = structuredClone(ordinaryAttackInput);
    modified.sections![0].actions[4].title = "PlayerOne's Attacker used Pollen on PlayerTwo's Twin for 160 damage.";
    const result = compileBattleReplay({ ...modified, cardDefinitions: { ...ordinaryContext, attacker: evidence } });
    assert.equal(result.frames[5].opponent.active?.damage, 160);
    assert.equal(result.frames[5].opponent.bench[0].damage, 0);
    assert.deepEqual(result.diagnostics.unresolvedActions, []);
  }
  const persistentGrant = syntheticCardDefinition({ name: "Granting Item", category: "Trainer", trainerType: "Item", abilities: [], attacks: [],
    rules: ["During this turn, your Pokémon have the following attack."] });
  const grantedInput = structuredClone(ordinaryAttackInput);
  grantedInput.sections![0].actions.splice(4, 0, action("PlayerOne played Granting Item."));
  const grantedAttack = compileBattleReplay({ ...grantedInput, cardDefinitions: { ...ordinaryContext,
    "granting item": resolveCardDefinition(buildCardDefinitionIndex([persistentGrant]), { name: "Granting Item" }) } });
  assert.ok(grantedAttack.events[5].unresolved?.length, "a recorded prior Trainer grant cannot disappear when playedCard is cleared for the next action");
  assert.equal(grantedAttack.frames[6].opponent.active?.damage, 10, "unknown native or granted provenance does not erase the source damage receipt's default Active target");
  assert.equal(grantedAttack.frames[6].opponent.bench[0].damage, 0);
  const refusedAttackInput = structuredClone(ordinaryAttackInput);
  refusedAttackInput.sections![0].actions.splice(4, 0, action("PlayerOne's Attacker used Unmodelled on PlayerTwo's Twin for 10 damage."));
  const refusedAttackDefinition = { ...ordinaryAttacker, attacks: [...ordinaryAttacker.attacks, { ...ordinaryAttacker.attacks[0], name: "Unmodelled", text: null }] };
  const refusedAttack = compileBattleReplay({ ...refusedAttackInput, cardDefinitions: { ...ordinaryContext,
    attacker: resolveCardDefinition(buildCardDefinitionIndex([refusedAttackDefinition]), { name: "Attacker" }) } });
  assert.ok(refusedAttack.events[4].transaction?.stages.some((entry) => entry.kind === "attack"), "the literal attack receipt remains visible despite missing card prose");
  assert.ok(refusedAttack.events[5].unresolved?.length, "the earlier missing-text attack still preserves granted-route uncertainty");
  assert.equal(refusedAttack.frames[6].opponent.active?.damage, 20, "both literal damage receipts reach the defending Active");
  assert.equal(refusedAttack.frames[6].opponent.bench[0].damage, 0);
  const resistedInput = structuredClone(ordinaryAttackInput);
  resistedInput.sections![0].actions[4].title = "PlayerOne's Attacker used Pollen on PlayerTwo's Twin for 0 damage. Twin took 10 less damage because of Grass Resistance.";
  assert.deepEqual(compileBattleReplay({ ...resistedInput, cardDefinitions: ordinaryContext }).diagnostics.unresolvedActions, []);
  resistedInput.sections![0].actions[4].title = "PlayerOne's Attacker used Pollen on PlayerTwo's Twin for 0 damage. Twin took -10 less damage because of Grass Resistance.";
  const signedResistance = compileBattleReplay({ ...resistedInput, cardDefinitions: ordinaryContext });
  assert.deepEqual(signedResistance.diagnostics.unresolvedActions, [], "a signed recorded Resistance explanation remains an annotation of the literal attack total");
  assert.equal(signedResistance.frames[5].opponent.active?.damage, 0, "Resistance is not subtracted a second time");
  assert.ok(signedResistance.events[4].transaction?.stages.some((stage) => stage.kind === "attack"), "the zero-damage attack is still an attack action");

  const powerfulText = "Place 2 damage counters on your opponent's Active Pokémon for each card in your hand.";
  const powerfulCard = syntheticCardDefinition({ name: "Alakazam", attacks: [{ name: "Powerful Hand", damage: null, cost: null, text: powerfulText }] });
  const powerfulEvidence = resolveCardDefinition(buildCardDefinitionIndex([powerfulCard]), { name: "Alakazam" });
  const powerful = compileBattleReplay({ ...source([section("PlayerOne", [
    action("PlayerOne played Alakazam to the Active Spot."), action("PlayerTwo played Twin to the Active Spot."), action("PlayerTwo played Twin to the Bench."),
    action("PlayerOne's Alakazam used Powerful Hand.", ["- PlayerOne put 20 damage counters on PlayerOne's Twin."]),
  ])]), effectTags: { "PlayerOne's Alakazam used Powerful Hand.": "attack" }, cardDefinitions: { alakazam: powerfulEvidence } });
  assert.equal(powerful.frames[4].opponent.active?.damage, 200, "the printed target domain overrides the effect-actor possessive without calculating its multiplier");
  assert.equal(powerful.frames[4].opponent.bench[0].damage, 0);
  for (const text of [powerfulText + " Otherwise, put 2 damage counters on your Pokémon.",
    powerfulText.replace("card in your hand", "heads"), powerfulText.replace("Place", "If you have a card in hand, place"),
    powerfulText.replace("Active Pokémon", "Pokémon of your choice")]) {
    const evidence = resolveCardDefinition(buildCardDefinitionIndex([{ ...powerfulCard, attacks: [{ ...powerfulCard.attacks[0], text }] }]), { name: "Alakazam" });
    assert.notEqual(resolveReplayEffectConstraint(evidence, "Powerful Hand", "attack", "put_counters").status, "known");
  }
  for (const details of [["- PlayerOne flipped 2 coins, and 1 landed on heads."], ["- PlayerOne flipped 2 coins, and 3 landed on heads."]]) {
    const coin = compileBattleReplay(source([section("PlayerOne", [action("PlayerOne played Seedling to the Active Spot.", details)])]));
    assert.equal(Boolean(coin.events[0].unresolved?.length), details[0].includes("3 landed"));
  }
  const tera = compileBattleReplay(source([section("PlayerOne", [action("PlayerOne played Seedling to the Active Spot."),
    action("PlayerOne's Seedling's Tera effect was used.", ["- Damage to Seedling was prevented."]),
  ])]));
  assert.deepEqual(tera.diagnostics.unresolvedActions, []);
  const unsupportedTera = compileBattleReplay(source([section("PlayerOne", [action("PlayerOne played Seedling to the Active Spot."),
    action("PlayerOne's Seedling's Tera effect was used.", ["- PlayerOne changed an unrecorded card."]),
  ])]));
  assert.ok(unsupportedTera.events[1].unresolved?.length, "a passive title cannot authorize unrelated mutation details");

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
  const threeCopyReconInput: ReplayLogSource = { ...source([
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
  ]), effectTags: { [reconTitle]: "ability" }, cardDefinitions: { drakloak: reconEvidence,
    dreepy: resolveCardDefinition(buildCardDefinitionIndex([syntheticCardDefinition({ name: "Dreepy", abilities: [], attacks: [] })]), { name: "Dreepy" }) } };
  const threeCopyRecon = compileBattleReplay(threeCopyReconInput);
  // Direct completeness boundaries use the already compiled source fixture;
  // they do not invent a positive game with an omitted passive source.
  const reconInventory = threeCopyRecon.frames[13];
  assert.equal(replayPassiveInventoriesComplete(reconInventory), true);
  const missingOpponentPassive = structuredClone(reconInventory);
  missingOpponentPassive.opponent.inPlayCount!++;
  assert.equal(replayPassiveInventoriesComplete(missingOpponentPassive), false, "a complete acting cohort cannot prove absence of an unrepresented opponent passive");
  for (const owner of ["self", "opponent"] as const) {
    const pooled = structuredClone(reconInventory);
    pooled[owner].inPlayCount!++;
    pooled[owner].boardPools = [{ id: "guaranteed-inventory", memberIds: [pooled[owner].active!.id],
      cards: [{ id: "pooled-energy", name: "Basic Psychic Energy", boardRole: "energy", imageUrl: "" }] }];
    assert.equal(replayPassiveInventoriesComplete(pooled), true, "guaranteed pooled inventory with a live holder is represented");
    pooled[owner].boardPools[0].memberIds = [];
    assert.equal(replayPassiveInventoriesComplete(pooled), false, "balanced arithmetic cannot make an orphan pool a complete passive inventory");
    const unknownCount = structuredClone(reconInventory); unknownCount[owner].inPlayCount = null;
    assert.equal(replayPassiveInventoriesComplete(unknownCount), false);
    const unknownActive = structuredClone(reconInventory); unknownActive[owner].activeUncertain = true;
    assert.equal(replayPassiveInventoriesComplete(unknownActive), false);
    const unplacedTop = structuredClone(reconInventory); unplacedTop[owner].unplaced = [unplacedTop[owner].active!]; unplacedTop[owner].active = null;
    assert.equal(replayPassiveInventoriesComplete(unplacedTop), false);
    const conditional = structuredClone(reconInventory);
    conditional[owner].boardPools = [{ id: "conditional-inventory", memberIds: [conditional[owner].active!.id], cards: [],
      possiblyReturnedCards: [{ id: "possible-passive", name: "Permission Tool", imageUrl: "" }] }];
    assert.equal(replayPassiveInventoriesComplete(conditional), false);
    const uncertain = structuredClone(reconInventory);
    uncertain[owner].boardPools = [{ id: "uncertain-inventory", memberIds: [uncertain[owner].active!.id], cards: [],
      uncertainCards: [{ cards: [{ id: "possible-passive", name: "Permission Tool", imageUrl: "" }], destinations: ["discard"] }] }];
    assert.equal(replayPassiveInventoriesComplete(uncertain), false);
  }
  const reconCopies = (index: number) => [threeCopyRecon.frames[index].self.active, ...threeCopyRecon.frames[index].self.bench].filter((card): card is ReplayCard => Boolean(card));
  assert.equal(reconCopies(15).filter((card) => card.abilityUsed).length < 3, true, "two uses cannot prove three per-copy markers");
  assert.deepEqual(reconCopies(16).map((card) => card.abilityUsed), [true, true, true], "three once-per-copy uses prove all three despite different attachment state and unknown order");
  assert.deepEqual(threeCopyRecon.frames[16].self.active?.energy, ["Psychic"], "Ability copy ambiguity cannot relocate an independently recorded attachment");
  for (const [frame, uses] of [[14, 1], [15, 2], [16, 3]] as const) {
    const factual = threeCopyRecon.frames[frame];
    const beforeDisplay = JSON.stringify(factual);
    const display = resolveReplayBoardDisplay(factual, threeCopyRecon.cardResolutions);
    const shown = [display.self.active, ...display.self.bench].filter((card): card is ReplayCard => Boolean(card));
    assert.equal(shown.filter((card) => card.abilityUsed).length, uses, "one supported whole witness preserves intermediate activation cardinality");
    if (uses < 3) assert.ok(reconCopies(frame).every((card) => card.abilityUsed !== false), "an unidentified used copy cannot leave every possible member factually unused");
    if (uses < 3) assert.ok(shown.filter((card) => card.abilityUsed && ![factual.self.active, ...factual.self.bench].find((original) => original?.id === card.id)?.abilityUsed).every((card) => card.plausibleFields?.includes("abilityUsed")));
    assert.equal(JSON.stringify(factual), beforeDisplay);
    assert.equal(display.self.active?.hpBasis, factual.self.active?.hpBasis, "a guessed Ability marker does not downgrade independent HP evidence");
    for (const card of shown.filter((card) => card.plausibleFields?.join() === "abilityUsed")) {
      const original = [factual.self.active, ...factual.self.bench].find((entry) => entry?.id === card.id)!;
      assert.equal(card.damageKnown, original.damageKnown, "an Ability-only marker preserves the original damage knowledge metadata");
    }
  }
  assert.equal(threeCopyRecon.events[15].unresolved, undefined, "the completed cohort entails its recorded activation without selecting its physical order");
  assert.equal(threeCopyRecon.events[15].transaction?.stages.find((entry) => entry.kind === "ability")?.collective, true);
  assert.equal(threeCopyRecon.events[15].transaction?.stages.find((entry) => entry.kind === "ability")?.label, "Recon Directive");
  assert.deepEqual(threeCopyRecon.events.slice(13, 16).map((event) => event.unresolved), [undefined, undefined, undefined], "order-only ambiguity does not turn the recorded individual uses into errors");
  assert.ok(threeCopyRecon.events.slice(13, 16).every((event) => event.label === "Ability" && event.transaction?.stages.filter((entry) => entry.kind === "ability").every((entry) => !entry.detail && !entry.cards.length)), "recorded activations keep the literal effect and no invented cohort narration or simultaneous activation");
  const evolutionAfterUses = structuredClone(threeCopyReconInput);
  evolutionAfterUses.sections![3].actions.push(action("PlayerOne evolved Drakloak to Dragapult ex on the Bench."));
  const evolvedUsedCopies = compileBattleReplay(evolutionAfterUses).frames.at(-1)!.self;
  const remainingUsedCopies = [evolvedUsedCopies.active, ...evolvedUsedCopies.bench, ...(evolvedUsedCopies.unplaced ?? [])].filter((card): card is ReplayCard => Boolean(card));
  assert.ok(remainingUsedCopies.filter((card) => card.name === "Drakloak").every((card) => card.abilityUsed === true), "an ambiguous evolution cannot erase the unchanged copies' shared known Ability use");
  assert.equal(remainingUsedCopies.find((card) => card.name === "Dragapult ex")?.abilityUsed, false, "the newly evolved top resets its own Ability marker");
  for (const text of ["Your Pokémon can use the Abilities of your Benched Pokémon.", "This Pokémon gains the following Ability.",
    "This Pokémon may use another Pokémon's Ability as its own.", "Your Pokémon may use their Abilities again.", "Remove all Ability-used markers from your Pokémon.",
    "Your Pokémon have no Abilities."]) assert.equal(isReplayAbilityLimitContextNeutral(text, false, "Recon Directive"), false);
  // Literal published Boom Boom Groove clause; these are direct predicate
  // states, not fabricated positive Battle Log fidelity examples.
  const boomText = "Once during your turn, if your Active Pokémon has the Festival Lead Ability, you may search your deck for a card and put it into your hand. Then, shuffle your deck.";
  assert.deepEqual(resolveReplayAbilityActivation([boomText]), { kind: "active_has_ability", once: true, ability: "Festival Lead" });
  assert.equal(resolveReplayAbilityActivation(["Once during your turn, if you have a Pokémon in play, you may draw a card."]).kind, "unmodelled");
  assert.equal(resolveReplayAbilityActivation([boomText.replace("your Active Pokémon", "this Pokémon")]).kind, "unmodelled");
  assert.equal(resolveReplayAbilityActivation([boomText, boomText.replace("Festival Lead", "Other")]).kind, "unmodelled");
  const predicateActive = { ...structuredClone(threeCopyRecon.frames[16].self.active!), name: "Dipplin", observedEffects: [] };
  const predicateDefinitions = [syntheticCardDefinition({ name: "Dipplin", abilities: [{ type: "Ability", name: "Festival Lead", text: "If Festival Grounds is in play, this Pokémon can use the attacks it has twice." }] }),
    syntheticCardDefinition({ name: "Thwackey", abilities: [{ type: "Ability", name: "Boom Boom Groove", text: boomText }] })];
  const predicateIndex = buildCardDefinitionIndex(predicateDefinitions);
  const predicateInput = { active: predicateActive, activeUncertain: false, sourceName: "Thwackey", ability: "Festival Lead",
    activeEvidence: resolveCardDefinition(predicateIndex, { name: "Dipplin" }), sourceEvidence: resolveCardDefinition(predicateIndex, { name: "Thwackey" }) };
  const unchangedPredicate = JSON.stringify(predicateInput);
  assert.equal(supportsReplayActiveAbilityPredicate(predicateInput), true);
  assert.equal(JSON.stringify(predicateInput), unchangedPredicate, "the recorded predicate does not seed native Active effects or identify a source copy");
  assert.equal(supportsReplayActiveAbilityPredicate({ ...predicateInput, active: { ...predicateActive, physicalCardId: undefined } }), true, "the known Active slot's operational predicate does not depend on its physical-copy identity");
  assert.equal(supportsReplayActiveAbilityPredicate({ ...predicateInput, activeUncertain: true }), false);
  assert.equal(supportsReplayActiveAbilityPredicate({ ...predicateInput, active: { ...predicateActive, instanceUncertain: true } }), true, "copy ambiguity does not erase a recorded operational predicate for the known Active");
  const pooledPredicate = { ...predicateInput, active: { ...predicateActive, physicalCardId: undefined, instanceUncertain: true },
    activeEvidence: resolveCardDefinition(buildCardDefinitionIndex([predicateDefinitions[0], { ...predicateDefinitions[0], sourceCardId: "other-dipplin", abilities: [] }]), { name: "Dipplin" }) };
  const beforePooledPredicate = JSON.stringify(pooledPredicate);
  assert.equal(supportsReplayActiveAbilityPredicate(pooledPredicate), true);
  assert.equal(JSON.stringify(pooledPredicate), beforePooledPredicate, "execution proves the predicate without choosing a printing or changing its HP evidence");
  assert.equal(supportsReplayActiveAbilityPredicate({ ...predicateInput, sourceName: "Dipplin" }), false);
  assert.equal(supportsReplayActiveAbilityPredicate({ ...predicateInput, activeEvidence: { ...predicateInput.activeEvidence, coverage: "incomplete" } }), false);
  const noPredicate = resolveCardDefinition(buildCardDefinitionIndex([syntheticCardDefinition({ name: "Dipplin", abilities: [] })]), { name: "Dipplin" });
  assert.equal(supportsReplayActiveAbilityPredicate({ ...predicateInput, activeEvidence: noPredicate }), false);
  const missingPredicate = resolveCardDefinition(buildCardDefinitionIndex([{ ...predicateDefinitions[0], abilities: [{ ...predicateDefinitions[0].abilities[0], text: null }] }]), { name: "Dipplin" });
  assert.equal(supportsReplayActiveAbilityPredicate({ ...predicateInput, activeEvidence: missingPredicate }), false);
  assert.equal(isReplayAbilityLimitContextNeutral("Your Pokémon have no Abilities.", false, "Boom Boom Groove"), false);
  assert.equal(isReplayAbilityLimitContextNeutral("Your Pokémon can use the Abilities of your Benched Pokémon.", false, "Boom Boom Groove"), false);
  assert.equal(stripReplayNamedAbilityLimits("You can't use more than 1 Flip the Script Ability each turn."), "");
  assert.equal(stripReplayNamedAbilityLimits("You can't use more than 1 Fan Call Ability during your turn."), "");
  assert.equal(stripReplayNamedAbilityLimits("You can't use more than 1 Ability that has \"Last-Ditch\" in its name each turn."), "", "a complete quoted-family once-limit is not suppression");
  const quotedConditional = "You can't use more than 1 Ability that has \"Ditch or Catch\" in its name each turn.";
  assert.equal(stripReplayNamedAbilityLimits(quotedConditional), quotedConditional);
  const quotedSuppression = "Pokémon in play have no Abilities. You can't use more than 1 Ability that has \"Last-Ditch\" in its name each turn.";
  assert.equal(stripReplayNamedAbilityLimits(quotedSuppression), "Pokémon in play have no Abilities.");
  // Stripping the quoted family limit for passive HP/suppression scans must not relax the separate cohort limit guard.
  const lastDitch = "Once during your turn, when you play this Pokémon from your hand onto your Bench, you may use this Ability. Search your deck for a Supporter card, reveal it, and put it into your hand. Then, shuffle your deck. You can't use more than 1 Ability that has \"Last-Ditch\" in its name each turn.";
  assert.equal(isReplayAbilityLimitContextNeutral(lastDitch, true, "Last-Ditch Catch"), false, "the matching family's own once-per-turn limit still refuses repeat/cohort certification");
  // A stage-less Stadium activation is skippable only for pure passive prevention text.
  const battleCage = "Prevent all damage counters from being placed on Benched Pokémon (both yours and your opponent's) by effects of attacks and Abilities from the opponent's Pokémon. (Damage from attacks is still taken.)";
  assert.equal(isReplayPurePreventionStadiumRules([battleCage]), true);
  assert.equal(isReplayPurePreventionStadiumRules(["Prevent all damage done to Benched Pokémon by attacks (both yours and your opponent's)."]), true);
  for (const rules of [[battleCage + " Once during each player's turn, that player may heal 30 damage from their Active Pokémon."],
    [battleCage + " Then, move an Energy from 1 of your Pokémon to another of your Pokémon."], [battleCage + " Each player draws a card at the end of their turn."],
    ["Prevent all damage done to Benched Pokémon by attacks from your opponent's Pokémon, and place 1 damage counter on each Active Pokémon."],
    ["Prevent all damage done to Benched Pokémon, and each player's Active Pokémon can't retreat."],
    ["Prevent all damage done to Benched Pokémon by attacks if that player has no cards in hand."], [battleCage, ""], ["(Damage from attacks is still taken.)"], ["   "], []]) {
    assert.equal(isReplayPurePreventionStadiumRules(rules), false, "prevention plus any mutation, condition or blank rules is not a mutation-free activation");
  }
  assert.equal(isReplayPurePreventionStadiumRules(null), false);
  const conditionalLimit = "If a Stadium is in play, you can't use more than 1 Flip the Script Ability each turn.";
  assert.equal(stripReplayNamedAbilityLimits(conditionalLimit), conditionalLimit);
  const complexLimit = "You can't use more than 1 Fan Call if your Active has no other Ability each turn.";
  assert.equal(stripReplayNamedAbilityLimits(complexLimit), complexLimit);
  assert.equal(stripReplayNamedAbilityLimits("Your Pokémon have no Abilities."), "Your Pokémon have no Abilities.");
  assert.equal(isReplaySelfAttackPermission("This Pokémon can use the attacks of all Pokémon in play as its own. (You still need the necessary Energy to use each attack.)", "Mew ex"), true);
  assert.equal(isReplaySelfAttackPermission("This Pokémon can use the attacks of any of your Benched Pokémon.", "Mew ex"), true);
  assert.equal(isReplaySelfAttackPermission("Your Pokémon can use the attacks of all Pokémon in play as their own.", "Mew ex"), false);
  assert.equal(isReplaySelfAttackPermission("This Pokémon can use the attacks of any of your Benched Pokémon. Your Pokémon have no Abilities.", "Mew ex"), false);
  assert.equal(isReplayAbilityLimitContextNeutral("You can't use more than 1 Flip the Script Ability each turn.", false, "Recon Directive"), true);
  assert.equal(isReplayAbilityLimitContextNeutral("You can't use more than 1 Fan Call Ability during your turn.", false, "Recon Directive"), true);
  assert.equal(isReplayAbilityLimitContextNeutral("You can't use more than 1 Fan Call Ability during your turn.", true, "Fan Call"), false);
  assert.equal(isReplayAbilityLimitContextNeutral("You can't use more than 1 Ability that has \"Last-Ditch\" in its name each turn.", false, "Recon Directive"), true);
  const typedSuppression = "{C} Pokémon in play (both yours and your opponent's) have no Abilities.";
  const dragonTarget = syntheticCardDefinition({ name: "Drakloak", types: ["Dragon"], stage: "Stage1" });
  const dragonEvidence = resolveCardDefinition(buildCardDefinitionIndex([dragonTarget]), { name: "Drakloak" });
  assert.equal(isReplayAbilityLimitContextNeutral(typedSuppression, false, "Recon Directive", dragonEvidence), true, "the exact Colorless suppression clause cannot affect a proven Dragon cohort");
  assert.equal(isReplayAbilityLimitContextNeutral(typedSuppression, false, "Recon Directive"), false, "typed suppression cannot be ignored without the target domain");
  assert.equal(isReplayAbilityLimitContextNeutral(typedSuppression, false, "Recon Directive", { ...dragonEvidence, coverage: "incomplete" }), false);
  assert.equal(isReplayAbilityLimitContextNeutral(typedSuppression, false, "Recon Directive", resolveCardDefinition(buildCardDefinitionIndex([{ ...dragonTarget, types: null }]), { name: "Drakloak" })), false);
  assert.equal(isReplayAbilityLimitContextNeutral(typedSuppression, false, "Recon Directive", resolveCardDefinition(buildCardDefinitionIndex([dragonTarget, { ...dragonTarget, sourceCardId: "other-target", types: ["Colorless"] }]), { name: "Drakloak" })), false, "one affected candidate prevents cohort neutrality");
  assert.equal(isReplayAbilityLimitContextNeutral(`${typedSuppression} Your Pokémon may use their Abilities again.`, false, "Recon Directive", dragonEvidence), false, "a recognized clause cannot hide an additional limit-changing sentence");
  const typeChanges = [
    "As long as this Pokémon is your Active Pokémon, this Pokémon is the same type as your opponent’s Active Pokémon.",
    "This Pokémon is the same type as any basic Energy attached to it. (If it has 2 or more different types of basic Energy attached, this Pokémon is each of those types.)",
  ];
  for (const text of typeChanges) {
    assert.equal(isReplayAbilityLimitContextNeutral(text, true, "Recon Directive", dragonEvidence), false, "a target's printed type cannot certify immunity after its own type-changing effect");
    assert.equal(isReplayAbilityLimitContextNeutral(text, false, "Recon Directive", dragonEvidence), true, "a self-only type change on another Pokémon does not change this cohort's type");
  }
  for (const rules of [["Your Pokémon may use their Abilities again."], ["Your Pokémon can use the Abilities of your Benched Pokémon."], null]) {
    const permission = syntheticCardDefinition({ name: "Permission Stadium", category: "Trainer", trainerType: "Stadium", hp: null, rules, abilities: [], attacks: [] });
    const permissionInput = structuredClone(threeCopyReconInput);
    permissionInput.sections![3].actions.splice(4, 0, action("PlayerOne played Permission Stadium."));
    const uncertainLimit = compileBattleReplay({ ...permissionInput,
      cardDefinitions: { ...permissionInput.cardDefinitions, "permission stadium": resolveCardDefinition(buildCardDefinitionIndex([permission]), { name: permission.name }) } });
    const finalCopies = [uncertainLimit.frames.at(-1)!.self.active, ...uncertainLimit.frames.at(-1)!.self.bench].filter((card): card is ReplayCard => Boolean(card));
    assert.ok(finalCopies.some((card) => !card.abilityUsed), "a repeat/grant/unverified passive context cannot certify N=N markers");
    assert.ok(uncertainLimit.events.at(-1)?.unresolved?.length, "an unsafe once-limit context cannot clear the terminal copy warning");
  }
  // Actual evolve-from-Hand activation wording: a fresh top is eligible,
  // while an older same-name top keeps its existing printing but cannot use
  // that trigger merely because its underlying stack is easier to identify.
  const psychicText = "Once during your turn, when you play this Pokémon from your hand to evolve 1 of your Pokémon, you may use this Ability. Draw 3 cards.";
  const psychicCard = syntheticCardDefinition({ name: "Alakazam", hp: 310, abilities: [{ name: "Psychic Draw", type: "Ability", text: psychicText }] });
  const psychicTitle = "PlayerOne's Alakazam used Psychic Draw.";
  const triggerInput = { ...source([
    section("", [action("PlayerOne played Seedling to the Active Spot."), action("PlayerOne played Alakazam to the Bench."), action("PlayerOne played Kadabra to the Bench.")]),
    section("PlayerOne", [action("PlayerOne evolved Kadabra to Alakazam on the Bench."), action(psychicTitle, ["- PlayerOne drew 3 cards."])]),
  ]), effectTags: { [psychicTitle]: "ability" as const }, cardDefinitions: { alakazam: resolveCardDefinition(buildCardDefinitionIndex([psychicCard]), { name: "Alakazam" }) } };
  const triggered = compileBattleReplay(triggerInput);
  const freshTop = triggered.frames[4].self.bench.find((card) => card.physicalCardId === "action-3-physical-0")!;
  assert.ok(freshTop);
  assert.equal(triggered.frames[5].self.bench.find((card) => card.physicalCardId === freshTop.physicalCardId)?.abilityUsed, true);
  assert.equal(triggered.frames[5].self.bench.find((card) => card.id !== freshTop.id)?.abilityUsed, false, "the old top cannot borrow a fresh evolution token");
  assert.deepEqual(triggered.frames[5].self.bench.find((card) => card.id === freshTop.id)?.underlying.map((card) => card.name), ["Kadabra"]);
  const handEvolutionRule = "Choose 1 of your Basic Pokémon in play. If you have a Stage 2 card in your hand that evolves from that Pokémon, put that card on the Basic Pokémon. (This counts as evolving that Pokémon.) You can’t use this card during your first turn or on a Basic Pokémon that was put into play this turn.";
  const handItem = syntheticCardDefinition({ name: "Rare Candy", category: "Trainer", trainerType: "Item", hp: null, abilities: [], rules: [handEvolutionRule] });
  const retainedHandItem = selectRetainedCardDefinitions([handItem], { savedFormats: ["TEF-30C"], retainedOn: "2026-10-04" });
  const itemEvolution = { ...triggerInput, sections: [section("", [action("PlayerOne played Seedling to the Active Spot."), action("PlayerOne played Alakazam to the Bench."), action("PlayerOne played Abra to the Bench.")]),
    section("PlayerOne", [action("PlayerOne played Rare Candy.", ["- PlayerOne evolved Abra to Alakazam on the Bench."]), action(psychicTitle, ["- PlayerOne drew 3 cards."])])],
    date: "2026-10-06", format: "TEF-30C",
    cardDefinitions: { ...triggerInput.cardDefinitions, "rare candy": { ...resolveCardDefinition(buildCardDefinitionIndex(retainedHandItem.definitions), { name: "Rare Candy" }), sourceCoverage: retainedHandItem.sourceCoverage } } };
  const itemTriggered = compileBattleReplay(itemEvolution);
  assert.equal(itemTriggered.frames[5].self.bench.find((card) => card.physicalCardId === "action-3-physical-0")?.abilityUsed, true, "verified Hand origin plus counts-as-evolving permits the same native trigger");
  const unsupportedItem = compileBattleReplay({ ...itemEvolution, cardDefinitions: { ...itemEvolution.cardDefinitions, "rare candy": resolveCardDefinition(buildCardDefinitionIndex([{ ...handItem, rules: null }]), { name: "Rare Candy" }) } });
  assert.ok(unsupportedItem.events[4].unresolved?.length, "an arbitrary Item evolution cannot imply Hand origin");
  for (const negative of [
    { ...triggerInput, effectOrigins: { "PlayerOne evolved Kadabra to Alakazam on the Bench.": "deck" as const } },
    { ...triggerInput, sections: [triggerInput.sections[0], section("PlayerOne", [triggerInput.sections[1].actions[0]]), section("PlayerTwo", [action("PlayerTwo drew a card.")]), section("PlayerOne", [triggerInput.sections[1].actions[1]])] },
  ]) {
    const refused = compileBattleReplay(negative);
    assert.ok(refused.events.at(-1)?.unresolved?.length);
    assert.ok(refused.frames.at(-1)?.self.bench.every((card) => !card.abilityUsed), "non-Hand and older-turn evolution cannot establish current trigger eligibility");
  }
  // Direct solver boundaries: these are allocation-module guards, not an
  // invented recorded game or an expected board reconstructed from its output.
  const allocationCard = (id: string, damage = 0): CopyFact => ({ position: "bench", card: { id, name: "Copy", damage, damageKnown: true, imageUrl: "", hp: 100, energy: [], underlying: [] } });
  const allocationStep = (event: number, kind: CopyStep["kind"], values: Partial<CopyStep> = {}): CopyStep => ({ key: String(event), event, section: 1, actor: "self", name: "Copy", kind, ...values });
  const uncertainCompetitor = allocationCard("erased"); uncertainCompetitor.card.instanceUncertain = true;
  const unknownCompetition = solveReplayCopyConstraints([
    allocationStep(0, "create", { cards: [allocationCard("known"), uncertainCompetitor] }),
    allocationStep(1, "attach", { energy: "Psychic", cards: [allocationCard("known"), uncertainCompetitor] }),
  ], "facts");
  assert.equal(unknownCompetition.bindings.has("1"), false, "an erased eligible namesake cannot be omitted to manufacture a unique attachment binding");
  assert.ok(unknownCompetition.barriers.some((barrier) => barrier.cardId === "known"));
  const excludedCompetitor = solveReplayCopyConstraints([
    allocationStep(0, "create", { cards: [allocationCard("known"), { ...uncertainCompetitor, position: "active" }] }),
    allocationStep(1, "attach", { energy: "Psychic", position: "bench", cards: [allocationCard("known"), { ...uncertainCompetitor, position: "active" }] }),
  ], "facts");
  assert.equal(excludedCompetitor.bindings.get("1"), "known", "a conclusively out-of-zone uncertain copy does not block a recorded Bench target");
  const openCompetitor = { ...allocationCard("open"), componentsOpen: true };
  const suppliedCompetitor = allocationCard("supplied"); suppliedCompetitor.card.energy = ["Psychic", "Grass"];
  for (const values of [{ kind: "ability" as const, requiredEnergy: "Psychic", once: true },
    { kind: "witness" as const, cost: ["Psychic"] }, { kind: "remove_energy" as const, energy: "Psychic" }]) {
    const openEligibility = solveReplayCopyConstraints([
      allocationStep(0, "create", { cards: [openCompetitor, suppliedCompetitor] }),
      allocationStep(1, values.kind, values),
    ], "facts");
    assert.equal(openEligibility.bindings.has("1"), false, "an open attachment domain cannot be excluded to manufacture a unique Energy-dependent physical copy");
  }
  const openKnownEnergy = { ...allocationCard("only"), componentsOpen: true }; openKnownEnergy.card.energy = ["Grass"];
  const openRemoval = solveReplayCopyConstraints([
    allocationStep(0, "create", { cards: [openKnownEnergy] }), allocationStep(1, "remove_energy", { energy: "Psychic" }),
    allocationStep(2, "witness", { cost: ["Grass"] }),
  ], "facts");
  assert.equal(openRemoval.bindings.get("2"), "only", "removing an unidentified pooled Energy cannot splice away another confirmed local Energy");
  const openKo = solveReplayCopyConstraints([
    allocationStep(0, "create", { cards: [openCompetitor, suppliedCompetitor] }),
    allocationStep(1, "ko", { belowTop: ["Basic Psychic Energy"], belowTopCount: 1 }),
  ], "facts");
  assert.equal(openKo.bindings.get("1"), "open", "known local components still rule out a recorded bundle too small to contain them");
  const replacedTop = { ...allocationCard("one"), card: { ...allocationCard("one").card, name: "Evolution" } };
  const closedNames = solveReplayCopyConstraints([
    allocationStep(0, "create", { cards: [allocationCard("one"), allocationCard("two"), { ...allocationCard("other"), card: { ...allocationCard("other").card, name: "Other" } }] }),
    allocationStep(1, "barrier", { name: "Evolution", cards: [replacedTop, { ...allocationCard("other"), card: { ...allocationCard("other").card, name: "Other" } }] }),
    allocationStep(2, "attach", { energy: "Grass", cards: [replacedTop] }),
  ], "facts");
  assert.equal(closedNames.bindings.has("2"), false, "a new-name barrier must close old-name worlds sharing its original IDs, not leave a falsely unique stale top");
  const knownCounterOrigin = solveReplayCopyConstraints([
    allocationStep(0, "create", { cards: [allocationCard("low", 10), allocationCard("enough", 30)] }),
    allocationStep(1, "counters", { amount: 30 }),
  ], "facts");
  assert.equal(knownCounterOrigin.bindings.get("1"), "enough");
  const unknownCounterOrigin = solveReplayCopyConstraints([
    allocationStep(0, "create", { cards: [allocationCard("enough", 30), { ...allocationCard("unknown"), card: { ...allocationCard("unknown").card, damageKnown: false } }] }),
    allocationStep(1, "counters", { amount: 30 }),
  ], "facts");
  assert.equal(unknownCounterOrigin.bindings.has("1"), false, "unknown origin damage is potentially eligible rather than evidence excluding that namesake");
  const cohortCards = [allocationCard("one"), allocationCard("two"), allocationCard("three")];
  const cohortSteps: CopyStep[] = [allocationStep(0, "create", { cards: cohortCards }),
    ...[1, 2, 3].map((event) => allocationStep(event, "ability", { once: true, effect: "Native once-copy", cohortMembers: ["one", "two", "three"], cards: cohortCards }))];
  assert.equal(solveReplayCopyConstraints(cohortSteps.slice(0, 3), "facts").cohorts.length, 0, "intermediate use order cannot mark every copy used prematurely");
  const turnReset = solveReplayCopyConstraints([...cohortSteps,
    allocationStep(4, "turn", { section: 2, name: "*" }),
  ], "display", { endFrame: 8 });
  assert.equal(turnReset.projection.get(4)?.get("self")?.cards.filter((copy) => copy.card.abilityUsed).length, 3,
    "completed recorded Ability uses remain visible before the next turn");
  for (const frame of [5, 6, 7]) {
    const copies = turnReset.projection.get(frame)?.get("self")?.cards;
    assert.equal(copies?.length, 3, "a turn reset preserves all board copies even without a later board operation");
    assert.equal(copies?.filter((copy) => copy.card.abilityUsed).length, 0,
      "the new turn draw cannot inherit previous-turn usage through a projected witness");
  }

  const outsiders = Array.from({ length: 129 }, (_, index) => ({ ...allocationCard(`other-${index}`), card: { ...allocationCard(`other-${index}`).card, name: "Other" } }));
  const retainedCohort = solveReplayCopyConstraints([...cohortSteps,
    allocationStep(4, "create", { name: "", cards: outsiders }),
    allocationStep(5, "damage", { name: "Other", amount: 10, cards: [...cohortCards, ...outsiders] }),
  ], "facts");
  assert.equal(retainedCohort.boundedOut, true);
  assert.equal(retainedCohort.bindings.size + retainedCohort.relations.size + retainedCohort.used.size, 0, "the cap leaves only the independent certificate");
  assert.equal(hasReplayCopyProofs(retainedCohort), true, "the compiler must replay a retained cohort even without copy bindings or checkpoints");
  assert.equal(hasReplayCopyProofs({ ...retainedCohort, cohorts: [] }), false, "empty proof collections need no proof-aware replay");
  assert.deepEqual(retainedCohort.cohorts.map((fact) => [fact.fromEvent, fact.memberIds, fact.effect]), [[3, ["one", "three", "two"], "Native once-copy"]], "an unrelated capacity reset cannot erase an already entailed cohort marker");
  const stoppedCohort = solveReplayCopyConstraints([...cohortSteps, allocationStep(4, "barrier", { cards: cohortCards })], "facts");
  assert.equal(stoppedCohort.cohorts[0].untilEvent, 4, "unknown top identity cannot carry old all-used markers into a replacement cohort");
  const forgottenUse = solveReplayCopyConstraints([cohortSteps[0], cohortSteps[1], allocationStep(2, "barrier", { cards: cohortCards }),
    ...[3, 4, 5].map((event) => allocationStep(event, "ability", { once: true, effect: "Native once-copy", cohortMembers: ["one", "two", "three"], cards: cohortCards }))], "facts");
  assert.equal(forgottenUse.cohorts.length, 0, "an identity barrier cannot forget an earlier same-turn unknown activation then manufacture a fresh N=N legal window");
  assert.equal(isReplayCopyIndependentOnceAbilityText(reconText), true);
  assert.equal(isReplayCopyIndependentOnceAbilityText("Once during your turn, you may draw 3 cards. If you drew any cards in this way, shuffle this Pokémon and all attached cards into your deck."), false, "copy-dependent departure text does not use the marker-only cohort abstraction");
  const newlyEnteredCohort = solveReplayCopyConstraints([...cohortSteps,
    allocationStep(4, "create", { cards: [allocationCard("four")] }),
  ], "facts");
  assert.equal(newlyEnteredCohort.cohorts[0].untilEvent, 4, "a newly added namesake is not automatically marked by the old completed cohort");
  const coherent = solveReplayCopyConstraints([
    allocationStep(0, "create", { cards: [allocationCard("a"), allocationCard("b")] }),
    allocationStep(1, "damage", { amount: 30 }), allocationStep(2, "damage", { amount: 30 }),
    allocationStep(3, "ko", { lethal: (card) => card.damage === 30 }),
  ]);
  const firstAllocation = coherent.projection.get(2)?.get("self")!.cards;
  const secondAllocation = coherent.projection.get(3)?.get("self")!.cards;
  assert.equal(firstAllocation?.reduce((sum, copy) => sum + copy.card.damage, 0), 30);
  assert.deepEqual(secondAllocation?.map((copy) => copy.card.damage).sort(), [30, 30], "a selected whole witness satisfies its later knockout, rather than splicing unioned choices");
  assert.equal(firstAllocation?.filter((copy) => copy.card.damage === 30).length, 1);
  assert.equal(coherent.bindings.has("1"), false, "the deterministic display tie is never an evidenced recipient binding");
  const linkedDonor = solveReplayCopyConstraints([
    allocationStep(0, "create", { cards: [allocationCard("powered", 30), allocationCard("bare")] }),
    allocationStep(1, "ability", { once: true }),
    allocationStep(2, "counters", { amount: 30, referenceKey: "1" }),
    allocationStep(3, "damage", { amount: 30, distinctFromKey: "2" }),
  ]);
  assert.equal(linkedDonor.bindings.get("1"), "powered", "a verified source donor stays the physical copy that activated the Ability");
  assert.equal(linkedDonor.bindings.get("3"), "bare", "the recipient cannot be the same copy when the printed effect requires distinct targets");
  const donorKey = replayCopyKey(3, "self", "recorded movement", "Copy", undefined, 0, "donor");
  const recipientKey = replayCopyKey(3, "self", "recorded movement", "Copy", undefined, 0, "recipient");
  assert.notEqual(donorKey, recipientKey, "same-name same-owner counter endpoints retain different source-role identities");
  assert.equal(JSON.parse(donorKey)[0], 3);
  const cappedAllocation = solveReplayCopyConstraints([
    allocationStep(0, "create", { cards: Array.from({ length: 129 }, (_, index) => allocationCard(String(index))) }),
    allocationStep(1, "damage", { amount: 10 }),
  ]);
  assert.equal(cappedAllocation.boundedOut, true);
  assert.equal(cappedAllocation.projection.size, 0, "a bounded-out segment has no preferred history");
  const contradictedAllocation = solveReplayCopyConstraints([
    allocationStep(0, "create", { cards: [allocationCard("a")] }),
    allocationStep(1, "ko", { lethal: () => false }),
  ]);
  assert.equal(contradictedAllocation.projection.size, 0, "known nonlethal knockouts cannot supply a plausible history");
  const probableHpAllocation = allocationCard("variable-print", 80);
  probableHpAllocation.card.hp = 90; probableHpAllocation.card.hpBasis = "probable";
  const viablePrintingAllocation = solveReplayCopyConstraints([
    allocationStep(0, "create", { cards: [probableHpAllocation] }),
    allocationStep(1, "ko", { lethal: () => undefined }),
  ], "display");
  assert.equal(viablePrintingAllocation.projection.get(1)?.get("self")?.cards[0].card.damage, 80, "an unresolved compatible printed-HP domain cannot be rejected from a probable 90HP display value");
  const incompatibleNativeAllocation = solveReplayCopyConstraints([
    allocationStep(0, "create", { cards: [allocationCard("has-native-effect"), allocationCard("different-native-family")] }),
    allocationStep(1, "ability", { effect: "Native effect", effectAllowed: (card) => card.id === "has-native-effect" }),
  ], "display");
  assert.equal(incompatibleNativeAllocation.projection.get(2)?.get("self")?.cards.find((copy) => copy.card.abilityUsed)?.card.id, "has-native-effect", "a plausible activation cannot be assigned to a source-proven incompatible printing family");
  const oldestBench = allocationCard("action-1-card-0");
  const newerActive = { ...allocationCard("action-2-card-0"), position: "active" as const };
  const orderedSteps = [
    allocationStep(0, "create", { cards: [newerActive, oldestBench] }),
    allocationStep(1, "ko", { attackKoBatch: { id: "adjacent-attack", index: 0, last: false } }),
    allocationStep(2, "ko", { attackKoBatch: { id: "adjacent-attack", index: 1, last: true } }),
  ];
  const orderEnabled = solveReplayCopyConstraints(orderedSteps, "display", { endFrame: 6 });
  const orderDisabled = solveReplayCopyConstraints(orderedSteps, "display", { attackKoOrderConvention: false, endFrame: 6 });
  assert.equal(orderEnabled.projection.get(2)?.get("self")?.cards[0].card.id, oldestBench.card.id, "the attack-only ordering convention ranks one whole surviving history");
  assert.equal(orderDisabled.projection.get(2)?.get("self")?.cards[0].card.id, newerActive.card.id, "ablation returns to source creation order, independent of input array order");
  assert.equal(orderEnabled.bindings.size, 0, "a display convention never becomes a source-proven binding");
  assert.equal(orderEnabled.displaySegments[0].rules.includes("log-order convention"), true);
  const tailHistory = solveReplayCopyConstraints([allocationStep(0, "create", { cards: [oldestBench] }), allocationStep(1, "damage", { amount: 30 })], "display", { endFrame: 6 });
  assert.equal(tailHistory.projection.get(5)?.get("self")?.cards[0].card.damage, 30, "unchanged supported history covers trailing source frames");
  const stoppedHistory = solveReplayCopyConstraints([
    allocationStep(0, "create", { cards: [oldestBench] }), allocationStep(1, "damage", { amount: 30 }),
    allocationStep(2, "barrier", { cards: [{ ...oldestBench, card: { ...oldestBench.card, damageKnown: false, instanceUncertain: true } }] }),
  ], "display", { endFrame: 6 });
  assert.equal(stoppedHistory.projection.get(2)?.get("self")?.cards[0].card.damage, 30);
  assert.equal(stoppedHistory.projection.has(3), false, "the selected prefix ends before an unsupported identity boundary");
  const localSnapshot = { ...oldestBench, card: { ...oldestBench.card, damageKnown: false, instanceUncertain: true } };
  const localBarrierHistory = solveReplayCopyConstraints([
    allocationStep(0, "create", { cards: [oldestBench] }), allocationStep(1, "damage", { amount: 30 }),
    allocationStep(2, "barrier", { name: "Other", barrierNames: ["Other"], cards: [localSnapshot] }),
    allocationStep(3, "damage", { amount: 10 }),
  ], "display", { endFrame: 6 });
  assert.equal(localBarrierHistory.projection.get(4)?.get("self")?.cards[0].card.damage, 40,
    "a local unsupported operation retains the same chosen whole prefix on a source-unaffected domain");
  const overlappingBarrierHistory = solveReplayCopyConstraints([
    allocationStep(0, "create", { cards: [oldestBench] }), allocationStep(1, "damage", { amount: 30 }),
    allocationStep(2, "barrier", { name: "Other", barrierNames: ["Other", "Copy"], cards: [localSnapshot] }),
    allocationStep(3, "damage", { amount: 10 }),
  ], "display", { endFrame: 6 });
  assert.equal(overlappingBarrierHistory.projection.has(4), false, "an overlapping uncertain component domain cannot inherit the chosen allocation");
  assert.equal(overlappingBarrierHistory.displaySegments.some((segment) => segment.reason === "no_candidate"), true,
    "an erased snapshot domain is a coverage gap, not a claimed illegal-game contradiction");
  const laterBarrierWitness = solveReplayCopyConstraints([
    allocationStep(0, "create", { cards: [oldestBench, allocationCard("action-2-card-0")] }),
    allocationStep(1, "damage", { amount: 30 }),
    allocationStep(2, "barrier", { name: "Other", barrierNames: ["Other"], cards: [localSnapshot, { ...allocationCard("action-2-card-0"), card: { ...allocationCard("action-2-card-0").card, instanceUncertain: true } }] }),
    allocationStep(3, "ko", { targetId: "action-2-card-0", lethal: (card) => card.damage >= 30 }),
  ], "display");
  assert.equal(laterBarrierWitness.projection.get(2)?.get("self")?.cards.find((copy) => copy.card.id === "action-2-card-0")?.card.damage, 30,
    "later hard evidence selects an alternative whole prefix retained across a source-unaffected local barrier");
  assert.equal(laterBarrierWitness.displaySegments.some((segment) => segment.reason === "contradiction"), false);
  const checkpointHistory = solveReplayCopyConstraints([
    allocationStep(0, "create", { cards: [localSnapshot] }), allocationStep(1, "damage", { amount: 30 }),
    allocationStep(2, "checkpoint", { cards: [{ ...oldestBench, card: { ...oldestBench.card, damage: 30 } }] }),
    allocationStep(3, "damage", { amount: 10 }),
  ], "display");
  assert.equal(checkpointHistory.projection.has(2), false, "complete factual recovery does not backfill an erased interval");
  assert.equal(checkpointHistory.projection.get(4)?.get("self")?.cards[0].card.damage, 40);
  const temporalCheckpoint = solveReplayCopyConstraints([
    allocationStep(0, "create", { cards: [{ ...oldestBench, entered: 0 }] }),
    allocationStep(1, "evolve", { newName: "Evolved", timing: true }),
    allocationStep(2, "checkpoint", { cards: [{ ...oldestBench, card: { ...oldestBench.card, name: "Evolved", underlying: [{ id: "source-layer", name: "Copy", imageUrl: "" }] } }] }),
    allocationStep(3, "evolve", { name: "Evolved", newName: "Twice", timing: true }),
  ], "display");
  assert.equal(temporalCheckpoint.projection.get(3)?.get("self")?.cards[0].evolved, 1,
    "compatible certainty snapshots cannot erase a surviving world's known evolution section");
  assert.equal(temporalCheckpoint.displaySegments.some((segment) => segment.endEvent === 3 && segment.reason === "no_candidate"), true,
    "a missing canonical snapshot timestamp cannot permit a second same-turn evolution");
  const slotSteps = [allocationStep(0, "create", { cards: [{ ...oldestBench, card: { ...oldestBench.card, damage: 10 } }, allocationCard("action-2-card-0")] }),
    allocationStep(1, "evolve", { newName: "Evolved", preferredId: "action-2-card-0" })];
  const stableSlot = solveReplayCopyConstraints(slotSteps, "display");
  assert.equal(stableSlot.projection.get(2)?.get("self")?.cards.find((copy) => copy.card.name === "Evolved")?.card.damage, 0,
    "an evidence-tied evolution can prefer a stable presentation slot without preferring the oldest physical copy");
  const overriddenSlot = solveReplayCopyConstraints([...slotSteps, allocationStep(2, "witness", { name: "Evolved", targetId: oldestBench.card.id, effect: "Native" })], "display");
  assert.equal(overriddenSlot.projection.get(2)?.get("self")?.cards.find((copy) => copy.card.name === "Evolved")?.card.id, oldestBench.card.id,
    "later hard evidence overrides the soft presentation-slot preference");
  assert.equal(stableSlot.bindings.size, 0);
  const displayFrame = structuredClone(threeCopyRecon.frames[16]);
  const markerOnlyFrame = structuredClone(threeCopyRecon.frames[14]);
  const markerOnlyOrder = markerOnlyFrame.self.bench.map((card) => card.id);
  assert.ok(markerOnlyFrame.boardProjection?.self?.cards.some((patch) => patch.plausibleFields.includes("abilityUsed")));
  markerOnlyFrame.boardProjection!.self!.benchOrder = [...markerOnlyOrder].reverse();
  const markerOnlyBefore = JSON.stringify(markerOnlyFrame);
  assert.deepEqual(resolveReplayBoardDisplay(markerOnlyFrame, threeCopyRecon.cardResolutions).self.bench.map((card) => card.id), markerOnlyOrder,
    "a scalar-only Ability marker cannot reorder otherwise unchanged Bench slots");
  assert.equal(JSON.stringify(markerOnlyFrame), markerOnlyBefore);
  displayFrame.self.bench.forEach((card) => { card.damageKnown = false; });
  const displayMembers = displayFrame.self.bench.map((card) => card.id);
  displayFrame.self.boardPools = [{ id: "display-only-components", memberIds: displayMembers, cards: [{ id: "one-tool", name: "Brave Bangle", imageUrl: "", boardRole: "tool" }] }];
  displayFrame.boardProjection = { self: { basis: "plausible", cards: displayFrame.self.bench.map((card, index) => ({
    id: card.id, name: card.name, position: "bench", damage: index === 0 ? 30 : 0, energy: [...card.energy], underlyingNames: card.underlying.map((layer) => layer.name),
    ...(index === 0 ? { tool: "Brave Bangle" } : {}), plausibleFields: ["damage", "tool"],
  })), moves: [{ sourceKey: "display-only-source", kind: "damage", cardId: displayMembers[0], amount: 30 }] } };
  const displayBefore = JSON.stringify(displayFrame);
  const boardDisplay = resolveReplayBoardDisplay(displayFrame);
  assert.equal(JSON.stringify(displayFrame), displayBefore, "materializing a plausible board never mutates its factual frame");
  assert.equal(boardDisplay.self.active, displayFrame.self.active, "unpatched known Pokémon and donor facts are preserved");
  const orderedDisplay = structuredClone(displayFrame);
  orderedDisplay.boardProjection!.self!.benchOrder = [...orderedDisplay.self.bench.map((card) => card.id)].reverse();
  assert.deepEqual(resolveReplayBoardDisplay(orderedDisplay).self.bench.map((card) => card.id), orderedDisplay.boardProjection!.self!.benchOrder,
    "a complete display Bench order carries selected lineage slots without rewriting native presentation identities");
  orderedDisplay.boardProjection!.self!.benchOrder = [orderedDisplay.self.bench[0].id, orderedDisplay.self.bench[0].id];
  assert.equal(resolveReplayBoardDisplay(orderedDisplay).self, orderedDisplay.self, "duplicate or incomplete Bench orders refuse");
  assert.deepEqual(boardDisplay.self.bench.map((card) => card.damage), [30, 0]);
  assert.ok(boardDisplay.self.bench.every((card) => card.plausibleFields?.includes("damage")));
  assert.equal(boardDisplay.self.bench.filter((card) => card.tool === "Brave Bangle").length, 1);
  assert.equal(boardDisplay.self.boardPools?.flatMap((pool) => pool.cards).length, 0, "the one materialized Tool is not also displayed as a second pooled copy");
  const pooledLayerDisplay = structuredClone(displayFrame);
  const nativeLayerIds = pooledLayerDisplay.self.bench.map((card) => card.underlying.map((layer) => layer.id));
  const nativeLayerNames = pooledLayerDisplay.self.bench.map((card) => card.underlying.map((layer) => layer.name));
  const nativeLayerObjects = pooledLayerDisplay.self.bench.flatMap((card) => card.underlying.map((layer) => ({ ...layer, boardRole: "evolution" as const })));
  assert.ok(nativeLayerObjects.length > 0, "this allocation guard reuses real earlier native layer objects");
  pooledLayerDisplay.self.boardPools = [{ id: "guaranteed-native-layers", memberIds: displayMembers, cards: nativeLayerObjects }];
  pooledLayerDisplay.self.bench.forEach((card) => { card.underlying = []; card.instanceUncertain = true; });
  pooledLayerDisplay.boardProjection!.self!.cards.forEach((patch, index) => {
    delete patch.tool; patch.underlyingIds = nativeLayerIds[index]; patch.underlyingNames = nativeLayerNames[index];
  });
  const nativeLayerDisplay = resolveReplayBoardDisplay(pooledLayerDisplay);
  assert.deepEqual(nativeLayerDisplay.self.bench.map((card) => card.underlying.map((layer) => layer.id)), nativeLayerIds,
    "a complete allocation restores existing pooled native evolution objects exactly once");
  assert.equal(nativeLayerDisplay.self.bench[0].underlying[0], nativeLayerObjects[0], "layer assignment preserves the original native metadata object");
  assert.equal(nativeLayerDisplay.self.bench[0].plausibleFields?.includes("underlying"), true);
  const duplicatedLayers = structuredClone(pooledLayerDisplay);
  duplicatedLayers.boardProjection!.self!.cards[1].underlyingIds = nativeLayerIds[0];
  assert.equal(resolveReplayBoardDisplay(duplicatedLayers).self, duplicatedLayers.self, "two projected stacks cannot reuse one physical native layer");
  const inventedLayer = structuredClone(pooledLayerDisplay);
  inventedLayer.boardProjection!.self!.cards[0].underlyingIds = ["not-an-existing-native-object"];
  assert.equal(resolveReplayBoardDisplay(inventedLayer).self, inventedLayer.self, "names alone cannot mint an evolution metadata object");
  const partialPoolDisplay = structuredClone(displayFrame);
  partialPoolDisplay.boardProjection!.self!.cards = partialPoolDisplay.boardProjection!.self!.cards.slice(0, 1);
  const partialPoolBefore = JSON.stringify(partialPoolDisplay);
  assert.equal(resolveReplayBoardDisplay(partialPoolDisplay).self, partialPoolDisplay.self, "a partial member assignment cannot duplicate a guaranteed pooled Tool or Energy");
  assert.equal(JSON.stringify(partialPoolDisplay), partialPoolBefore);
  partialPoolDisplay.self.boardPools![0].cards = [];
  delete partialPoolDisplay.boardProjection!.self!.cards[0].tool;
  partialPoolDisplay.boardProjection!.self!.cards[0].plausibleFields = ["damage"];
  const emptyReferenceDisplay = resolveReplayBoardDisplay(partialPoolDisplay);
  assert.equal(emptyReferenceDisplay.self.bench[0].damage, 30, "an empty historical-reference pool does not block an otherwise eligible subset projection");
  const knownAttachmentDisplay = structuredClone(displayFrame);
  knownAttachmentDisplay.self.boardPools = [];
  knownAttachmentDisplay.self.bench[0].energy = ["Grass"];
  knownAttachmentDisplay.self.bench[1].energy = ["Psychic"];
  knownAttachmentDisplay.boardProjection!.self!.cards.forEach((card, index) => {
    delete card.tool; card.energy = [index === 0 ? "Psychic" : "Grass"];
  });
  assert.equal(resolveReplayBoardDisplay(knownAttachmentDisplay).self, knownAttachmentDisplay.self,
    "even a conserved Energy multiset cannot override independently known unpooled attachments");
  const knownDamageDisplay = structuredClone(displayFrame);
  knownDamageDisplay.self.bench.forEach((card) => { card.damageKnown = true; });
  assert.equal(resolveReplayBoardDisplay(knownDamageDisplay).self, knownDamageDisplay.self, "a plausible assignment cannot override independently known damage");
  const conditionalPoolDisplay = structuredClone(displayFrame);
  conditionalPoolDisplay.self.boardPools![0].uncertainCards = [{ cards: [{ id: "conditional-tool", name: "Brave Bangle", imageUrl: "" }], destinations: ["hand"] }];
  assert.equal(resolveReplayBoardDisplay(conditionalPoolDisplay).self, conditionalPoolDisplay.self, "a conditional board-or-zone component cannot be materialized as a guaranteed attachment");
  const extraActiveDisplay = structuredClone(displayFrame);
  extraActiveDisplay.self.bench.forEach((card) => { card.instanceUncertain = true; });
  extraActiveDisplay.boardProjection!.self!.cards[0].position = "active";
  assert.equal(resolveReplayBoardDisplay(extraActiveDisplay).self, extraActiveDisplay.self, "a plausible position assignment cannot add a second Active Pokémon");
  const partialDamageDisplay = structuredClone(displayFrame);
  partialDamageDisplay.self.bench.forEach((card) => { card.instanceUncertain = true; });
  partialDamageDisplay.self.bench[0].damage = 30;
  partialDamageDisplay.self.bench[0].damageKnown = true;
  assert.deepEqual(resolveReplayBoardDisplay(partialDamageDisplay).self.bench.map((card) => card.damage), [30, 0],
    "a complete allocation retains each partially known damage value");
  partialDamageDisplay.boardProjection!.self!.cards[0].damage = 0;
  partialDamageDisplay.boardProjection!.self!.cards[1].damage = 60;
  assert.equal(resolveReplayBoardDisplay(partialDamageDisplay).self, partialDamageDisplay.self,
    "unknown damage on a namesake cannot erase an established 30-damage member value");
  const mixedNameDamage = structuredClone(partialDamageDisplay);
  mixedNameDamage.self.bench[1].name = "Other copy";
  mixedNameDamage.boardProjection!.self!.cards[1].name = "Other copy";
  mixedNameDamage.boardProjection!.self!.cards[1].damage = 30;
  assert.equal(resolveReplayBoardDisplay(mixedNameDamage).self, mixedNameDamage.self,
    "a connected component pool cannot preserve recorded damage on a different Pokémon name");
  const unknownActiveDisplay = structuredClone(displayFrame);
  const unplacedActive = unknownActiveDisplay.self.active!;
  unknownActiveDisplay.self.active = null;
  unknownActiveDisplay.self.activeUncertain = true;
  unknownActiveDisplay.self.unplaced = [unplacedActive];
  unknownActiveDisplay.boardProjection!.self!.cards.push({ id: unplacedActive.id, name: unplacedActive.name, position: "active", damage: unplacedActive.damage,
    energy: [...unplacedActive.energy], underlyingNames: unplacedActive.underlying.map((card) => card.name), plausibleFields: ["position"] });
  const activeRefusals: Array<{ actor: "self" | "opponent"; reason: string }> = [];
  const remainingActive = resolveReplayBoardDisplay(unknownActiveDisplay, {}, activeRefusals).self;
  assert.deepEqual(activeRefusals, [], "the complete unplaced survivor projection passes all materializer guards");
  assert.equal(remainingActive.active?.id, unplacedActive.id, "an evidenced unplaced survivor may occupy an unresolved Active slot in the complete witness");
  assert.equal(remainingActive.activeUncertain, false);
  assert.ok(remainingActive.active?.plausibleFields?.includes("position"));
  unknownActiveDisplay.self.activeUncertain = false;
  assert.equal(resolveReplayBoardDisplay(unknownActiveDisplay).self, unknownActiveDisplay.self, "a confirmed empty knockout interval cannot acquire a guessed Active");
  unknownActiveDisplay.self.activeUncertain = true;
  unknownActiveDisplay.self.unplaced = [];
  assert.equal(resolveReplayBoardDisplay(unknownActiveDisplay).self, unknownActiveDisplay.self, "an unresolved Active slot cannot invent a surviving physical top");
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

  // Actual Ripening Charge/Syrup Storm clauses and detail wording, reused at
  // the compiler boundary with unit-state setup; no saved private game fixture.
  const ripeningText = "Once during your turn, you may attach a Basic {G} Energy card from your hand to 1 of your Pokémon. If you attached Energy to a Pokémon in this way, heal 30 damage from that Pokémon.";
  const ripeningDefinition = syntheticCardDefinition({ name: "Hydrapple ex", hp: 330,
    abilities: [{ name: "Ripening Charge", text: ripeningText, type: "Ability" }],
    attacks: [{ name: "Syrup Storm", damage: "30+", text: "This attack does 30 more damage for each {G} Energy attached to all of your Pokémon.", cost: null }],
  });
  const recipientDefinition = syntheticCardDefinition({ name: "Seedling", hp: 300 });
  const healingDefinitions = (...definitions: typeof ripeningDefinition[]) => {
    const index = buildCardDefinitionIndex(definitions);
    return Object.fromEntries(definitions.map((definition) => [definition.name.toLowerCase(), resolveCardDefinition(index, { name: definition.name })]));
  };
  const cappedSource = (details: string[], definition = ripeningDefinition, damaged = true) => ({ ...source([section("PlayerOne", [
    action("PlayerOne played Seedling to the Active Spot."), action("PlayerOne played Hydrapple ex to the Bench."),
    ...(damaged ? [action("PlayerOne put 2 damage counters on PlayerOne's Seedling.")] : []),
    action("PlayerOne's Hydrapple ex used Ripening Charge.", details),
  ])]), cardDefinitions: healingDefinitions(recipientDefinition, definition),
    effectTags: { "PlayerOne's Hydrapple ex used Ripening Charge.": "ability" as const },
    effectOrigins: { "PlayerOne's Hydrapple ex used Ripening Charge.": "hand" as const },
  });
  const cappedDetails = ["- PlayerOne attached Basic Grass Energy to Seedling in the Active Spot.", "- PlayerOne's Seedling healed 30 damage."];
  const cappedHealing = compileBattleReplay(cappedSource(cappedDetails));
  assert.equal(cappedHealing.frames[4].self.active?.damage, 0, "printed healing capacity clamps at existing damage");
  assert.notEqual(cappedHealing.frames[4].self.active?.damageKnown, false);
  assert.deepEqual(cappedHealing.frames[4].self.active?.energy, ["Grass"]);
  assert.deepEqual(cappedHealing.diagnostics.unresolvedActions, []);
  const zeroHealing = compileBattleReplay(cappedSource(cappedDetails, ripeningDefinition, false));
  assert.equal(zeroHealing.frames.at(-1)?.self.active?.damage, 0, "a recorded attachment-bound heal cannot create or select damage");
  assert.deepEqual(zeroHealing.diagnostics.unresolvedActions, []);
  for (const input of [
    cappedSource(cappedDetails, { ...ripeningDefinition, abilities: [{ name: "Ripening Charge", text: null, type: "Ability" }] }),
    cappedSource(cappedDetails.slice(1)),
    cappedSource([cappedDetails[0].replace("Grass", "Fire"), cappedDetails[1]]),
    cappedSource([cappedDetails[0].replace("Spot.", "Spot from deck."), cappedDetails[1]]),
    cappedSource([cappedDetails[0], cappedDetails[1].replace("30", "9007199254740992")]),
  ]) assert.ok(compileBattleReplay(input).events[3].unresolved?.length, "missing, conflicting, or out-of-bounds effect evidence cannot establish capped healing");
  const potionDefinition = syntheticCardDefinition({ name: "Potion", hp: null, category: "Trainer", trainerType: "Item", attacks: [], rules: ["Heal 30 damage from 1 of your Pokémon."] });
  const fixedHealing = compileBattleReplay({ ...source([section("PlayerOne", [
    action("PlayerOne played Seedling to the Active Spot."), action("PlayerOne put 2 damage counters on PlayerOne's Seedling."),
    action("PlayerOne played Seedling to the Bench."), action("PlayerOne played Potion.", ["PlayerOne healed 30 damage from PlayerOne's Seedling."]),
  ])]), cardDefinitions: healingDefinitions(recipientDefinition, potionDefinition) });
  assert.ok(fixedHealing.events[3].unresolved?.length, "a nominal capacity cannot identify a damaged copy among damaged and undamaged namesakes");
  assert.equal(fixedHealing.frames[4].self.active?.damage, 20);
  const unknownHealingInput = cappedSource(cappedDetails);
  unknownHealingInput.sections = [section("PlayerOne", [
    action("PlayerOne played Seedling to the Active Spot."), action("PlayerOne played Seedling to the Bench."),
    action("PlayerOne put 2 damage counters on PlayerOne's Seedling."), action("PlayerOne played Hydrapple ex to the Bench."),
    action("PlayerOne's Hydrapple ex used Ripening Charge.", cappedDetails),
  ])];
  const unknownHealing = compileBattleReplay(unknownHealingInput);
  assert.equal(unknownHealing.frames.at(-1)?.self.active?.damageKnown, false, "a capped healing amount does not reconstruct unknown previous damage");
  const variableSource = (definition = ripeningDefinition) => ({ ...source([section("PlayerOne", [
    action("PlayerOne played Hydrapple ex to the Active Spot."), action("PlayerTwo played Seedling to the Active Spot."),
    action("PlayerTwo put 2 damage counters on PlayerTwo's Seedling."),
    action("PlayerTwo played Seedling to the Bench."),
    action("PlayerOne's Hydrapple ex used Syrup Storm on PlayerTwo’s Seedling for 270 damage.", ["- Damage breakdown:", "• Base damage: 30 damage", "• 8 attached Energy: 240 damage", "• Total damage: 270 damage"]),
  ])]), cardDefinitions: healingDefinitions(recipientDefinition, definition) });
  const variableAttack = compileBattleReplay(variableSource());
  assert.equal(variableAttack.frames[5].opponent.active?.damage, 290, "recorded variable damage applies once to the ordinary Active target");
  assert.notEqual(variableAttack.frames[5].opponent.active?.damageKnown, false);
  assert.equal(variableAttack.frames[5].opponent.bench[0].damage, 0, "the same-name Bench recipient is independently unchanged");
  assert.notEqual(variableAttack.frames[5].opponent.bench[0].damageKnown, false);
  const ambiguousAttack = compileBattleReplay(variableSource({ ...ripeningDefinition, attacks: [{ name: "Syrup Storm", damage: "30+", text: "This attack does 30 more damage for each {G} Energy attached to all of your Pokémon. Choose 1 of your opponent's Pokémon.", cost: null }] }));
  assert.ok(ambiguousAttack.events[4].unresolved?.length, "a different or incomplete target clause cannot borrow ordinary Active semantics");

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
    action("PlayerTwo played Thwackey to the Bench."), action("PlayerTwo attached Basic Grass Energy to Thwackey on the Bench."), action("PlayerTwo played Thwackey to the Bench."),
    action("PlayerOne's Dragapult ex used Phantom Dive on PlayerTwo’s Thwackey for 200 damage.", ["- PlayerOne put 6 damage counters on PlayerOne's Thwackey."]),
  ])]), cardDefinitions: { "dragapult ex": resolveCardDefinition(buildCardDefinitionIndex([diver]), { name: "Dragapult ex" }), thwackey: resolveCardDefinition(buildCardDefinitionIndex([syntheticCardDefinition({ name: "Thwackey", hp: 60 })]), { name: "Thwackey" }) } });
  assert.equal(benchOnlyCounters.frames[6].opponent.active?.damage, 200);
  assert.notEqual(benchOnlyCounters.frames[6].opponent.active?.damageKnown, false, "Bench-only counter copy ambiguity cannot erase independently recorded Active attack damage");
  assert.ok(benchOnlyCounters.frames[6].opponent.bench.every((card) => card.damageKnown === false));
  const counterFrame = benchOnlyCounters.frames[6];
  const counterDisplay = resolveReplayBoardDisplay(counterFrame, benchOnlyCounters.cardResolutions);
  const originalCounterEvent = JSON.stringify(benchOnlyCounters.events[5]);
  const counterEvent = resolveReplayDisplayEvent(benchOnlyCounters.events[5], counterFrame, counterDisplay)!;
  assert.equal(JSON.stringify(benchOnlyCounters.events[5]), originalCounterEvent, "display recipient remapping leaves the recorded transaction unchanged");
  assert.ok(counterEvent.transaction!.stages.some((stage) => stage.kind === "damage" && stage.label === "200 damage"
    && stage.cards.some((card) => card.id === counterFrame.opponent.active!.id)), "the independently known Active recipient survives a same-name plausible Bench recipient");
  assert.equal(counterEvent.transaction!.stages.filter((stage) => stage.kind === "damage" && stage.label === "60 damage · plausible recipient").length, 1);
  const ambiguousCounterEvent = structuredClone(benchOnlyCounters.events[5]);
  ambiguousCounterEvent.transaction!.stages.push({ kind: "damage", label: "60 damage", cards: [counterFrame.opponent.bench[0]], actor: "opponent", targetResolved: false });
  const replacedCounterEvent = resolveReplayDisplayEvent(ambiguousCounterEvent, counterFrame, counterDisplay)!;
  assert.equal(replacedCounterEvent.transaction!.stages.filter((stage) => stage.kind === "damage").length, 2,
    "only the matching unresolved increment is replaced; the known namesake's separate source increment remains");
  const knownCounterEvent = structuredClone(counterEvent);
  const knownRecipient = knownCounterEvent.transaction!.stages.find((stage) => stage.label === "60 damage · plausible recipient")!;
  knownRecipient.label = "60 damage";
  assert.equal(resolveReplayDisplayEvent(knownCounterEvent, counterFrame, counterDisplay), knownCounterEvent,
    "an already resolved matching target and amount does not receive a duplicate projected increment");


  const identicalBenchInput = { ...source([section("PlayerOne", [
    action("PlayerOne played Dragapult ex to the Active Spot."), action("PlayerTwo played Seedling to the Active Spot."),
    action("PlayerTwo played Thwackey to the Bench."), action("PlayerTwo played Thwackey to the Bench."),
    action("PlayerOne's Dragapult ex used Phantom Dive on PlayerTwo’s Seedling for 200 damage.", ["- PlayerOne put 6 damage counters on PlayerOne's Thwackey."]),
    action("PlayerTwo's Thwackey was Knocked Out."),
  ])]), cardDefinitions: { "dragapult ex": resolveCardDefinition(buildCardDefinitionIndex([diver]), { name: "Dragapult ex" }),
    seedling: resolveCardDefinition(buildCardDefinitionIndex([syntheticCardDefinition()]), { name: "Seedling" }),
    thwackey: resolveCardDefinition(buildCardDefinitionIndex([syntheticCardDefinition({ name: "Thwackey", hp: 60 })]), { name: "Thwackey" }) } };
  const identicalBench = compileBattleReplay(identicalBenchInput);
  assert.deepEqual(identicalBench.frames[5].opponent.bench.map((card) => card.damage).sort((a, b) => a - b), [0, 60]);
  assert.ok(identicalBench.frames[5].opponent.bench.every((card) => card.damageKnown !== false));
  assert.equal(identicalBench.frames[6].opponent.bench.length, 1);
  assert.equal(identicalBench.frames[6].opponent.bench[0].damage, 0);
  assert.notEqual(identicalBench.frames[6].opponent.bench[0].damageKnown, false, "the coupled KO path retains the unaffected identical Bench survivor");
  assert.deepEqual(identicalBench.diagnostics.unresolvedActions, []);

  // Anonymized original bd2 #41–43 attack/KO wording, with only its
  // recorded placement/evolution prerequisites. Null Mumble prose remains
  // unknown: the surviving-zero fact comes from the KO batch, not vanilla.
  const duskullPrints = [syntheticCardDefinition({ name: "Duskull", sourceCardId: "duskull-a", hp: 60, abilities: [], attacks: [{ name: "Mumble", damage: "20", cost: [], text: null }] }),
    syntheticCardDefinition({ name: "Duskull", sourceCardId: "duskull-b", hp: 60, abilities: [], attacks: [{ name: "Mumble", damage: "20", cost: [], text: null }] })];
  const batchDefinitions = [diver, ...duskullPrints,
    syntheticCardDefinition({ name: "Dreepy", abilities: [], attacks: [] }), syntheticCardDefinition({ name: "Drakloak", abilities: [], attacks: [] }),
    syntheticCardDefinition({ name: "Abra", hp: 60, abilities: [], attacks: [] }), syntheticCardDefinition({ name: "Kadabra", hp: 80, abilities: [], attacks: [] })];
  const batchInput = { ...source([
    section("", [action("PlayerOne played Dreepy to the Active Spot."), action("PlayerTwo played Abra to the Active Spot."), action("PlayerTwo played Duskull to the Bench.")]),
    section("PlayerOne", [action("PlayerOne ended their turn.")]),
    section("PlayerTwo", [action("PlayerTwo evolved Abra to Kadabra in the Active Spot."), action("PlayerTwo played Duskull to the Bench."), action("PlayerTwo ended their turn.")]),
    section("PlayerOne", [action("PlayerOne evolved Dreepy to Drakloak in the Active Spot."), action("PlayerOne ended their turn.")]),
    section("PlayerTwo", [action("PlayerTwo ended their turn.")]),
    section("PlayerOne", [action("PlayerOne evolved Drakloak to Dragapult ex in the Active Spot."),
      action("PlayerOne's Dragapult ex used Phantom Dive on PlayerTwo’s Kadabra for 200 damage.", ["- PlayerOne put 6 damage counters on PlayerOne's Duskull."]),
      action("PlayerTwo's Kadabra was Knocked Out!", ["Abra was discarded from PlayerTwo's Kadabra."]), action("PlayerTwo's Duskull was Knocked Out!")]),
  ]), cardDefinitions: Object.fromEntries(batchDefinitions.map((definition) => [definition.name.toLowerCase(), resolveCardDefinition(buildCardDefinitionIndex(batchDefinitions), { name: definition.name })])) };
  const batchSurvivor = compileBattleReplay(batchInput).frames.at(-1)!.opponent.bench.find((card) => card.name === "Duskull")!;
  assert.equal(batchSurvivor.damage, 0);
  assert.notEqual(batchSurvivor.damageKnown, false, "a neutral complete other-name KO does not erase the only untouched counter-pool survivor");
  const missingDepartureComponent = structuredClone(batchInput);
  missingDepartureComponent.sections![2].actions.splice(1, 0, action("PlayerTwo attached Bravery Charm to Kadabra in the Active Spot."));
  const departedHpTool = syntheticCardDefinition({ name: "Bravery Charm", category: "Trainer", trainerType: "Tool", hp: null, abilities: [], attacks: [], rules: ["The Basic Pokémon this card is attached to gets +50 HP."] });
  missingDepartureComponent.cardDefinitions["bravery charm"] = resolveCardDefinition(buildCardDefinitionIndex([departedHpTool]), { name: "Bravery Charm" });
  const nonNeutralDeparture = compileBattleReplay({ ...missingDepartureComponent, effectTags: { "PlayerTwo attached Bravery Charm to Kadabra in the Active Spot.": "tool" } });
  assert.equal(nonNeutralDeparture.frames[6].opponent.active?.tool, "Bravery Charm");
  assert.equal(nonNeutralDeparture.frames.at(-1)!.opponent.bench.find((card) => card.name === "Duskull")!.damageKnown, false,
    "an attached HP Tool must pass departure neutrality even when the recorded KO details do not repeat its name");
  const interruptedBatch = structuredClone(batchInput);
  interruptedBatch.sections![5].actions.splice(3, 0, action("PlayerOne drew a card."));
  assert.equal(compileBattleReplay(interruptedBatch).frames.at(-1)!.opponent.bench.find((card) => card.name === "Duskull")!.damageKnown, false,
    "a non-KO mutation ends the bounded counter-elimination batch");
  const hpDeparture = structuredClone(batchInput);
  const hpSetter = syntheticCardDefinition({ name: "Kadabra", hp: 80, abilities: [{ name: "HP context", type: "Ability", text: "Your Pokémon have 30 more HP." }], attacks: [] });
  hpDeparture.cardDefinitions.kadabra = resolveCardDefinition(buildCardDefinitionIndex([hpSetter]), { name: "Kadabra" });
  assert.equal(compileBattleReplay(hpDeparture).frames.at(-1)!.opponent.bench.find((card) => card.name === "Duskull")!.damageKnown, false,
    "a departing HP/suppression source cannot be skipped as a neutral KO");
  const conflictingFamily = structuredClone(identicalBenchInput);
  conflictingFamily.sections[0].actions.pop();
  const thwackeyFamilies = [syntheticCardDefinition({ name: "Thwackey", hp: 60, sourceCardId: "one-family", attacks: [] }),
    syntheticCardDefinition({ name: "Thwackey", hp: 70, sourceCardId: "other-family", attacks: [] })];
  conflictingFamily.cardDefinitions.thwackey = resolveCardDefinition(buildCardDefinitionIndex(thwackeyFamilies), { name: "Thwackey" });
  const unresolvedFamily = compileBattleReplay(conflictingFamily);
  assert.ok(unresolvedFamily.frames[5].opponent.bench.every((card) => card.damageKnown === false), "equal broad printing queries containing different HP/gameplay families are not identical physical printings");

  const directKoSource = source([section("PlayerOne", [
    action("PlayerOne played Attacker to the Active Spot."), action("PlayerTwo played Twin to the Active Spot."),
    action("PlayerTwo attached Basic Grass Energy to Twin in the Active Spot."), action("PlayerTwo played Twin to the Bench."),
    action("PlayerOne's Attacker used Pollen on PlayerTwo's Twin for 60 damage."),
    action("PlayerTwo's Twin was Knocked Out.", ["- 1 card was discarded from PlayerTwo's Twin.", "• Basic Grass Energy"]),
  ])]);
  const twinEvidence = resolveCardDefinition(buildCardDefinitionIndex([syntheticCardDefinition({ name: "Twin", hp: null })]), { name: "Twin" });
  const directAttacker = resolveCardDefinition(buildCardDefinitionIndex([{ ...ordinaryAttacker, attacks: [{ ...ordinaryAttacker.attacks[0], damage: "60", text: "" }] }]), { name: "Attacker" });
  const attackKo = compileBattleReplay({ ...directKoSource, cardDefinitions: { attacker: directAttacker, twin: twinEvidence } });
  assert.equal(attackKo.frames[6].opponent.active, null, "the sole resolved damage-stage recipient establishes the KO slot without using probable target HP");
  assert.equal(attackKo.frames[6].opponent.bench[0].damage, 0);
  assert.deepEqual(attackKo.diagnostics.unresolvedActions, []);
  for (const text of [null, "Choose 1 of your opponent's Pokémon. This attack does 60 damage to it.", "Discard a Tool from your opponent's Active Pokémon.", "Your opponent's Pokémon have 60 less HP."]) {
    const noBundle = structuredClone(directKoSource);
    noBundle.sections[0].actions[5].details = [];
    const refused = compileBattleReplay({ ...noBundle, cardDefinitions: { attacker: resolveCardDefinition(buildCardDefinitionIndex([{ ...ordinaryAttacker, attacks: [{ ...ordinaryAttacker.attacks[0], damage: "60", text }] }]), { name: "Attacker" }) } });
    assert.ok(refused.events[5].unresolved?.length, "incomplete, redirected or independently changing attack clauses cannot provide the recipient-only KO proof");
  }

  // Literal anonymized a30ae7d8 attachment/evolution/KO wording. The
  // reduced source keeps the recorded board prerequisites and turn sections.
  const evolvedAttachmentSource = source([
    section("", [
      action("PlayerOne played Dreepy to the Active Spot."),
      action("PlayerTwo played Fezandipiti ex to the Active Spot."),
    ]),
    section("PlayerOne", [
      action("PlayerOne played Buddy-Buddy Poffin.", ["- PlayerOne drew 2 cards and played them to the Bench.", "• Dreepy, Dreepy"]),
      action("PlayerOne played Torchic to the Bench."),
      action("PlayerOne attached Basic Darkness Energy to Dreepy in the Active Spot."),
    ]),
    section("PlayerTwo", [
      action("PlayerTwo played Buddy-Buddy Poffin.", ["- PlayerTwo drew 2 cards and played them to the Bench.", "• Dreepy, Dreepy"]),
      action("PlayerTwo played Budew to the Bench."),
      action("PlayerTwo attached Basic Fire Energy to Fezandipiti ex in the Active Spot."),
      action("PlayerTwo retreated Fezandipiti ex to the Bench.", ["- Basic Fire Energy was discarded from PlayerTwo's Fezandipiti ex.", "PlayerTwo's Budew is now in the Active Spot."]),
      action("PlayerTwo's Budew used Itchy Pollen on PlayerOne’s Dreepy for 10 damage."),
    ]),
    section("PlayerOne", [
      action("PlayerOne attached Basic Psychic Energy to Torchic on the Bench."),
      action("PlayerOne retreated Dreepy to the Bench.", ["- Basic Darkness Energy was discarded from PlayerOne's Dreepy.", "PlayerOne's Torchic is now in the Active Spot."]),
    ]),
    section("PlayerTwo", [
      action("PlayerTwo evolved Dreepy to Drakloak on the Bench."),
      action("PlayerTwo attached Basic Psychic Energy to Drakloak on the Bench."),
      action("PlayerTwo's Budew used Itchy Pollen on PlayerOne’s Torchic for 10 damage."),
    ]),
    section("PlayerOne", [
      action("PlayerOne attached Basic Fire Energy to Dreepy on the Bench."),
      action("PlayerOne evolved Dreepy to Drakloak on the Bench."),
      action("PlayerOne evolved Dreepy to Drakloak on the Bench."),
      action("PlayerOne played Torchic to the Bench."),
    ]),
    section("PlayerTwo", [
      action("PlayerTwo attached Basic Fire Energy to Drakloak on the Bench."),
      action("PlayerTwo evolved Drakloak to Dragapult ex on the Bench."),
      action("PlayerTwo retreated Budew to the Bench.", ["PlayerTwo's Dragapult ex is now in the Active Spot."]),
      action("PlayerTwo played Boss's Orders.", ["- PlayerOne's Drakloak was switched with PlayerOne's Torchic to become the Active Pokémon.", "PlayerOne's Drakloak is now in the Active Spot."]),
      action("PlayerTwo's Dragapult ex used Phantom Dive on PlayerOne’s Drakloak for 200 damage.", ["- PlayerTwo put 6 damage counters on PlayerTwo's Dreepy."]),
      action("PlayerOne's Drakloak was Knocked Out!", ["- 2 cards were discarded from PlayerOne's Drakloak.", "• Basic Fire Energy, Dreepy"]),
      action("PlayerOne's Dreepy was Knocked Out!"),
      action("PlayerTwo took 2 Prize cards.", ["A card was added to PlayerTwo's hand.", "A card was added to PlayerTwo's hand.", "PlayerOne's Torchic is now in the Active Spot."]),
    ]),
    section("PlayerOne", [
      action("PlayerOne played Lillie's Clefairy ex to the Bench."),
      action("PlayerOne retreated Torchic to the Bench.", ["- Basic Psychic Energy was discarded from PlayerOne's Torchic.", "PlayerOne's Lillie's Clefairy ex is now in the Active Spot."]),
    ]),
  ]);
  const attachmentDefinitions = [diver,
    syntheticCardDefinition({ name: "Dreepy", hp: 70, abilities: [], attacks: [] }),
    syntheticCardDefinition({ name: "Drakloak", hp: 90, abilities: [], attacks: [] }),
    syntheticCardDefinition({ name: "Torchic", hp: 70, abilities: [], attacks: [] }),
    syntheticCardDefinition({ name: "Fezandipiti ex", hp: 210, abilities: [], attacks: [] }),
    syntheticCardDefinition({ name: "Budew", hp: 30, abilities: [], attacks: [{ name: "Itchy Pollen", cost: [], damage: "10", text: "During your opponent's next turn, they can't play any Item cards from their hand." }] })];
  const evolvedAttachmentInput = { ...evolvedAttachmentSource,
    cardDefinitions: Object.fromEntries(attachmentDefinitions.map((definition) => [definition.name.toLowerCase(), resolveCardDefinition(buildCardDefinitionIndex(attachmentDefinitions), { name: definition.name })])),
    effectTags: { "PlayerOne played Buddy-Buddy Poffin.": "item", "PlayerTwo played Buddy-Buddy Poffin.": "item", "PlayerTwo played Boss's Orders.": "supporter" } as const };
  const evolvedAttachment = compileBattleReplay(evolvedAttachmentInput);
  const evolvedKoIndex = evolvedAttachment.events.findIndex((event) => event.sourceTitle === "PlayerOne's Drakloak was Knocked Out!");
  assert.equal(evolvedAttachment.events[evolvedKoIndex].label, "KO", "an exact source attachment stays eligible through evolution of only some possible holders");
  const evolvedDiscard = evolvedAttachment.frames[evolvedKoIndex + 1].self.discard;
  assert.ok(evolvedDiscard.some((card) => card.name === "Basic Fire Energy"));
  assert.equal(evolvedDiscard.find((card) => card.name === "Drakloak")?.physicalCardId, undefined, "a proven KO bundle must not invent the source evolution identity");
  assert.ok(evolvedDiscard.find((card) => card.name === "Dreepy")?.id.startsWith(`action-${evolvedKoIndex}-card-`), "an unidentified evolution layer receives a neutral departure identity");

  const paidRetreatIndex = evolvedAttachment.events.findIndex((event) => event.sourceTitle === "PlayerOne retreated Torchic to the Bench." && event.sourceDetails.some((detail) => detail.includes("Basic Psychic Energy")));
  const paidPromotionIndex = evolvedAttachment.events.findIndex((event) => event.sourceDetails.includes("PlayerOne's Torchic is now in the Active Spot.") && event.sourceTitle.includes("Prize"));
  assert.equal(evolvedAttachment.events[paidPromotionIndex].unresolved, undefined, "later retreat payment binds the earlier promotion to the same physical holder");
  assert.equal(evolvedAttachment.frames[paidPromotionIndex + 1].self.active?.damage, 10);
  assert.deepEqual(evolvedAttachment.frames[paidPromotionIndex + 1].self.active?.energy, ["Psychic"]);
  assert.deepEqual(evolvedAttachment.frames[paidRetreatIndex + 1].self.bench.filter((card) => card.name === "Torchic").map((card) => card.damage).sort((a, b) => a - b), [0, 10]);

  for (const abilities of [[{ name: "Borrowed Route", type: "Ability", text: "This Pokémon can use the attacks of your Benched Pokémon." }],
    [{ name: "Unknown Route", type: "Ability", text: null }]]) {
    const noBundle = structuredClone(directKoSource); noBundle.sections[0].actions[5].details = [];
    const candidate = syntheticCardDefinition({ ...ordinaryAttacker, abilities, attacks: [{ ...ordinaryAttacker.attacks[0], damage: "60", text: "" }] });
    const rejected = compileBattleReplay({ ...noBundle, cardDefinitions: { attacker: resolveCardDefinition(buildCardDefinitionIndex([candidate]), { name: "Attacker" }), twin: twinEvidence } });
    assert.ok(rejected.events[5].unresolved?.length, "an available or unknown copy route cannot be removed by seeding the attack name as native KO evidence");
  }
  const reflectiveTwin = syntheticCardDefinition({ name: "Twin", hp: null, abilities: [{ name: "Retaliation", type: "Ability", text: "If this Pokémon is Knocked Out by damage from an attack, put 6 damage counters on the attacking Pokémon." }] });
  const noBundle = structuredClone(directKoSource); noBundle.sections[0].actions[5].details = [];
  const reflectiveKo = compileBattleReplay({ ...noBundle, cardDefinitions: { attacker: directAttacker, twin: resolveCardDefinition(buildCardDefinitionIndex([reflectiveTwin]), { name: "Twin" }) } });
  assert.ok(reflectiveKo.events[5].unresolved?.length, "unmodelled retaliation context cannot establish the recipient-only KO route");

  // Direct domain states exercise inventory reconciliation independently of
  // which physical copy a recorded attachment ultimately received.
  const hpInventorySide = structuredClone(attackKo.frames[4].opponent);
  hpInventorySide.inPlayCount = 4;
  hpInventorySide.boardPools = [{ id: "guaranteed-energy", memberIds: hpInventorySide.bench.map((card) => card.id),
    cards: [{ id: "pooled-energy", name: "Basic Psychic Energy", imageUrl: "", boardRole: "energy" }] }];
  const hpInventoryCopies: CopyFact[] = [hpInventorySide.active!, ...hpInventorySide.bench].map((card) => ({ card: structuredClone(card), position: card.id === hpInventorySide.active!.id ? "active" : "bench" }));
  const retainedEnergy = resolveReplayKnockoutHpInventory(hpInventorySide, hpInventoryCopies, false)!;
  assert.deepEqual(retainedEnergy, hpInventorySide.boardPools, "a guaranteed but unassigned Basic Energy keeps its original possible-holder domain");
  const allocatedEnergy = structuredClone(hpInventoryCopies); allocatedEnergy[1].card.energy.push("Psychic");
  assert.deepEqual(resolveReplayKnockoutHpInventory(hpInventorySide, allocatedEnergy, false), [], "symbolically allocated pool inventory is not counted twice");
  const fabricatedComponent = structuredClone(allocatedEnergy); fabricatedComponent[1].card.energy[0] = "Fire";
  assert.equal(resolveReplayKnockoutHpInventory(hpInventorySide, fabricatedComponent, false), undefined, "a balanced quantity cannot conceal an unexplained component name");
  for (const component of [{ name: "Hero's Cape", boardRole: "tool" as const }, { name: "Double Turbo Energy", boardRole: "energy" as const }]) {
    const missingModifier = structuredClone(hpInventorySide); Object.assign(missingModifier.boardPools![0].cards[0], component);
    assert.equal(resolveReplayKnockoutHpInventory(missingModifier, hpInventoryCopies, false), undefined, "unallocated Tool or Special Energy cannot borrow Basic Energy inventory accounting");
  }
  const conditionalInventory = structuredClone(hpInventorySide);
  conditionalInventory.boardPools![0].uncertainCards = [{ cards: conditionalInventory.boardPools![0].cards, destinations: ["hand"] }];
  conditionalInventory.boardPools![0].cards = [];
  assert.equal(resolveReplayKnockoutHpInventory(conditionalInventory, hpInventoryCopies, false), undefined, "possibly departed inventory is not guaranteed in play");
  const missingHolder = structuredClone(hpInventorySide); missingHolder.boardPools![0].memberIds.push("unrepresented-top");
  assert.equal(resolveReplayKnockoutHpInventory(missingHolder, hpInventoryCopies, false), undefined, "every retained holder must exist in the symbolic board");

  // A unit-state sequence: departing an HP setter can make an older damaged
  // namesake lethal independently of the immediately preceding attack.
  const auraSource = source([section("PlayerOne", [
    action("PlayerOne played Attacker to the Active Spot."), action("PlayerTwo played Twin to the Bench."),
    action("PlayerTwo put 6 damage counters on PlayerTwo's Twin."), action("PlayerTwo played Twin to the Active Spot."),
    action("PlayerTwo played Setter to the Bench."), action("PlayerTwo put 2 damage counters on PlayerTwo's Setter."),
    action("PlayerOne's Attacker used Pollen on PlayerTwo's Twin for 60 damage."),
    action("PlayerTwo's Setter was Knocked Out."), action("PlayerTwo's Twin was Knocked Out."),
  ])]);
  const auraKo = compileBattleReplay({ ...auraSource, cardDefinitions: { attacker: directAttacker,
    twin: resolveCardDefinition(buildCardDefinitionIndex([syntheticCardDefinition({ name: "Twin", hp: 60 })]), { name: "Twin" }),
    setter: resolveCardDefinition(buildCardDefinitionIndex([syntheticCardDefinition({ name: "Setter", hp: 20,
      abilities: [{ name: "Shared Health", type: "Ability", text: "The maximum HP of each of your Twin in play is 100." }] })]), { name: "Setter" }) } });
  assert.equal(auraKo.frames[7].opponent.active?.damage, 60);
  assert.equal(auraKo.frames[7].opponent.bench.find((card) => card.name === "Twin")?.damage, 60);
  assert.ok(auraKo.frames[7].opponent.bench.every((card) => card.damageKnown !== false), "the old Bench damage is independently established before the attack");
  assert.ok(auraKo.events[8].unresolved?.length, "a departed HP-setting aura prevents attributing the later KO solely to the prior attack's recipient");

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
