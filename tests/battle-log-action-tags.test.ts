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

test("battle-log action classification and labels follow their decision table", () => {
  const classificationCases = [
    ["opening draw", "James drew 7 cards for the opening hand", "draw"],
    ["draw and bench", "James drew Radiant Greninja and played it to the Bench", "bench"],
    ["evolution", "James evolved Drakloak to Dragapult ex", "evolve"],
    ["ability", "James used Concealed Cards.", "ability"],
    ["supporter", "James played a Supporter card.", "supporter"],
    ["item", "James played an Item card.", "item"],
    ["tool", "James attached a Pokemon Tool to Dragapult ex.", "tool"],
    ["stadium", "James played a Stadium card.", "stadium"],
    ["damage attack", "Dragapult ex used Phantom Dive for 200 damage.", "attack"],
    ["arrow attack", "Dragapult ex used Shadow Bullet -> 180 damage to Gabite.", "attack"],
    ["choose attack", "Dragapult ex used Phantom Gate -> choose 1 attack from your opponent's Active Pokemon.", "attack"],
    ["win", "James won the game.", "win"],
    ["loss", "Cynthia lost the match.", "loss"],
    ["knockout", "Charmander was Knocked Out.", "ko"],
    ["weak played signal", "James played Buddy-Buddy Poffin.", "other"],
    ["turn marker", "Turn # 3 - James's Turn", "other"],
    ["empty title", "", "other"],
    ["accent normalization", "James attached a Pokémon Tool to Dragapult ex.", "tool"]
  ] as const;

  for (const [name, title, expected] of classificationCases) {
    assert.equal(classifyBattleLogActionTitle(title), expected, name);
  }

  const labelCases = [
    ["recognized draw", "James drew a card.", "Draw"],
    ["played fallback", "James played Buddy-Buddy Poffin.", "Play"],
    ["attached fallback", "James attached Darkness Energy to Munkidori.", "Attach"],
    ["retreat fallback", "James retreated to the Bench.", "Retreat"],
    ["generic fallback", "A quiet line without a clear action", "Action"]
  ] as const;

  for (const [name, title, expected] of labelCases) {
    assert.equal(getBattleLogActionTagLabel(title), expected, name);
  }
});

test("battle-log action titles use the subject and board-position decision table", () => {
  type TitleCase = {
    name: string;
    input: string;
    options?: Parameters<typeof formatBattleLogActionTitle>[1];
    expected: string;
  };

  const cases: TitleCase[] = [
    {
      name: "play to active",
      input: "JammerUK1993 played Froakie to the Active Spot.",
      expected: "Froakie played to Active spot"
    },
    {
      name: "draw and play to bench",
      input: "James drew Radiant Greninja and played it to the Bench.",
      expected: "Radiant Greninja played to Bench"
    },
    {
      name: "generic attachment",
      input: "James attached Darkness Energy to Munkidori.",
      expected: "Darkness Energy attached to Munkidori"
    },
    {
      name: "attachment to active",
      input: "James attached Darkness Energy to Munkidori in the Active Spot.",
      expected: "Darkness Energy attached to Munkidori in the Active"
    },
    {
      name: "attachment to bench",
      input: "James attached Darkness Energy to Munkidori on the Bench.",
      expected: "Darkness Energy attached to Munkidori on the Bench"
    },
    {
      name: "generic evolution",
      input: "James evolved Drakloak to Dragapult ex.",
      expected: "Drakloak evolved into Dragapult ex"
    },
    {
      name: "evolution on bench",
      input: "James evolved Froakie to Frogadier on the Bench.",
      expected: "Froakie evolved into Frogadier on the Bench"
    },
    {
      name: "named draw",
      input: "JammerUK1993 drew Froakie.",
      expected: "Drew Froakie"
    },
    {
      name: "anonymous draw",
      input: "iBerzrk_Network drew a card.",
      expected: "Drew a card"
    },
    {
      name: "generic play",
      input: "JammerUK1993 played Buddy-Buddy Poffin.",
      expected: "Played Buddy-Buddy Poffin"
    },
    {
      name: "possessive ability",
      input: "iBerzrk_Network's Drakloak used Recon Directive.",
      options: { actionTag: "ability" },
      expected: "Drakloak used Recon Directive"
    },
    {
      name: "attack without target",
      input: "JammerUK1993's Greninja ex used Mirage Barrage.",
      options: { actionTag: "attack" },
      expected: "Greninja ex used Mirage Barrage"
    },
    {
      name: "attack with target and damage",
      input: "JammerUK1993's Greninja ex used Mirage Barrage on iBerzrk_Network's Active for 120 damage.",
      options: { actionTag: "attack" },
      expected: "Greninja ex used Mirage Barrage on Active for 120 damage"
    },
    {
      name: "curly possessives in attack",
      input: "iBerzrk_Network’s Budew used Itchy Pollen on JammerUK1993’s Budew for 10 damage.",
      options: { actionTag: "attack" },
      expected: "Budew used Itchy Pollen on Budew for 10 damage"
    },
    {
      name: "retreating a named Pokemon",
      input: "JammerUK1993 retreated Budew to Bench.",
      expected: "Budew retreated to Bench"
    },
    {
      name: "retreating without a Pokemon",
      input: "JammerUK1993 retreated to Bench.",
      expected: "Retreated to Bench"
    },
    {
      name: "ended turn",
      input: "JammerUK1993 ended their turn.",
      expected: "Ended turn"
    },
    {
      name: "retain actor for board setup",
      input: "JammerUK1993 played Froakie to the Active Spot.",
      options: { retainActor: true },
      expected: "JammerUK1993: Froakie played to Active spot"
    },
    {
      name: "retain actor for item setup",
      input: "JammerUK1993 played Buddy-Buddy Poffin.",
      options: { actionTag: "item", retainActor: true },
      expected: "JammerUK1993: Played Buddy-Buddy Poffin"
    }
  ];

  for (const scenario of cases) {
    assert.equal(
      formatBattleLogActionTitle(scenario.input, scenario.options),
      scenario.expected,
      scenario.name
    );
  }
});

