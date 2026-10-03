import assert from "node:assert/strict";
import test from "node:test";
import { extractBattleLogActionCardCandidate } from "@/lib/battle-log/action-tags";
import {
  extractUsedEffectCandidate,
  resolveBattleLogEffectCatalogTagFromRows,
  resolveBattleLogEffectOriginFromRows,
  resolveBattleLogEffectCatalogEvidence,
  type CardEffectLookupRow
} from "@/lib/battle-log/effect-catalog";

import { buildCardDefinitionIndex, definitionEffectRows, resolveCardDefinition } from "@/lib/card-definition-catalog/resolve";
import { syntheticCardDefinition as definition } from "./fixtures/battle-replay-game";
import { loadCardDefinitions } from "@/lib/card-definition-catalog/server";
import { applyHistoricalEffectEnrichment, applyReviewedPrintingEffects, HISTORICAL_REVISION } from "@/lib/card-definition-catalog/enrichment.mjs";
import { normalizeTcgdexCard, isCardDefinition } from "@/lib/card-definition-catalog/source.mjs";

const rows: CardEffectLookupRow[] = [
  {
    card_name: "Boss's Orders",
    normalized_card_name: "boss's orders",
    effect_kind: "supporter",
    effect_name: null,
    normalized_effect_name: ""
  },
  {
    card_name: "Bravery Charm",
    normalized_card_name: "bravery charm",
    effect_kind: "tool",
    effect_name: null,
    normalized_effect_name: ""
  },
  {
    card_name: "Budew",
    normalized_card_name: "budew",
    effect_kind: "attack",
    effect_name: "Itchy Pollen",
    normalized_effect_name: "itchy pollen"
  },
  {
    card_name: "Radiant Greninja",
    normalized_card_name: "radiant greninja",
    effect_kind: "ability",
    effect_name: "Concealed Cards",
    normalized_effect_name: "concealed cards"
  },
  {
    card_name: "Dudunsparce",
    normalized_card_name: "dudunsparce",
    effect_kind: "ability",
    effect_name: "Run Away Draw",
    normalized_effect_name: "run away draw"
  }
];

test("extractBattleLogActionCardCandidate finds likely card names in played and attached lines", () => {
  assert.equal(
    extractBattleLogActionCardCandidate("Played Boss's Orders -> gusted Gabite into the Active Spot."),
    "Boss's Orders"
  );
  assert.equal(
    extractBattleLogActionCardCandidate("Johan attached Bravery Charm to Munkidori."),
    "Bravery Charm"
  );
  assert.equal(extractBattleLogActionCardCandidate("Johan benched Munkidori."), null);
  assert.equal(extractBattleLogActionCardCandidate("Johan played a card."), null);
});

test("extractUsedEffectCandidate requires both Pokemon and effect names", () => {
  assert.deepEqual(
    extractUsedEffectCandidate("iBerzrk_Network's Budew used Itchy Pollen on JammerUK1993's Budew for 10 damage."),
    {
      cardName: "budew",
      effectName: "itchy pollen"
    }
  );
  assert.equal(extractUsedEffectCandidate("JammerUK1993 drew a card."), null);
});

