import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyBattleLogActionTitle,
  formatBattleLogActionDetail,
  formatBattleLogActionTitle,
  getBattleLogDisplayActionDetails,
  getBattleLogDisplayActionTitle,
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

test("getBattleLogActionTagLabel keeps recognized labels short and gives useful fallbacks", () => {
  assert.equal(getBattleLogActionTagLabel("James drew a card."), "Draw");
  assert.equal(getBattleLogActionTagLabel("James played Buddy-Buddy Poffin."), "Play");
  assert.equal(getBattleLogActionTagLabel("James attached Darkness Energy to Munkidori."), "Attach");
  assert.equal(getBattleLogActionTagLabel("James retreated to the Bench."), "Retreat");
  assert.equal(getBattleLogActionTagLabel("A quiet line without a clear action"), "Action");
});

test("formatBattleLogActionTitle uses subject-first wording for common board actions", () => {
  assert.equal(
    formatBattleLogActionTitle("JammerUK1993 played Froakie to the Active Spot."),
    "Froakie played to Active spot"
  );
  assert.equal(
    formatBattleLogActionTitle("James drew Radiant Greninja and played it to the Bench."),
    "Radiant Greninja played to Bench"
  );
  assert.equal(
    formatBattleLogActionTitle("James attached Darkness Energy to Munkidori."),
    "Darkness Energy attached to Munkidori"
  );
  assert.equal(
    formatBattleLogActionTitle("James attached Darkness Energy to Munkidori in the Active Spot."),
    "Darkness Energy attached to Munkidori in the Active"
  );
  assert.equal(
    formatBattleLogActionTitle("James attached Darkness Energy to Munkidori on the Bench."),
    "Darkness Energy attached to Munkidori on the Bench"
  );
  assert.equal(
    formatBattleLogActionTitle("James evolved Drakloak to Dragapult ex."),
    "Drakloak evolved into Dragapult ex"
  );
  assert.equal(
    formatBattleLogActionTitle("James evolved Froakie to Frogadier on the Bench."),
    "Froakie evolved into Frogadier on the Bench"
  );
  assert.equal(formatBattleLogActionTitle("JammerUK1993 drew Froakie."), "Drew Froakie");
  assert.equal(formatBattleLogActionTitle("iBerzrk_Network drew a card."), "Drew a card");
  assert.equal(formatBattleLogActionTitle("JammerUK1993 played Buddy-Buddy Poffin."), "Played Buddy-Buddy Poffin");
  assert.equal(
    formatBattleLogActionTitle("Radiant Greninja used Concealed Cards.", {
      actionTag: "ability"
    }),
    "Radiant Greninja used Concealed Cards"
  );
  assert.equal(
    formatBattleLogActionTitle("iBerzrk_Network's Drakloak used Recon Directive.", {
      actionTag: "ability"
    }),
    "Drakloak used Recon Directive"
  );
  assert.equal(
    classifyBattleLogActionTitle("Dudunsparce's Run Away Draw was activated."),
    "ability"
  );
  assert.equal(
    formatBattleLogActionTitle("Dudunsparce's Run Away Draw was activated."),
    "Dudunsparce used Run Away Draw"
  );
  assert.equal(
    formatBattleLogActionTitle("JammerUK1993's Greninja ex used Mirage Barrage.", {
      actionTag: "attack"
    }),
    "Greninja ex used Mirage Barrage"
  );
  assert.equal(
    formatBattleLogActionTitle("JammerUK1993's Greninja ex used Mirage Barrage on iBerzrk_Network's Active for 120 damage.", {
      actionTag: "attack"
    }),
    "Greninja ex used Mirage Barrage on Active for 120 damage"
  );
  assert.equal(
    formatBattleLogActionTitle("iBerzrk_Network’s Budew used Itchy Pollen on JammerUK1993’s Budew for 10 damage.", {
      actionTag: "attack"
    }),
    "Budew used Itchy Pollen on Budew for 10 damage"
  );
  assert.equal(
    formatBattleLogActionTitle("Dragapult ex used Phantom Dive for 200 damage.", {
      actionTag: "attack"
    }),
    "Dragapult ex used Phantom Dive for 200 damage"
  );
  assert.equal(
    formatBattleLogActionTitle("JammerUK1993 played Buddy-Buddy Poffin.", {
      actionTag: "item"
    }),
    "Played Buddy-Buddy Poffin"
  );
  assert.equal(
    formatBattleLogActionTitle("JammerUK1993 retreated Budew to Bench."),
    "Budew retreated to Bench"
  );
  assert.equal(
    formatBattleLogActionTitle("JammerUK1993 retreated to Bench."),
    "Retreated to Bench"
  );
  assert.equal(formatBattleLogActionTitle("JammerUK1993 ended their turn."), "Ended turn");
});

