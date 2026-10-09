import type { CardDefinition } from "@/lib/card-definition-catalog/types";

// Real PTCGL export supplied by James, 2026-10-09. Keep source tokens intact.
export const identifiedBattleLog = `Setup
JammerUK1993 chose tails for the opening coin flip.
tyDspen won the coin toss.
tyDspen decided to go first.
JammerUK1993 drew 7 cards for the opening hand.
- 7 drawn cards.
   • (sve_3) Basic Water Energy, (sv5_84) Relicanth, (sve_3) Basic Water Energy, (sve_6) Basic Fighting Energy, (sve_6) Basic Fighting Energy, (sv1_196) Ultra Ball, (sve_6) Basic Fighting Energy
tyDspen drew 7 cards for the opening hand.
- 7 drawn cards.
JammerUK1993 played (sv5_84) Relicanth to the Active Spot.
tyDspen played (sv5_39) Totodile to the Active Spot.

tyDspen's Turn
tyDspen drew a card.
tyDspen attached (sve_3) Basic Water Energy to (sv5_39) Totodile in the Active Spot.
tyDspen ended their turn.

JammerUK1993's Turn
JammerUK1993 drew (sve_3) Basic Water Energy.
JammerUK1993 played (sv1_196) Ultra Ball.
- JammerUK1993 discarded 2 cards.
   • (sve_6) Basic Fighting Energy, (sve_6) Basic Fighting Energy
- JammerUK1993 drew (sv5_39) Totodile.
- JammerUK1993 shuffled their deck.
JammerUK1993 played (sv5_39) Totodile to the Bench.
JammerUK1993 attached (sve_6) Basic Fighting Energy to (sv5_84) Relicanth in the Active Spot.
JammerUK1993 retreated (sv5_84) Relicanth to the Bench.
- (sve_6) Basic Fighting Energy was discarded from JammerUK1993's (sv5_84) Relicanth.
JammerUK1993's (sv5_39) Totodile is now in the Active Spot.
JammerUK1993 ended their turn.

tyDspen's Turn
tyDspen drew a card.
tyDspen attached (sve_3) Basic Water Energy to (sv5_39) Totodile in the Active Spot.
tyDspen played (sv1_175) Jacq.
- tyDspen drew 2 cards.
   • (sv5_40) Croconaw, (sv5_114) Metang
- tyDspen shuffled their deck.
tyDspen evolved (sv5_39) Totodile to (sv5_40) Croconaw in the Active Spot.
tyDspen's (sv5_40) Croconaw used Reverse Thrust on JammerUK1993’s (sv5_39) Totodile for 30 damage.

JammerUK1993's Turn
JammerUK1993 drew (sve_6) Basic Fighting Energy.
You conceded. tyDspen wins.`;

