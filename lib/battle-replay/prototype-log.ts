import type { LogSection } from "@/types/index";

// Exact parsed sections from the selected saved Battle Log. This is a durable
// prototype fixture; the production replay compiler will receive LogSection[]
// from the requested Battle Log rather than importing this file.
export const prototypeBattleLogSections: LogSection[] = [
  {
    "title": "Setup",
    "player": "",
    "actions": [
      {
        "title": "JammerUK1993 chose tails for the opening coin flip.",
        "details": [
          "VoltRunner90 won the coin toss."
        ]
      },
      {
        "title": "VoltRunner90 decided to go first.",
        "details": [
          "JammerUK1993 drew 7 cards for the opening hand.",
          "- 7 drawn cards.",
          "• Crispin, Buddy-Buddy Poffin, Munkidori, Area Zero Underdepths, Blaziken ex, Fezandipiti ex, Drakloak",
          "VoltRunner90 drew 7 cards for the opening hand.",
          "- 7 drawn cards."
        ]
      },
      {
        "title": "JammerUK1993 played Munkidori to the Active Spot.",
        "details": []
      },
      {
        "title": "VoltRunner90 played Solrock to the Active Spot.",
        "details": []
      },
      {
        "title": "VoltRunner90 played Riolu to the Bench.",
        "details": []
      },
      {
        "title": "VoltRunner90 played Riolu to the Bench.",
        "details": []
      }
    ],
    "prizesAfterTurn": {
      "JammerUK1993": 6,
      "VoltRunner90": 6
    }
  },
  {
    "title": "VoltRunner90's Turn",
    "player": "VoltRunner90",
    "actions": [
      {
        "title": "VoltRunner90 drew a card.",
        "details": []
      },
      {
        "title": "VoltRunner90 played Ultra Ball.",
        "details": [
          "- VoltRunner90 discarded 2 cards.",
          "• Boss's Orders, Prime Catcher",
          "- VoltRunner90 drew Lunatone."
        ]
      },
      {
        "title": "VoltRunner90 played Lunatone to the Bench.",
        "details": []
      },
      {
        "title": "VoltRunner90 ended their turn.",
        "details": []
      }
    ],
    "prizesAfterTurn": {
      "JammerUK1993": 6,
      "VoltRunner90": 6
    }
  },
  {
    "title": "JammerUK1993's Turn",
    "player": "JammerUK1993",
    "actions": [
      {
        "title": "JammerUK1993 drew Basic Psychic Energy.",
        "details": []
      },
      {
        "title": "JammerUK1993 played Buddy-Buddy Poffin.",
        "details": [
          "- JammerUK1993 drew 2 cards and played them to the Bench.",
          "• Dreepy, Dreepy"
        ]
      },
      {
        "title": "JammerUK1993 played Crispin.",
        "details": [
          "- JammerUK1993 drew Basic Darkness Energy.",
          "- JammerUK1993 attached Basic Fire Energy to Dreepy on the Bench."
        ]
      },
      {
        "title": "JammerUK1993 attached Basic Darkness Energy to Munkidori in the Active Spot.",
        "details": []
      },
      {
        "title": "JammerUK1993 ended their turn.",
        "details": []
      }
    ],
    "prizesAfterTurn": {
      "JammerUK1993": 6,
      "VoltRunner90": 6
    }
  },
  {
    "title": "VoltRunner90's Turn",
    "player": "VoltRunner90",
    "actions": [
      {
        "title": "VoltRunner90 drew a card.",
        "details": []
      },
      {
        "title": "VoltRunner90 evolved Riolu to Mega Lucario ex on the Bench.",
        "details": []
      },
      {
        "title": "VoltRunner90 played Judge.",
        "details": [
          "- VoltRunner90 shuffled a card into their deck.",
          "- JammerUK1993 shuffled 5 cards into their deck.",
          "• Area Zero Underdepths, Blaziken ex, Fezandipiti ex, Drakloak, Basic Psychic Energy",
          "- VoltRunner90 drew 4 cards.",
          "- JammerUK1993 drew 4 cards.",
          "• Drakloak, Poké Pad, Meowth ex, Torchic"
        ]
      },
      {
        "title": "VoltRunner90 attached Basic Fighting Energy to Solrock in the Active Spot.",
        "details": []
      },
      {
        "title": "VoltRunner90 played Premium Power Pro.",
        "details": []
      },
      {
        "title": "VoltRunner90 played Fighting Gong.",
        "details": [
          "- VoltRunner90 drew Basic Fighting Energy."
        ]
      },
      {
        "title": "VoltRunner90's Lunatone used Lunar Cycle.",
        "details": [
          "- VoltRunner90 discarded Basic Fighting Energy.",
          "- VoltRunner90 drew 3 cards."
        ]
      },
      {
        "title": "VoltRunner90 played Poké Pad.",
        "details": [
          "- VoltRunner90 drew Makuhita."
        ]
      },
      {
        "title": "VoltRunner90 played Makuhita to the Bench.",
        "details": []
      },
      {
        "title": "VoltRunner90's Solrock used Cosmic Beam on JammerUK1993’s Munkidori for 100 damage.",
        "details": [
          "- Damage breakdown:",
          "• Base damage: 70 damage",
          "• (Item) Premium Power Pro: 30 damage",
          "• Total damage: 100 damage"
        ]
      }
    ],
    "prizesAfterTurn": {
      "JammerUK1993": 6,
      "VoltRunner90": 6
    }
  },
  {
    "title": "JammerUK1993's Turn",
    "player": "JammerUK1993",
    "actions": [
      {
        "title": "JammerUK1993 drew Moltres.",
        "details": []
      },
      {
        "title": "JammerUK1993 played Torchic to the Bench.",
        "details": []
      },
      {
        "title": "JammerUK1993 evolved Dreepy to Drakloak on the Bench.",
        "details": []
      },
      {
        "title": "JammerUK1993's Drakloak used Recon Directive.",
        "details": [
          "- JammerUK1993 drew Basic Psychic Energy."
        ]
      },
      {
        "title": "JammerUK1993 played Poké Pad.",
        "details": [
          "- JammerUK1993 drew Drakloak."
        ]
      },
      {
        "title": "JammerUK1993 evolved Dreepy to Drakloak on the Bench.",
        "details": []
      },
      {
        "title": "JammerUK1993's Munkidori used Adrena-Brain.",
        "details": [
          "- JammerUK1993 moved 3 damage counters from JammerUK1993's Munkidori to JammerUK1993's Mega Lucario ex."
        ]
      },
      {
        "title": "JammerUK1993 attached Basic Psychic Energy to Munkidori in the Active Spot.",
        "details": []
      },
      {
        "title": "JammerUK1993 played Meowth ex to the Bench.",
        "details": []
      },
      {
        "title": "JammerUK1993's Meowth ex used Last-Ditch Catch.",
        "details": [
          "- JammerUK1993 drew Lillie's Determination."
        ]
      },
      {
        "title": "JammerUK1993 played Lillie's Determination.",
        "details": [
          "- JammerUK1993 shuffled Moltres into their deck.",
          "- JammerUK1993 drew 8 cards.",
          "• Night Stretcher, Dragapult ex, Special Red Card, Rare Candy, Ultra Ball, Boss's Orders, Dawn, Dreepy"
        ]
      },
      {
        "title": "JammerUK1993 played Dreepy to the Bench.",
        "details": []
      },
      {
        "title": "JammerUK1993's Drakloak used Recon Directive.",
        "details": [
          "- JammerUK1993 drew Basic Psychic Energy."
        ]
      },
      {
        "title": "JammerUK1993 played Ultra Ball.",
        "details": [
          "- JammerUK1993 discarded 2 cards.",
          "• Basic Psychic Energy, Special Red Card",
          "- JammerUK1993 drew Blaziken ex."
        ]
      },
      {
        "title": "JammerUK1993's Munkidori used Mind Bend on VoltRunner90’s Solrock for 60 damage.",
        "details": [
          "- VoltRunner90's Solrock is now Confused."
        ]
      }
    ],
    "prizesAfterTurn": {
      "JammerUK1993": 6,
      "VoltRunner90": 6
    }
  },
  {
    "title": "VoltRunner90's Turn",
    "player": "VoltRunner90",
    "actions": [
      {
        "title": "VoltRunner90 drew a card.",
        "details": []
      },
      {
        "title": "VoltRunner90 played Poké Pad.",
        "details": [
          "- VoltRunner90 drew Solrock."
        ]
      },
      {
        "title": "VoltRunner90 played Solrock to the Bench.",
        "details": []
      },
      {
        "title": "VoltRunner90 played Lillie's Determination.",
        "details": [
          "- VoltRunner90 shuffled 2 cards into their deck.",
          "- VoltRunner90 drew 8 cards."
        ]
      },
      {
        "title": "VoltRunner90 played Gravity Mountain to the Stadium spot.",
        "details": []
      },
      {
        "title": "VoltRunner90's Lunatone used Lunar Cycle.",
        "details": [
          "- VoltRunner90 discarded Basic Fighting Energy.",
          "- VoltRunner90 drew 3 cards."
        ]
      },
      {
        "title": "VoltRunner90 played Switch.",
        "details": [
          "- VoltRunner90's Solrock was switched with VoltRunner90's Solrock to become the Active Pokémon.",
          "VoltRunner90's Solrock is now in the Active Spot."
        ]
      },
      {
        "title": "VoltRunner90 attached Basic Fighting Energy to Solrock in the Active Spot.",
        "details": []
      },
      {
        "title": "VoltRunner90's Solrock used Cosmic Beam on JammerUK1993’s Munkidori for 70 damage.",
        "details": []
      },
      {
        "title": "JammerUK1993's Munkidori was Knocked Out!",
        "details": [
          "- 2 cards were discarded from JammerUK1993's Munkidori.",
          "• Basic Darkness Energy, Basic Psychic Energy"
        ]
      },
      {
        "title": "VoltRunner90 took a Prize card.",
        "details": [
          "A card was added to VoltRunner90's hand.",
          "JammerUK1993's Drakloak is now in the Active Spot."
        ]
      }
    ],
    "prizesAfterTurn": {
      "JammerUK1993": 6,
      "VoltRunner90": 5
    }
  },
  {
    "title": "JammerUK1993's Turn",
    "player": "JammerUK1993",
    "actions": [
      {
        "title": "JammerUK1993 drew Poké Pad.",
        "details": []
      },
      {
        "title": "JammerUK1993 played Rare Candy.",
        "details": [
          "- JammerUK1993 evolved Torchic to Blaziken ex on the Bench."
        ]
      },
      {
        "title": "JammerUK1993's Drakloak used Recon Directive.",
        "details": [
          "- JammerUK1993 drew Basic Darkness Energy."
        ]
      },
      {
        "title": "JammerUK1993's Drakloak used Recon Directive.",
        "details": [
          "- JammerUK1993 drew Ultra Ball."
        ]
      },
      {
        "title": "JammerUK1993's Blaziken ex used Seething Spirit.",
        "details": [
          "- JammerUK1993 attached Basic Psychic Energy to Drakloak in the Active Spot."
        ]
      },
      {
        "title": "JammerUK1993 played Poké Pad.",
        "details": [
          "- JammerUK1993 drew Drakloak."
        ]
      },
      {
        "title": "JammerUK1993 evolved Dreepy to Drakloak on the Bench.",
        "details": []
      },
      {
        "title": "JammerUK1993's Drakloak used Recon Directive.",
        "details": [
          "- JammerUK1993 drew Buddy-Buddy Poffin."
        ]
      },
      {
        "title": "JammerUK1993 played Buddy-Buddy Poffin.",
        "details": [
          "- JammerUK1993 drew Dreepy and played it to the Bench."
        ]
      },
      {
        "title": "JammerUK1993 evolved Drakloak to Dragapult ex in the Active Spot.",
        "details": []
      },
      {
        "title": "JammerUK1993 played Boss's Orders.",
        "details": [
          "- VoltRunner90's Mega Lucario ex was switched with VoltRunner90's Solrock to become the Active Pokémon.",
          "VoltRunner90's Mega Lucario ex is now in the Active Spot."
        ]
      },
      {
        "title": "JammerUK1993's Dragapult ex used Phantom Dive on VoltRunner90’s Mega Lucario ex for 200 damage.",
        "details": [
          "- JammerUK1993 put 6 damage counters on JammerUK1993's Riolu."
        ]
      }
    ],
    "prizesAfterTurn": {
      "JammerUK1993": 6,
      "VoltRunner90": 5
    }
  },
  {
    "title": "VoltRunner90's Turn",
    "player": "VoltRunner90",
    "actions": [
      {
        "title": "VoltRunner90 drew a card.",
        "details": []
      },
      {
        "title": "VoltRunner90 evolved Riolu to Mega Lucario ex on the Bench.",
        "details": []
      },
      {
        "title": "VoltRunner90's Lunatone used Lunar Cycle.",
        "details": [
          "- VoltRunner90 discarded Basic Fighting Energy.",
          "- VoltRunner90 drew 3 cards."
        ]
      },
      {
        "title": "VoltRunner90 evolved Makuhita to Hariyama on the Bench.",
        "details": []
      },
      {
        "title": "VoltRunner90's Hariyama used Heave-Ho Catcher.",
        "details": [
          "- JammerUK1993's Meowth ex was switched with JammerUK1993's Dragapult ex to become the Active Pokémon.",
          "JammerUK1993's Meowth ex is now in the Active Spot."
        ]
      },
      {
        "title": "VoltRunner90 played Premium Power Pro.",
        "details": []
      },
      {
        "title": "VoltRunner90 attached Basic Fighting Energy to Mega Lucario ex in the Active Spot.",
        "details": []
      },
      {
        "title": "VoltRunner90 played Judge.",
        "details": [
          "- VoltRunner90 shuffled 6 cards into their deck.",
          "- JammerUK1993 shuffled 4 cards into their deck.",
          "• Night Stretcher, Dawn, Basic Darkness Energy, Ultra Ball",
          "- VoltRunner90 drew 4 cards.",
          "- JammerUK1993 drew 4 cards.",
          "• Basic Fire Energy, Night Stretcher, Basic Darkness Energy, Torchic"
        ]
      },
      {
        "title": "VoltRunner90's Mega Lucario ex used Aura Jab on JammerUK1993’s Meowth ex for 320 damage. JammerUK1993's Meowth ex took 160 more damage because of Fighting Weakness.",
        "details": [
          "- Damage breakdown:",
          "• Base damage: 130 damage",
          "• (Item) Premium Power Pro: 30 damage",
          "• Weakness to Fighting: 160 damage",
          "• Total damage: 320 damage",
          "- VoltRunner90 attached Basic Fighting Energy to Mega Lucario ex on the Bench.",
          "- VoltRunner90 attached Basic Fighting Energy to Hariyama on the Bench.",
          "- VoltRunner90 attached Basic Fighting Energy to Mega Lucario ex on the Bench."
        ]
      },
      {
        "title": "JammerUK1993's Meowth ex was Knocked Out!",
        "details": []
      },
      {
        "title": "VoltRunner90 took 2 Prize cards.",
        "details": [
          "A card was added to VoltRunner90's hand.",
          "A card was added to VoltRunner90's hand.",
          "JammerUK1993's Dragapult ex is now in the Active Spot."
        ]
      }
    ],
    "prizesAfterTurn": {
      "JammerUK1993": 6,
      "VoltRunner90": 3
    }
  },
  {
    "title": "JammerUK1993's Turn",
    "player": "JammerUK1993",
    "actions": [
      {
        "title": "JammerUK1993 drew Dragapult ex.",
        "details": []
      },
      {
        "title": "JammerUK1993's Drakloak used Recon Directive.",
        "details": [
          "- JammerUK1993 drew Ultra Ball."
        ]
      },
      {
        "title": "JammerUK1993's Drakloak used Recon Directive.",
        "details": [
          "- JammerUK1993 drew Buddy-Buddy Poffin."
        ]
      },
      {
        "title": "JammerUK1993 attached Basic Fire Energy to Drakloak on the Bench.",
        "details": []
      },
      {
        "title": "JammerUK1993's Blaziken ex used Seething Spirit.",
        "details": [
          "- JammerUK1993 attached Basic Psychic Energy to Drakloak on the Bench."
        ]
      },
      {
        "title": "JammerUK1993's Dragapult ex used Phantom Dive on VoltRunner90’s Mega Lucario ex for 200 damage.",
        "details": [
          "- JammerUK1993 put 6 damage counters on JammerUK1993's Mega Lucario ex."
        ]
      },
      {
        "title": "VoltRunner90's Mega Lucario ex was Knocked Out!",
        "details": [
          "- 2 cards were discarded from VoltRunner90's Mega Lucario ex.",
          "• Basic Fighting Energy, Riolu"
        ]
      },
      {
        "title": "JammerUK1993 took 3 Prize cards.",
        "details": [
          "Unfair Stamp was added to JammerUK1993's hand.",
          "Crispin was added to JammerUK1993's hand.",
          "Basic Fire Energy was added to JammerUK1993's hand.",
          "VoltRunner90's Solrock is now in the Active Spot."
        ]
      }
    ],
    "prizesAfterTurn": {
      "JammerUK1993": 3,
      "VoltRunner90": 3
    }
  },
  {
    "title": "VoltRunner90's Turn",
    "player": "VoltRunner90",
    "actions": [
      {
        "title": "VoltRunner90 drew a card.",
        "details": []
      },
      {
        "title": "VoltRunner90's Lunatone used Lunar Cycle.",
        "details": [
          "- VoltRunner90 discarded Basic Fighting Energy.",
          "- VoltRunner90 drew 3 cards."
        ]
      },
      {
        "title": "VoltRunner90 played Wally's Compassion.",
        "details": [
          "- VoltRunner90's Mega Lucario ex healed 120 damage.",
          "- VoltRunner90 moved VoltRunner90's 2 cards to their hand.",
          "• Basic Fighting Energy, Basic Fighting Energy"
        ]
      },
      {
        "title": "VoltRunner90 played Premium Power Pro.",
        "details": []
      },
      {
        "title": "VoltRunner90 attached Basic Fighting Energy to Hariyama on the Bench.",
        "details": []
      },
      {
        "title": "VoltRunner90 played Riolu to the Bench.",
        "details": []
      },
      {
        "title": "VoltRunner90's Solrock used Cosmic Beam on JammerUK1993’s Dragapult ex for 100 damage.",
        "details": [
          "- Damage breakdown:",
          "• Base damage: 70 damage",
          "• (Item) Premium Power Pro: 30 damage",
          "• Total damage: 100 damage"
        ]
      }
    ],
    "prizesAfterTurn": {
      "JammerUK1993": 3,
      "VoltRunner90": 3
    }
  },
  {
    "title": "JammerUK1993's Turn",
    "player": "JammerUK1993",
    "actions": [
      {
        "title": "JammerUK1993 drew Blaziken ex.",
        "details": []
      },
      {
        "title": "JammerUK1993 played Ultra Ball.",
        "details": [
          "- JammerUK1993 discarded 2 cards.",
          "• Buddy-Buddy Poffin, Torchic",
          "- JammerUK1993 drew Combusken."
        ]
      },
      {
        "title": "JammerUK1993's Drakloak used Recon Directive.",
        "details": [
          "- JammerUK1993 drew Moltres."
        ]
      },
      {
        "title": "JammerUK1993's Drakloak used Recon Directive.",
        "details": [
          "- JammerUK1993 drew Boss's Orders."
        ]
      },
      {
        "title": "JammerUK1993 played Night Stretcher.",
        "details": [
          "- JammerUK1993 moved JammerUK1993's Munkidori to their hand."
        ]
      },
      {
        "title": "JammerUK1993 played Munkidori to the Bench.",
        "details": []
      },
      {
        "title": "JammerUK1993 attached Basic Darkness Energy to Munkidori on the Bench.",
        "details": []
      },
      {
        "title": "JammerUK1993's Blaziken ex used Seething Spirit.",
        "details": [
          "- JammerUK1993 attached Basic Darkness Energy to Blaziken ex on the Bench."
        ]
      },
      {
        "title": "JammerUK1993's Munkidori used Adrena-Brain.",
        "details": [
          "- JammerUK1993 moved 3 damage counters from JammerUK1993's Dragapult ex to JammerUK1993's Riolu."
        ]
      },
      {
        "title": "JammerUK1993 played Boss's Orders.",
        "details": [
          "- VoltRunner90's Hariyama was switched with VoltRunner90's Solrock to become the Active Pokémon.",
          "VoltRunner90's Hariyama is now in the Active Spot."
        ]
      },
      {
        "title": "JammerUK1993's Dragapult ex used Phantom Dive on VoltRunner90’s Hariyama for 200 damage.",
        "details": [
          "- JammerUK1993 put a damage counter on JammerUK1993's Solrock.",
          "- JammerUK1993 put 5 damage counters on JammerUK1993's Riolu."
        ]
      },
      {
        "title": "VoltRunner90's Hariyama was Knocked Out!",
        "details": [
          "- 3 cards were discarded from VoltRunner90's Hariyama.",
          "• Basic Fighting Energy, Basic Fighting Energy, Makuhita"
        ]
      },
      {
        "title": "VoltRunner90's Riolu was Knocked Out!",
        "details": []
      },
      {
        "title": "JammerUK1993 took 2 Prize cards.",
        "details": [
          "Boss's Orders was added to JammerUK1993's hand.",
          "Drakloak was added to JammerUK1993's hand.",
          "VoltRunner90's Mega Lucario ex is now in the Active Spot."
        ]
      }
    ],
    "prizesAfterTurn": {
      "JammerUK1993": 1,
      "VoltRunner90": 3
    }
  },
  {
    "title": "VoltRunner90's Turn",
    "player": "VoltRunner90",
    "actions": [
      {
        "title": "VoltRunner90 drew a card.",
        "details": []
      },
      {
        "title": "VoltRunner90 attached Basic Fighting Energy to Mega Lucario ex in the Active Spot.",
        "details": []
      },
      {
        "title": "VoltRunner90 played Carmine.",
        "details": [
          "- VoltRunner90 discarded 6 cards.",
          "• Boss's Orders, Makuhita, Lillie's Determination, Ultra Ball, Mega Lucario ex, Judge",
          "- VoltRunner90 drew 5 cards."
        ]
      },
      {
        "title": "VoltRunner90 played Fighting Gong.",
        "details": [
          "- VoltRunner90 drew Basic Fighting Energy."
        ]
      },
      {
        "title": "VoltRunner90's Lunatone used Lunar Cycle.",
        "details": [
          "- VoltRunner90 discarded Basic Fighting Energy.",
          "- VoltRunner90 drew 3 cards."
        ]
      },
      {
        "title": "VoltRunner90 played Fighting Gong.",
        "details": [
          "- VoltRunner90 drew Solrock."
        ]
      },
      {
        "title": "VoltRunner90 played Meowth ex to the Bench.",
        "details": []
      },
      {
        "title": "VoltRunner90's Meowth ex used Last-Ditch Catch.",
        "details": [
          "- VoltRunner90 drew Kieran."
        ]
      },
      {
        "title": "VoltRunner90's Mega Lucario ex used Aura Jab on JammerUK1993’s Dragapult ex for 130 damage.",
        "details": [
          "- VoltRunner90 attached Basic Fighting Energy to Solrock on the Bench.",
          "- VoltRunner90 attached Basic Fighting Energy to Lunatone on the Bench.",
          "- VoltRunner90 attached Basic Fighting Energy to Lunatone on the Bench."
        ]
      }
    ],
    "prizesAfterTurn": {
      "JammerUK1993": 1,
      "VoltRunner90": 3
    }
  },
  {
    "title": "JammerUK1993's Turn",
    "player": "JammerUK1993",
    "actions": [
      {
        "title": "JammerUK1993 drew Dawn.",
        "details": []
      },
      {
        "title": "JammerUK1993 played Boss's Orders.",
        "details": [
          "- VoltRunner90's Meowth ex was switched with VoltRunner90's Mega Lucario ex to become the Active Pokémon.",
          "VoltRunner90's Meowth ex is now in the Active Spot."
        ]
      },
      {
        "title": "JammerUK1993's Dragapult ex used Phantom Dive on VoltRunner90’s Meowth ex for 200 damage.",
        "details": [
          "- JammerUK1993 put 6 damage counters on JammerUK1993's Solrock."
        ]
      },
      {
        "title": "VoltRunner90's Meowth ex was Knocked Out!",
        "details": []
      },
      {
        "title": "VoltRunner90's Solrock was Knocked Out!",
        "details": [
          "Basic Fighting Energy was discarded from VoltRunner90's Solrock."
        ]
      },
      {
        "title": "JammerUK1993 took a Prize card.",
        "details": [
          "Munkidori was added to JammerUK1993's hand."
        ]
      },
      {
        "title": "All Prize cards taken. JammerUK1993 wins.",
        "details": []
      }
    ],
    "prizesAfterTurn": {
      "JammerUK1993": 0,
      "VoltRunner90": 3
    }
  }
];
