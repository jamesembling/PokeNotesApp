import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeDecklist,
  probabilityCardInPlayableOpeningHand
} from "@/lib/probability-calculator/index";

const DECKLIST_WITH_TOTAL_FOOTER = `Pokémon: 12
2 Munkidori SFA 72
1 Pecharunt ex PRE 163
1 Fezandipiti ex ASC 288
2 Seviper PFL 62
1 Meowth ex POR 121
2 Toxtricity PFL 103
1 Mega Scrafty ex ASC 285
1 Mega Scrafty ex ASC 270
2 Toxel PFL 67
1 Yveltal MEG 88
1 Scraggy WHT 57
2 Scraggy WHT 57

Trainer: 22
1 Judge DRI 222
2 Ultra Ball ASC 264
3 Buddy-Buddy Poffin MEG 167
1 Risky Ruins MEG 127
4 Lillie's Determination MEG 184
1 Hyper Aroma TWM 152
1 Binding Mochi PRE 95
1 Energy Recycler POR 108
2 Jumbo Ice Cream CRI 109
2 Punk Helmet PFL 121
1 Team Rocket's Watchtower ASC 210
1 Boss's Orders PAL 265
1 Mega Signal MEG 171
1 Janine's Secret Art PRE 173
1 Janine's Secret Art PRE 112
1 Night Stretcher MEG 173
1 Tool Scrapper CRI 115
1 Special Red Card CRI 113
1 Xerosic's Machinations SFA 89
1 Team Rocket's Petrel DRI 226
2 Team Rocket's Petrel ASC 207
1 Air Balloon SSH 213

Energy: 4
3 Basic {D} Energy BUS 168
4 Basic {D} Energy SFA 98
2 Basic {D} Energy MEE 7
3 Spiky Energy JTG 159

Total Cards: 60`;

test("ignores a Total Cards footer when validating a decklist", () => {
  const analysis = analyzeDecklist(DECKLIST_WITH_TOTAL_FOOTER);

  assert.deepEqual(analysis.totals, {
    Pokemon: 17,
    Trainer: 31,
    Energy: 12,
    deck: 60
  });
  assert.deepEqual(analysis.warnings, []);
});

test("Basic-card setup probability conditions exactly on a playable opening hand", () => {
  const probability = probabilityCardInPlayableOpeningHand(4, 4, 8);
  const expected = probabilityAtLeastOne(4) / probabilityAtLeastOne(8);

  assert.ok(Math.abs(probability - expected) < 1e-12);
});

test("evolution-card setup probability uses the joint target-and-Basic event", () => {
  const probability = probabilityCardInPlayableOpeningHand(4, 0, 8);
  const expected =
    (1 - probabilityNone(4) - probabilityNone(8) + probabilityNone(12)) /
    probabilityAtLeastOne(8);

  assert.ok(Math.abs(probability - expected) < 1e-12);
  assert.ok(probability < probabilityAtLeastOne(4) / probabilityAtLeastOne(8));
});

test("deck analysis applies playable-hand conditioning to Basic and evolution rows", () => {
  const analysis = analyzeDecklist(`Pokemon: 12
4 Pikachu MEW 25
4 Charmander MEW 4
4 Raichu MEW 26

Trainer: 48
48 Judge SVI 176`);
  const pikachu = analysis.setupRows.find((row) => row.card.name === "Pikachu");
  const raichu = analysis.setupRows.find((row) => row.card.name === "Raichu");

  assert.equal(analysis.basicPokemonCount, 8);
  assert.ok(pikachu);
  assert.ok(raichu);
  assert.ok(
    Math.abs(
      pikachu.inStartingSeven - probabilityCardInPlayableOpeningHand(4, 4, 8)
    ) < 1e-12
  );
  assert.ok(
    Math.abs(
      raichu.inStartingSeven - probabilityCardInPlayableOpeningHand(4, 0, 8)
    ) < 1e-12
  );
});

test("deck analysis reports zero setup probability for evolution-only Pokemon", () => {
  const analysis = analyzeDecklist(`Pokemon: 4
4 Raichu MEW 26

Trainer: 56
56 Judge SVI 176`);

  assert.equal(analysis.basicPokemonCount, 0);
  assert.equal(analysis.setupRows[0]?.inStartingSeven, 0);
  assert.equal(probabilityCardInPlayableOpeningHand(4, 0, 0), 0);
});

function choose(n: number, k: number) {
  let result = 1;
  for (let index = 1; index <= k; index += 1) {
    result *= (n - k + index) / index;
  }
  return result;
}

function probabilityNone(copies: number) {
  return choose(60 - copies, 7) / choose(60, 7);
}

function probabilityAtLeastOne(copies: number) {
  return 1 - probabilityNone(copies);
}
