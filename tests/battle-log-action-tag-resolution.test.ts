import assert from "node:assert/strict";
import test from "node:test";
import { extractBattleLogActionCardCandidate } from "@/lib/battle-log/action-tags";
import {
  extractUsedEffectCandidate,
  resolveBattleLogEffectCatalogTagFromRows,
  resolveBattleLogEffectOriginFromRows,
  type CardEffectLookupRow
} from "@/lib/battle-log/effect-catalog";

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

test("card effect catalog resolves trainer tags from card name only", () => {
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
