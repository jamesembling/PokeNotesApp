import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyBattleLogActionTitle,
  getBattleLogActionTagLabel
} from "@/lib/battle-log/display";

test("classifyBattleLogActionTitle tags common English battle-log actions", () => {
  assert.equal(classifyBattleLogActionTitle("James drew 7 cards for the opening hand"), "draw");
  assert.equal(
    classifyBattleLogActionTitle("James drew Radiant Greninja and played it to the Bench"),
    "bench"
  );
  assert.equal(classifyBattleLogActionTitle("James evolved Drakloak to Dragapult ex"), "evolve");
  assert.equal(classifyBattleLogActionTitle("James used Concealed Cards."), "ability");
  assert.equal(classifyBattleLogActionTitle("James played a Supporter card."), "supporter");
  assert.equal(classifyBattleLogActionTitle("James played an Item card."), "item");
  assert.equal(
    classifyBattleLogActionTitle("James attached a Pokemon Tool to Dragapult ex."),
    "tool"
  );
  assert.equal(classifyBattleLogActionTitle("James played a Stadium card."), "stadium");
  assert.equal(classifyBattleLogActionTitle("Dragapult ex used Phantom Dive for 200 damage."), "attack");
  assert.equal(
    classifyBattleLogActionTitle("Dragapult ex used Shadow Bullet -> 180 damage to Gabite."),
    "attack"
  );
  assert.equal(
    classifyBattleLogActionTitle("Dragapult ex used Phantom Gate -> choose 1 attack from your opponent's Active Pokemon."),
    "attack"
  );
  assert.equal(classifyBattleLogActionTitle("James won the game."), "win");
  assert.equal(classifyBattleLogActionTitle("Cynthia lost the match."), "loss");
  assert.equal(classifyBattleLogActionTitle("Charmander was Knocked Out."), "ko");
});

test("classifyBattleLogActionTitle falls back to other when the signal is weak or absent", () => {
  assert.equal(classifyBattleLogActionTitle("James played Buddy-Buddy Poffin."), "other");
  assert.equal(classifyBattleLogActionTitle("Turn # 3 - James's Turn"), "other");
  assert.equal(classifyBattleLogActionTitle(""), "other");
});

test("classifyBattleLogActionTitle normalizes accents before matching conservative keywords", () => {
  assert.equal(
    classifyBattleLogActionTitle("James attached a Pokémon Tool to Dragapult ex."),
    "tool"
  );
});

test("getBattleLogActionTagLabel keeps recognized labels short and gives useful verb fallbacks", () => {
  assert.equal(getBattleLogActionTagLabel("James drew a card."), "Draw");
  assert.equal(getBattleLogActionTagLabel("James played Buddy-Buddy Poffin."), "Play");
  assert.equal(getBattleLogActionTagLabel("James attached Darkness Energy to Munkidori."), "Attach");
  assert.equal(getBattleLogActionTagLabel("James retreated to the Bench."), "Retreat");
  assert.equal(getBattleLogActionTagLabel("A quiet line without a clear action"), "Action");
});