test("display action helpers fold retreat promotion details into the title", () => {
  const details = [
    "Basic Fighting Energy was discarded from _ndz's Cynthia's Roserade.",
    "_ndz's Cynthia's Gabite is now in the Active spot."
  ];
  const displayTitle = getBattleLogDisplayActionTitle(
    "_ndz retreated Cynthia's Roserade to Bench.",
    details
  );

  assert.equal(
    displayTitle,
    "_ndz retreated Cynthia's Roserade to Bench -> Cynthia's Gabite is now in the Active spot"
  );
  assert.equal(
    formatBattleLogActionTitle(displayTitle),
    "Cynthia's Roserade retreated to Bench -> Cynthia's Gabite is now in the Active spot"
  );
  assert.deepEqual(
    getBattleLogDisplayActionDetails("_ndz retreated Cynthia's Roserade to Bench.", details),
    ["Basic Fighting Energy was discarded from _ndz's Cynthia's Roserade."]
  );
});

test("display action helpers fold multi-target attack damage into the title", () => {
  const title = "JammerUK1993's Greninja ex used Mirage Barrage on iBerzrk_Network's Active for 120 damage.";
  const details = [
    "- iBerzrk_Network's Benched Pokemon took 120 damage.",
    "Ignition Energy was discarded from JammerUK1993's Greninja ex."
  ];
  const displayTitle = getBattleLogDisplayActionTitle(title, details);

  assert.equal(
    displayTitle,
    "JammerUK1993's Greninja ex used Mirage Barrage on iBerzrk_Network's Active for 120 damage & Benched Pokemon for 120 damage"
  );
  assert.equal(
    formatBattleLogActionTitle(displayTitle, { actionTag: "attack" }),
    "Greninja ex used Mirage Barrage on Active for 120 damage & Benched Pokemon for 120 damage"
  );
  assert.deepEqual(
    getBattleLogDisplayActionDetails(title, details),
    ["Ignition Energy was discarded from JammerUK1993's Greninja ex."]
  );
});

test("display action helpers fold detail-only spread attack damage into the title", () => {
  const title = "JammerUK1993's Greninja ex used Mirage Barrage.";
  const details = [
    "- iBerzrk_Network's Cynthia's Gabite took 120 damage.",
    "- iBerzrk_Network's Cynthia's Roserade took 120 damage."
  ];
  const displayTitle = getBattleLogDisplayActionTitle(title, details);

  assert.equal(
    displayTitle,
    "JammerUK1993's Greninja ex used Mirage Barrage on Cynthia's Gabite for 120 damage & Cynthia's Roserade for 120 damage"
  );
  assert.equal(
    formatBattleLogActionTitle(displayTitle, { actionTag: "attack" }),
    "Greninja ex used Mirage Barrage on Cynthia's Gabite for 120 damage & Cynthia's Roserade for 120 damage"
  );
  assert.deepEqual(getBattleLogDisplayActionDetails(title, details), []);
});