test("battle-log action details apply the player, bullet, and counter decision table", () => {
  const cases = [
    [
      "attack player reference",
      "iBerzrk_Network's Active Pokemon took 120 damage.",
      { actionTag: "attack" },
      "Active Pokemon took 120 damage"
    ],
    [
      "attack opponent reference with bullet",
      "- Opponent's Benched Pokemon took 120 damage.",
      { actionTag: "attack" },
      "- Benched Pokemon took 120 damage"
    ],
    [
      "attack owned Pokemon name",
      "_ndz's Cynthia's Gabite took 120 damage.",
      { actionTag: "attack" },
      "Cynthia's Gabite took 120 damage"
    ],
    [
      "numeric damage counters",
      "Hyierro put 6 damage counters on Hyierro's Fan Rotom.",
      undefined,
      "6 damage counters on Fan Rotom"
    ],
    [
      "singular damage counter with bullet",
      "- _ndz put a damage counter on _ndz's Cynthia's Roserade.",
      undefined,
      "- 1 damage counter on Cynthia's Roserade"
    ],
    [
      "owned Pokemon movement",
      "_ndz's Cynthia's Gabite is now in the Active spot.",
      { actionTag: "other" },
      "Cynthia's Gabite is now in the Active spot"
    ],
    [
      "owned Pokemon movement with bullet",
      "- _ndz's Cynthia's Roserade moved to the Bench.",
      { actionTag: "other" },
      "- Cynthia's Roserade moved to Bench"
    ]
  ] as const;

  for (const [name, detail, options, expected] of cases) {
    assert.equal(formatBattleLogActionDetail(detail, options), expected, name);
  }
});