// Public catalogue rows used by this export, read from the active generation.
export const identifiedCardDefinitions: CardDefinition[] = [
  {
    "hp": null,
    "name": "Jacq",
    "rules": [
      "Search your deck for up to 2 Evolution Pokémon, reveal them, and put them into your hand. Then, shuffle your deck."
    ],
    "setId": "sv01",
    "stage": null,
    "types": null,
    "source": "tcgdex",
    "attacks": [],
    "localId": "175",
    "category": "Trainer",
    "imageUrl": "https://assets.tcgdex.net/en/sv/sv01/175/high.webp",
    "syncedAt": "2026-10-04T21:15:38.682Z",
    "abilities": [],
    "sourceUrl": "https://api.tcgdex.net/v2/en/cards/sv01-175",
    "evolvesFrom": null,
    "trainerType": "Supporter",
    "sourceCardId": "sv01-175",
    "regulationMark": "G",
    "setReleaseDate": "2023-03-31",
    "sourceUpdatedAt": null
  },
  {
    "hp": null,
    "name": "Ultra Ball",
    "rules": [
      "You can use this card only if you discard 2 other cards from your hand.\n\nSearch your deck for a Pokémon, reveal it, and put it into your hand. Then, shuffle your deck."
    ],
    "setId": "sv01",
    "stage": null,
    "types": null,
    "source": "tcgdex",
    "attacks": [],
    "localId": "196",
    "category": "Trainer",
    "imageUrl": "https://assets.tcgdex.net/en/sv/sv01/196/high.webp",
    "syncedAt": "2026-10-04T21:15:38.682Z",
    "abilities": [],
    "sourceUrl": "https://api.tcgdex.net/v2/en/cards/sv01-196",
    "evolvesFrom": null,
    "trainerType": "Item",
    "sourceCardId": "sv01-196",
    "regulationMark": "G",
    "setReleaseDate": "2023-03-31",
    "sourceUpdatedAt": null
  },
  {
    "hp": 70,
    "name": "Totodile",
    "rules": null,
    "setId": "sv05",
    "stage": "Basic",
    "types": [
      "Water"
    ],
    "source": "tcgdex",
    "attacks": [
      {
        "cost": [
          "Water"
        ],
        "name": "Big Bite",
        "text": "During your opponent's next turn, the Defending Pokémon can't retreat.",
        "damage": "10"
      }
    ],
    "localId": "039",
    "category": "Pokemon",
    "imageUrl": "https://assets.tcgdex.net/en/sv/sv05/039/high.webp",
    "syncedAt": "2026-10-04T21:15:38.682Z",
    "abilities": [],
    "sourceUrl": "https://api.tcgdex.net/v2/en/cards/sv05-039",
    "evolvesFrom": null,
    "trainerType": null,
    "sourceCardId": "sv05-039",
    "regulationMark": "H",
    "setReleaseDate": "2024-03-22",
    "sourceUpdatedAt": null
  },
  {
    "hp": 90,
    "name": "Croconaw",
    "rules": null,
    "setId": "sv05",
    "stage": "Stage1",
    "types": [
      "Water"
    ],
    "source": "tcgdex",
    "attacks": [
      {
        "cost": [
          "Water"
        ],
        "name": "Reverse Thrust",
        "text": "Switch this Pokémon with 1 of your Benched Pokémon.",
        "damage": "30"
      }
    ],
    "localId": "040",
    "category": "Pokemon",
    "imageUrl": "https://assets.tcgdex.net/en/sv/sv05/040/high.webp",
    "syncedAt": "2026-10-04T21:15:38.682Z",
    "abilities": [],
    "sourceUrl": "https://api.tcgdex.net/v2/en/cards/sv05-040",
    "evolvesFrom": "Totodile",
    "trainerType": null,
    "sourceCardId": "sv05-040",
    "regulationMark": "H",
    "setReleaseDate": "2024-03-22",
    "sourceUpdatedAt": null
  },
  {
    "hp": 100,
    "name": "Relicanth",
    "rules": null,
    "setId": "sv05",
    "stage": "Basic",
    "types": [
      "Fighting"
    ],
    "source": "tcgdex",
    "attacks": [
      {
        "cost": [
          "Fighting",
          "Colorless"
        ],
        "name": "Razor Fin",
        "text": null,
        "damage": "30"
      }
    ],
    "localId": "084",
    "category": "Pokemon",
    "imageUrl": "https://assets.tcgdex.net/en/sv/sv05/084/high.webp",
    "syncedAt": "2026-10-04T21:15:38.682Z",
    "abilities": [
      {
        "name": "Memory Dive",
        "text": "Each of your evolved Pokémon can use any attack from its previous Evolutions. (You still need the necessary Energy to use each attack.)",
        "type": "Ability"
      }
    ],
    "sourceUrl": "https://api.tcgdex.net/v2/en/cards/sv05-084",
    "evolvesFrom": null,
    "trainerType": null,
    "sourceCardId": "sv05-084",
    "regulationMark": "H",
    "setReleaseDate": "2024-03-22",
    "sourceUpdatedAt": null
  },
  {
    "hp": 100,
    "name": "Metang",
    "rules": null,
    "setId": "sv05",
    "stage": "Stage1",
    "types": [
      "Metal"
    ],
    "source": "tcgdex",
    "attacks": [
      {
        "cost": [
          "Metal",
          "Colorless",
          "Colorless"
        ],
        "name": "Beam",
        "text": null,
        "damage": "60"
      }
    ],
    "localId": "114",
    "category": "Pokemon",
    "imageUrl": "https://assets.tcgdex.net/en/sv/sv05/114/high.webp",
    "syncedAt": "2026-10-04T21:15:38.682Z",
    "abilities": [
      {
        "name": "Metal Maker",
        "text": "Once during your turn, you may look at the top 4 cards of your deck and attach any number of Basic {M} Energy cards you find there to your Pokémon in any way you like. Shuffle the other cards and put them on the bottom of your deck.",
        "type": "Ability"
      }
    ],
    "sourceUrl": "https://api.tcgdex.net/v2/en/cards/sv05-114",
    "evolvesFrom": "Beldum",
    "trainerType": null,
    "sourceCardId": "sv05-114",
    "regulationMark": "H",
    "setReleaseDate": "2024-03-22",
    "sourceUpdatedAt": null
  }
];