test("card effect catalog resolves trainer tags from card name only", async (t) => {
  assert.equal(
    resolveBattleLogEffectCatalogTagFromRows(
      "Played Boss's Orders -> gusted Gabite into the Active Spot.",
      rows
    ),
    "supporter"
  );
  assert.equal(
    resolveBattleLogEffectCatalogTagFromRows("Johan attached Bravery Charm to Munkidori.", rows),
    "tool"
  );
  const crispin = definition({ name: "Crispin", hp: null, category: "Trainer", trainerType: "Supporter", attacks: [],
    rules: ["Search your deck for up to 2 Basic Energy cards of different types and reveal them. Attach 1 of them to 1 of your Pokémon and put the other into your hand. Then, shuffle your deck."] });
  const normalized = normalizeTcgdexCard({ id: "synthetic-1", localId: "1", name: "Crispin", category: "Trainer", trainerType: "Supporter", image: "https://assets.tcgdex.net/en/sv/synthetic/1", effect: crispin.rules![0], set: { id: "synthetic" } }, { id: "synthetic", releaseDate: "2026-01-01" }, crispin.syncedAt);
  assert.deepEqual(normalized.rules, crispin.rules, "raw trainer text must survive source normalization");
  assert.equal(normalized.hp, null);
  assert.equal(normalized.imageUrl, "https://assets.tcgdex.net/en/sv/synthetic/1/high.webp");
  assert.equal(isCardDefinition(normalized), true);
  for (const localId of [0, 1, "001", "TG01"]) {
    const numericPrinting = normalizeTcgdexCard({ id: "synthetic-1", localId, name: "Crispin", category: "Trainer", set: { id: "synthetic" } }, { id: "synthetic" }, crispin.syncedAt);
    assert.equal(numericPrinting.localId, String(localId), "numeric collector numbers normalize without changing string identities");
    assert.equal(isCardDefinition(numericPrinting), true);
  }
  for (const localId of [null, {}, NaN, Infinity, -1, 1.5, ""]) {
    assert.throws(() => normalizeTcgdexCard({ id: "synthetic-1", localId, name: "Crispin", category: "Trainer", set: { id: "synthetic" } }, { id: "synthetic" }, crispin.syncedAt), /identity/);
  }
  const unsafeArtwork = normalizeTcgdexCard({ id: "synthetic-2", localId: "2", name: "Seedling", category: "Pokemon", set: { id: "synthetic" }, image: "https://untrusted.invalid/en/sv/synthetic/2" }, { id: "synthetic" }, crispin.syncedAt);
  assert.equal(unsafeArtwork.imageUrl, undefined);
  assert.equal(isCardDefinition({ ...normalized, imageUrl: "https://untrusted.invalid/card/high.webp" }), false);
  const unknownHp = normalizeTcgdexCard({ id: "synthetic-2", localId: "2", name: "Seedling", category: "Pokemon", set: { id: "synthetic" } }, { id: "synthetic" }, crispin.syncedAt);
  assert.equal(unknownHp.hp, null);
  assert.equal(unknownHp.rules, null, "missing rule boxes must remain unknown");
  assert.throws(() => normalizeTcgdexCard({ id: "synthetic-1", localId: "1", name: "Seedling", category: "Pokemon", set: { id: "other" } }, { id: "synthetic" }, crispin.syncedAt), /identity/);
  const incompletePrinting = definition({ attacks: [], abilities: [] });
  const secondarySet = { id: "synthetic", name: "Synthetic set", releaseDate: "2026/01/01" };
  const secondaryPrinting = { id: "synthetic-1", number: "1", name: "Seedling", supertype: "Pokémon", subtypes: ["Basic"], hp: "70", attacks: [{ name: "Tap", text: "", damage: "10", cost: ["Grass"] }] };
  const enrichedPrinting = applyHistoricalEffectEnrichment(incompletePrinting, secondaryPrinting, secondarySet);
  assert.deepEqual(enrichedPrinting.attacks, secondaryPrinting.attacks);
  assert.deepEqual(enrichedPrinting.abilities, []);
  assert.equal(enrichedPrinting.hp, incompletePrinting.hp);
  assert.equal(enrichedPrinting.effectProvenance?.revision, HISTORICAL_REVISION);
  assert.deepEqual(enrichedPrinting.effectProvenance?.fields, ["abilities", "attacks"]);
  assert.equal(incompletePrinting.attacks.length, 0, "enrichment cannot mutate the primary source record");
  const missingStageEnrichment = applyHistoricalEffectEnrichment({ ...incompletePrinting, stage: null }, secondaryPrinting, secondarySet);
  assert.deepEqual(missingStageEnrichment.attacks, secondaryPrinting.attacks);
  assert.equal(missingStageEnrichment.stage, null, "effects-only enrichment cannot invent missing stage evidence");
  assert.equal(applyHistoricalEffectEnrichment(definition(), secondaryPrinting, secondarySet).effectProvenance, undefined, "complete primary effects do not need replacement");
  for (const mismatch of [{ hp: "90" }, { name: "Seedling ex" }, { number: "2" }, { id: "different-1" }, { supertype: "Trainer" }, { subtypes: ["Stage 1"] }]) {
    assert.equal(applyHistoricalEffectEnrichment(incompletePrinting, { ...secondaryPrinting, ...mismatch }, secondarySet), incompletePrinting, "secondary facts require exact printing identity agreement");
  }
  assert.equal(applyHistoricalEffectEnrichment(incompletePrinting, secondaryPrinting, { ...secondarySet, id: "different" }), incompletePrinting);
  assert.equal(applyHistoricalEffectEnrichment(incompletePrinting, secondaryPrinting, { ...secondarySet, releaseDate: "2026/02/01" }), incompletePrinting, "known conflicting set dates refuse enrichment");
  assert.equal(applyHistoricalEffectEnrichment(incompletePrinting, undefined, secondarySet), incompletePrinting);
  const partiallyKnownPrinting = definition({ attacks: [{ name: "Tap", text: "", damage: "10", cost: ["Grass"] }], abilities: [{ name: "", type: "Ability", text: null }] });
  for (const mismatch of [{ damage: "20" }, { cost: ["Fire"] }, { text: "Draw a card." }]) {
    assert.equal(applyHistoricalEffectEnrichment(partiallyKnownPrinting, { ...secondaryPrinting, attacks: [{ ...secondaryPrinting.attacks[0], ...mismatch }] }, secondarySet), partiallyKnownPrinting, "secondary enrichment cannot overwrite conflicting known attack facts");
  }
  const knownAbilityType = definition({ attacks: [], abilities: [{ name: "Strength", type: "Poke-BODY", text: null }] });
  assert.equal(applyHistoricalEffectEnrichment(knownAbilityType, { ...secondaryPrinting, abilities: [{ name: "Strength", type: "Ability", text: "Draw a card." }] }, secondarySet), knownAbilityType, "historical effect types are not interchangeable");
  const reviewedSolrock = definition({ sourceCardId: "tk-xy-latio-12", setId: "tk-xy-latio", localId: "12", name: "Solrock", hp: 80, attacks: [], abilities: [] });
  assert.deepEqual(applyReviewedPrintingEffects(reviewedSolrock).attacks.map((attack) => attack.name), ["Solar Generator", "Knock Away"]);
  assert.equal(applyReviewedPrintingEffects(reviewedSolrock).effectProvenance?.provider, "reviewed-printing");
  assert.equal(applyReviewedPrintingEffects({ ...reviewedSolrock, hp: 90 }).effectProvenance, undefined, "reviewed overlays also require their exact verified identity facts");
  const projected = definitionEffectRows([normalized]);
  assert.deepEqual(projected.map((row) => row.effect_kind), ["supporter"]);
  assert.equal(projected[0].effect_text, crispin.rules?.[0], "trainer rules must survive the full-definition compatibility boundary");
  assert.equal(resolveBattleLogEffectOriginFromRows("PlayerOne played Crispin.", projected), "deck");
  assert.equal(resolveBattleLogEffectOriginFromRows("PlayerOne played Crispin.", definitionEffectRows([{ ...crispin, rules: null }])), null);

  const priorUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const priorKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://synthetic.invalid";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "synthetic-public-key";
  try {
    let failingFamily: "trainer" | "effect" = "trainer";
    let definitionScenario = "";
    let definitionRequests = 0;
    let now = Date.now();
    t.mock.method(Date, "now", () => now);
    const response = (data: unknown, count?: number) => new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json", ...(count === undefined ? {} : { "Content-Range": `0-0/${count}` }) } });
    t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (definitionScenario) {
        const generationId = `synthetic-${definitionScenario}`;
        if (url.pathname.endsWith("card_definition_active")) return response(definitionScenario === "unavailable" ? null : { generation_id: generationId, generation: { id: generationId, completed_at: new Date(now - (definitionScenario === "stale" ? 15 * 86400000 : 1000)).toISOString(), source_coverage: { scope: "tcgdex-listed-en-physical", listedPrintings: 501, unlistedSets: [] } } });
        assert.ok(url.pathname.endsWith("card_definition_catalog"));
        definitionRequests++;
        if (definitionScenario === "capped") return response([{ definition: definition() }], 2);
        if (definitionScenario === "malformed") return response([{ definition: { name: "Seedling", hp: 70 } }], 1);
        const offset = Number(url.searchParams.get("offset") ?? 0);
        return response(Array.from({ length: offset === 0 ? 500 : 1 }, (_, index) => ({ definition: definition({ sourceCardId: `synthetic-${offset + index}`, localId: String(offset + index) }) })), 501);
      }
      const effect = url.searchParams.get("effect_kind")?.includes("ability");
      if ((effect ? "effect" : "trainer") === failingFamily) throw new DOMException("Synthetic provider deadline", "AbortError");
      const data = effect ? [rows[3]] : [rows[0]];
      return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json", "Content-Range": "0-0/1" } });
    });
    const titles = ["PlayerOne's Radiant Greninja used Concealed Cards.", "PlayerOne played Boss's Orders."];
    const trainerTimeout = await resolveBattleLogEffectCatalogEvidence(titles);
    assert.equal(trainerTimeout.tags.get(titles[0]), "ability", "a failed trainer lookup cannot erase a complete Pokémon effect response");
    assert.equal(trainerTimeout.tags.has(titles[1]), false);
    failingFamily = "effect";
    const effectTimeout = await resolveBattleLogEffectCatalogEvidence(titles);
    assert.equal(effectTimeout.tags.get(titles[1]), "supporter", "a failed Pokémon lookup cannot erase a complete trainer response");
    assert.equal(effectTimeout.tags.has(titles[0]), false);
    definitionScenario = "complete";
    const paginated = await loadCardDefinitions(["Seedling", "seedling"]);
    assert.equal(paginated.seedling.coverage, "complete");
    assert.equal(paginated.seedling.candidates.length, 501, "all candidate pages must be considered before agreeing HP");
    assert.equal(paginated.seedling.hp, 70);
    assert.equal(definitionRequests, 2);
    const cached = await loadCardDefinitions(["Seedling"]);
    assert.equal(cached.seedling.hp, 70);
    assert.equal(definitionRequests, 2, "a complete generation/name lookup can reuse its cache");
    for (const scenario of ["capped", "malformed", "stale", "unavailable"]) {
      now += 6 * 60 * 1000; // Expire both generation and name caches between independent provider states.
      definitionScenario = scenario;
      const unavailable = await loadCardDefinitions(["Seedling"]);
      assert.equal(unavailable.seedling.hp, null, `${scenario} provider data cannot establish HP`);
      assert.equal(unavailable.seedling.definition, null);
      assert.equal(unavailable.seedling.coverage, scenario === "capped" || scenario === "malformed" ? "incomplete" : scenario);
    }
  } finally {
    t.mock.restoreAll();
    if (priorUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = priorUrl;
    if (priorKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = priorKey;
  }
});