test("battle-log display titles and details follow the promotion decision table", () => {
  type DisplayCase = {
    name: string;
    title: string;
    details: string[];
    expectedTitle: string;
    expectedDetails: string[];
    expectedFormattedTitle?: string;
  };

  const cases: DisplayCase[] = [
    {
      name: "retreat promotion",
      title: "_ndz retreated Cynthia's Roserade to Bench.",
      details: [
        "Basic Fighting Energy was discarded from _ndz's Cynthia's Roserade.",
        "_ndz's Cynthia's Gabite is now in the Active spot."
      ],
      expectedTitle: "_ndz retreated Cynthia's Roserade to Bench -> Cynthia's Gabite is now in the Active spot",
      expectedDetails: ["Basic Fighting Energy was discarded from _ndz's Cynthia's Roserade."],
      expectedFormattedTitle:
        "Cynthia's Roserade retreated to Bench -> Cynthia's Gabite is now in the Active spot"
    },
    {
      name: "multi-target attack damage",
      title: "JammerUK1993's Greninja ex used Mirage Barrage on iBerzrk_Network's Active for 120 damage.",
      details: [
        "- iBerzrk_Network's Benched Pokemon took 120 damage.",
        "Ignition Energy was discarded from JammerUK1993's Greninja ex."
      ],
      expectedTitle:
        "JammerUK1993's Greninja ex used Mirage Barrage on iBerzrk_Network's Active for 120 damage & Benched Pokemon for 120 damage",
      expectedDetails: ["Ignition Energy was discarded from JammerUK1993's Greninja ex."],
      expectedFormattedTitle:
        "Greninja ex used Mirage Barrage on Active for 120 damage & Benched Pokemon for 120 damage"
    },
    {
      name: "detail-only spread attack damage",
      title: "JammerUK1993's Greninja ex used Mirage Barrage.",
      details: [
        "- iBerzrk_Network's Cynthia's Gabite took 120 damage.",
        "- iBerzrk_Network's Cynthia's Roserade took 120 damage."
      ],
      expectedTitle:
        "JammerUK1993's Greninja ex used Mirage Barrage on Cynthia's Gabite for 120 damage & Cynthia's Roserade for 120 damage",
      expectedDetails: [],
      expectedFormattedTitle:
        "Greninja ex used Mirage Barrage on Cynthia's Gabite for 120 damage & Cynthia's Roserade for 120 damage"
    },
    {
      name: "Boss's Orders switch",
      title: "JammerUK1993 played Boss's Orders.",
      details: [
        "- Cynthia's Roselia was switched with _ndz's Cynthia's Gible to become the Active Pokémon",
        "Cynthia's Roselia is now in the Active spot"
      ],
      expectedTitle:
        "JammerUK1993 played Boss's Orders - Active Cynthia's Gible was switched with Benched Cynthia's Roselia",
      expectedDetails: [],
      expectedFormattedTitle:
        "Played Boss's Orders - Active Cynthia's Gible was switched with Benched Cynthia's Roselia"
    },
    {
      name: "knockout discard movement",
      title: "_ndz's Cynthia's Gabite was Knocked Out!",
      details: [
        "2 cards were discarded from _ndz's Cynthia's Gabite.",
        "Basic Fighting Energy, Cynthia's Gible",
        "Gible was discarded from _ndz's Cynthia's Gabite."
      ],
      expectedTitle: "_ndz's Cynthia's Gabite was Knocked Out!",
      expectedDetails: []
    },
    {
      name: "discard recovery",
      title: "_ndz played Night Stretcher.",
      details: ["_ndz moved _ndz's Cynthia's Gible to their hand"],
      expectedTitle: "_ndz played Night Stretcher & moved Cynthia's Gible from discard to hand",
      expectedDetails: [],
      expectedFormattedTitle: "Played Night Stretcher & moved Cynthia's Gible from discard to hand"
    },
    {
      name: "generated Dudunsparce activation",
      title: "JammerUK1993 played Dudunsparce.",
      details: [
        "- JammerUK1993 drew 3 cards",
        "- Rare Candy, Surfing Beach, Greninja ex",
        "- JammerUK1993 shuffled 2 cards into their deck",
        "- Dudunsparce, Dunsparce"
      ],
      expectedTitle: "Dudunsparce's Run Away Draw was activated.",
      expectedDetails: [
        "- JammerUK1993 drew 3 cards",
        "- Rare Candy, Surfing Beach, Greninja ex",
        "- JammerUK1993 shuffled 2 cards into their deck",
        "- Dudunsparce, Dunsparce"
      ],
      expectedFormattedTitle: "Dudunsparce used Run Away Draw"
    },
    {
      name: "explicit activation without duplicate detail",
      title: "JammerUK1993 played Dudunsparce.",
      details: [
        "- Dudunsparce's Run Away Draw was activated.",
        "- JammerUK1993 drew 3 cards"
      ],
      expectedTitle: "Dudunsparce's Run Away Draw was activated.",
      expectedDetails: ["- JammerUK1993 drew 3 cards"]
    }
  ];

  for (const scenario of cases) {
    const displayTitle = getBattleLogDisplayActionTitle(scenario.title, scenario.details);

    assert.equal(displayTitle, scenario.expectedTitle, `${scenario.name}: title`);
    assert.deepEqual(
      getBattleLogDisplayActionDetails(scenario.title, scenario.details),
      scenario.expectedDetails,
      `${scenario.name}: details`
    );

    if (scenario.expectedFormattedTitle) {
      assert.equal(
        formatBattleLogActionTitle(displayTitle, {
          actionTag: scenario.name.includes("attack") ? "attack" : undefined
        }),
        scenario.expectedFormattedTitle,
        `${scenario.name}: formatted title`
      );
    }
  }
});
