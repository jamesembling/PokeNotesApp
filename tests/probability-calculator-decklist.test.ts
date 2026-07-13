import assert from "node:assert/strict";
import test from "node:test";
import { analyzeDecklist } from "@/lib/probability-calculator/index";

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