test("display action helpers fold Boss's Orders switch details into the title", () => {
  const title = "JammerUK1993 played Boss's Orders.";
  const details = [
    "- Cynthia's Roselia was switched with _ndz's Cynthia's Gible to become the Active Pokémon",
    "Cynthia's Roselia is now in the Active spot"
  ];
  const displayTitle = getBattleLogDisplayActionTitle(title, details);

  assert.equal(
    displayTitle,
    "JammerUK1993 played Boss's Orders - Active Cynthia's Gible was switched with Benched Cynthia's Roselia"
  );
  assert.equal(
    formatBattleLogActionTitle(displayTitle, { actionTag: "supporter" }),
    "Played Boss's Orders - Active Cynthia's Gible was switched with Benched Cynthia's Roselia"
  );
  assert.deepEqual(getBattleLogDisplayActionDetails(title, details), []);
});

test("formatBattleLogActionTitle can retain actors for setup actions", () => {
  assert.equal(
    formatBattleLogActionTitle("JammerUK1993 played Froakie to the Active Spot.", {
      retainActor: true
    }),
    "JammerUK1993: Froakie played to Active spot"
  );
  assert.equal(
    formatBattleLogActionTitle("JammerUK1993 played Buddy-Buddy Poffin.", {
      actionTag: "item",
      retainActor: true
    }),
    "JammerUK1993: Played Buddy-Buddy Poffin"
  );
});

test("formatBattleLogActionDetail strips player names from attack details", () => {
  assert.equal(
    formatBattleLogActionDetail("iBerzrk_Network's Active Pokemon took 120 damage.", {
      actionTag: "attack"
    }),
    "Active Pokemon took 120 damage"
  );
  assert.equal(
    formatBattleLogActionDetail("- Opponent's Benched Pokemon took 120 damage.", {
      actionTag: "attack"
    }),
    "- Benched Pokemon took 120 damage"
  );
  assert.equal(
    formatBattleLogActionDetail("_ndz's Cynthia's Gabite took 120 damage.", {
      actionTag: "attack"
    }),
    "Cynthia's Gabite took 120 damage"
  );
});

test("formatBattleLogActionDetail strips leading player names without removing owned Pokemon names", () => {
  assert.equal(
    formatBattleLogActionDetail("_ndz's Cynthia's Gabite is now in the Active spot.", {
      actionTag: "other"
    }),
    "Cynthia's Gabite is now in the Active spot"
  );
  assert.equal(
    formatBattleLogActionDetail("- _ndz's Cynthia's Roserade moved to the Bench.", {
      actionTag: "other"
    }),
    "- Cynthia's Roserade moved to Bench"
  );
});

test("display action helpers promote Dudunsparce Run Away Draw effect groups", () => {
  const details = [
    "- JammerUK1993 drew 3 cards",
    "- Rare Candy, Surfing Beach, Greninja ex",
    "- JammerUK1993 shuffled 2 cards into their deck",
    "- Dudunsparce, Dunsparce"
  ];

  assert.equal(
    getBattleLogDisplayActionTitle("JammerUK1993 played Dudunsparce.", details),
    "Dudunsparce's Run Away Draw was activated."
  );
  assert.deepEqual(
    getBattleLogDisplayActionDetails("JammerUK1993 played Dudunsparce.", details),
    details
  );
  assert.equal(
    formatBattleLogActionTitle(getBattleLogDisplayActionTitle("JammerUK1993 played Dudunsparce.", details)),
    "Dudunsparce used Run Away Draw"
  );
});

test("display action helpers promote explicit activation details without duplicating them", () => {
  const details = [
    "- Dudunsparce's Run Away Draw was activated.",
    "- JammerUK1993 drew 3 cards"
  ];

  assert.equal(
    getBattleLogDisplayActionTitle("JammerUK1993 played Dudunsparce.", details),
    "Dudunsparce's Run Away Draw was activated."
  );
  assert.deepEqual(
    getBattleLogDisplayActionDetails("JammerUK1993 played Dudunsparce.", details),
    ["- JammerUK1993 drew 3 cards"]
  );
});