test("card effect catalog resolves attacks and abilities only when Pokemon and effect match", () => {
  assert.equal(
    resolveBattleLogEffectCatalogTagFromRows(
      "iBerzrk_Network's Budew used Itchy Pollen on JammerUK1993's Budew for 10 damage.",
      rows
    ),
    "attack"
  );
  assert.equal(
    resolveBattleLogEffectCatalogTagFromRows("Radiant Greninja used Concealed Cards.", rows),
    "ability"
  );
  assert.equal(
    resolveBattleLogEffectCatalogTagFromRows("Dudunsparce used Run Away Draw.", rows),
    "ability"
  );
});

test("card effect catalog refuses ambiguous or partial effect matches", () => {
  const first = definition();
  const reprint = definition({ sourceCardId: "synthetic-2", localId: "2" });
  const agreed = resolveCardDefinition(buildCardDefinitionIndex([first, reprint]), { name: "Seedling" });
  assert.equal(agreed.hp, 70);
  assert.equal(agreed.resolution, "functional_agreement");
  assert.equal(agreed.candidates.length, 2);
  const differentAttack = { ...reprint, attacks: [{ name: "Wave", text: null, damage: "20", cost: ["Grass"] }] };
  const ambiguous = buildCardDefinitionIndex([first, differentAttack]);
  assert.equal(resolveCardDefinition(ambiguous, { name: "Seedling" }).hp, 70, "agreed printed HP is independent of other differing rules");
  assert.equal(resolveCardDefinition(ambiguous, { name: "Seedling" }).definition, null, "different attacks cannot become an agreed full definition");
  const conflict = buildCardDefinitionIndex([first, { ...reprint, hp: 90 }]);
  assert.equal(resolveCardDefinition(conflict, { name: "Seedling" }).hp, null);
  assert.equal(resolveCardDefinition(buildCardDefinitionIndex([first, { ...reprint, hp: null }]), { name: "Seedling" }).hp, null);
  const exact = resolveCardDefinition(conflict, { name: "Seedling", setId: "synthetic", localId: "001" });
  assert.equal(exact.hp, 70);
  assert.equal(exact.resolution, "exact");
  const effectMatched = resolveCardDefinition(buildCardDefinitionIndex([first, { ...differentAttack, hp: 90 }]), { name: "Seedling", effectNames: ["Tap"] });
  assert.equal(effectMatched.hp, 70, "a recorded effect can exclude a conflicting printing");
  const incompleteEffect = { ...differentAttack, hp: 90, attacks: [{ name: "", text: null, damage: null, cost: null }] };
  assert.equal(resolveCardDefinition(buildCardDefinitionIndex([first, incompleteEffect]), { name: "Seedling", effectNames: ["Tap"] }).hp, null, "a printing with missing effect identity cannot be excluded by an observed attack");

  assert.equal(resolveCardDefinition(buildCardDefinitionIndex([first]), { name: "Seedling ex" }).hp, null, "base and ex names are different identities");
  for (const coverage of ["incomplete", "stale", "unavailable"] as const) {
    const withheld = resolveCardDefinition(buildCardDefinitionIndex([first]), { name: "Seedling", setId: "synthetic", localId: "1" }, coverage);
    assert.equal(withheld.hp, null, `${coverage} coverage cannot establish HP`);
    assert.equal(withheld.definition, null);
  }

  const shuffleDetail = "- PlayerTwo shuffled 5 cards into their deck.";
  const judgeRules = definitionEffectRows([definition({ name: "Judge", hp: null, category: "Trainer", trainerType: "Supporter", attacks: [], rules: ["Each player shuffles their hand into their deck and draws 4 cards."] })]);
  assert.equal(resolveBattleLogEffectOriginFromRows("PlayerOne played Judge.", judgeRules, shuffleDetail), "hand");
  const oldJudge = { ...judgeRules[0], effect_text: "Each player shuffles his or her hand into his or her deck and draws 4 cards." };
  assert.equal(resolveBattleLogEffectOriginFromRows("PlayerOne played Judge.", [...judgeRules, oldJudge], shuffleDetail), "hand", "equivalent legacy printing pronouns cannot discard the shared hand origin");

  const ionoRules = definitionEffectRows([definition({ name: "Iono", hp: null, category: "Trainer", trainerType: "Supporter", attacks: [], rules: ["Each player shuffles their hand and puts it on the bottom of their deck. Then, each player draws a card for each of their remaining Prize cards."] })]);
  assert.equal(resolveBattleLogEffectOriginFromRows("PlayerOne played Iono.", ionoRules, shuffleDetail), "hand");
  const opponentShuffle = definitionEffectRows([definition({ name: "Hand Reset", hp: null, category: "Trainer", trainerType: "Item", attacks: [], rules: ["Your opponent shuffles their hand into their deck. Then, they draw 4 cards."] })]);
  assert.equal(resolveBattleLogEffectOriginFromRows("PlayerOne played Hand Reset.", opponentShuffle, shuffleDetail), "hand");
  const metalMaker = definitionEffectRows([definition({ name: "Metang", abilities: [{ name: "Metal Maker", type: "Ability", text: "Once during your turn, you may look at the top 4 cards of your deck and attach any number of Basic {M} Energy cards you find there to your Pokémon in any way you like. Shuffle the other cards and put them on the bottom of your deck." }] })]);
  assert.equal(resolveBattleLogEffectOriginFromRows("PlayerOne's Metang used Metal Maker.", metalMaker, "- PlayerOne attached Basic Metal Energy to Seedling in the Active Spot."), "deck", "the top-deck attachment clause establishes its source without the phrase from your deck");
  const mixedOrigins = definitionEffectRows([definition({ abilities: [{ name: "Gather", type: "Ability", text: "Discard a card from your hand. Attach a Basic Energy card from your discard pile to 1 of your Pokémon." }] })]);
  const mixedTitle = "PlayerOne's Seedling used Gather.";
  assert.equal(resolveBattleLogEffectOriginFromRows(mixedTitle, mixedOrigins), null, "a whole effect containing different source zones has no single origin");
  assert.equal(resolveBattleLogEffectOriginFromRows(mixedTitle, mixedOrigins, "- PlayerOne attached Basic Grass Energy to Seedling in the Active Spot."), "discard", "attachment evidence uses its clause rather than the separate hand cost");

  const recoveryDefinition = definition({ abilities: [{ name: "Recover", type: "Ability", text: "Attach a Basic Energy card from your discard pile to 1 of your Pokémon." }] });
  const recoveryTitle = "PlayerOne's Seedling used Recover.";
  assert.equal(resolveBattleLogEffectOriginFromRows(recoveryTitle, definitionEffectRows([recoveryDefinition])), "discard");
  for (const unknownEffectDefinition of [definition({ sourceCardId: "unknown-empty", attacks: [], abilities: [] }), definition({ sourceCardId: "unknown-unnamed", attacks: [], abilities: [{ name: "", type: "Ability", text: null }] })]) {
    const partialProjection = definitionEffectRows([recoveryDefinition, unknownEffectDefinition]);
    assert.equal(resolveBattleLogEffectCatalogTagFromRows(recoveryTitle, partialProjection), null, "missing candidate effect identity survives compatibility projection");
    assert.equal(resolveBattleLogEffectOriginFromRows(recoveryTitle, partialProjection, "PlayerOne attached Basic Grass Energy to Seedling in the Active Spot."), null, "known text from another printing cannot hide a viable candidate's missing effect");
  }

  for (const trainerType of [null, "Legacy Trainer"]) {
    const trainerCandidates = definitionEffectRows([definition({ name: "Recovery Item", category: "Trainer", trainerType: "Item", hp: null, attacks: [], rules: ["Put a Pokémon from your discard pile into your hand."] }), definition({ name: "Recovery Item", category: "Trainer", trainerType, hp: null, attacks: [], rules: null })]);
    assert.equal(resolveBattleLogEffectCatalogTagFromRows("PlayerOne played Recovery Item.", trainerCandidates), null, "unknown Trainer subtypes cannot disappear from candidate agreement");
    assert.equal(resolveBattleLogEffectOriginFromRows("PlayerOne played Recovery Item.", trainerCandidates), null);
  }

  const title = "FixturePlayer's Radiant Greninja used Concealed Cards.";
  const hand = { ...rows[3], effect_text: "Choose an Energy card from your hand." };
  const deck = { ...rows[3], effect_text: "Choose an Energy card from your deck." };
  const discard = { ...rows[3], effect_text: "Choose an Energy card from your discard pile." };
  assert.equal(resolveBattleLogEffectOriginFromRows(title, [hand]), "hand");
  assert.equal(resolveBattleLogEffectOriginFromRows(title, [deck]), "deck");
  assert.equal(resolveBattleLogEffectOriginFromRows(title, [discard, { ...discard }]), "discard");
  assert.equal(resolveBattleLogEffectOriginFromRows(title, [rows[3]]), null, "absent card text cannot invent an origin");
  assert.equal(resolveBattleLogEffectOriginFromRows(title, [hand, discard]), null, "all matching printings must agree");
  assert.equal(resolveBattleLogEffectOriginFromRows(title, [hand, rows[3]]), null, "one missing printing text makes the origin ambiguous");
  assert.equal(resolveBattleLogEffectOriginFromRows(title, [{ ...hand, effect_text: "Choose a card from your hand or from your discard pile." }]), null);
  assert.equal(resolveBattleLogEffectOriginFromRows(title, [{ ...hand, effect_kind: "attack" }, hand]), null);
  assert.equal(resolveBattleLogEffectOriginFromRows("Budew used Concealed Cards.", [hand]), null);
  assert.equal(resolveBattleLogEffectOriginFromRows("Radiant Greninja used Itchy Pollen.", [hand]), null);
  assert.equal(resolveBattleLogEffectOriginFromRows("PlayerOne played Boss's Orders.", [{ ...rows[0], effect_text: "Put a card from your discard pile into your hand." }]), "discard");

  assert.equal(resolveBattleLogEffectCatalogTagFromRows("Budew used Concealed Cards.", rows), null);
  assert.equal(resolveBattleLogEffectCatalogTagFromRows("Radiant Greninja used Itchy Pollen.", rows), null);
  assert.equal(resolveBattleLogEffectCatalogTagFromRows("Budew used a move.", rows), null);
  assert.equal(
    resolveBattleLogEffectCatalogTagFromRows("Budew used Itchy Pollen.", [
      ...rows,
      {
        card_name: "Budew",
        normalized_card_name: "budew",
        effect_kind: "ability",
        effect_name: "Itchy Pollen",
        normalized_effect_name: "itchy pollen"
      }
    ]),
    null
  );
});
