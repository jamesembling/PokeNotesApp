import type { ReplayLogSource } from "@/lib/battle-replay/types";

// Synthetic players and game; expected changes below are hand-authored from the
// recorded sentences, never captured from compiler output. Each row is one action.
// Omitted fields retain their previous independently expected value.
export type ExpectedPokemon = {
  name: string; damage: number; energy: string[]; underlying: string[];
  conditions: string[]; tool: string | null;
};
export type ExpectedSide = {
  active: ExpectedPokemon | null; bench: ExpectedPokemon[];
  hand: number | null; known: string[]; discard: string[];
};
type ExpectedChange = { self?: Partial<ExpectedSide>; opponent?: Partial<ExpectedSide>; stadium?: string | null };
const pokemon = (name: string, extra: Partial<ExpectedPokemon> = {}): ExpectedPokemon => ({
  name, damage: 0, energy: [], underlying: [], conditions: [], tool: null, ...extra,
});
const drakloak = (extra: Partial<ExpectedPokemon> = {}) => pokemon("Drakloak", extra);
const openingSelf = ["Drakloak", "Dreepy", "Nest Ball", "Basic Psychic Energy", "Double Turbo Energy", "Forest Seal Stone", "Training Court"];
const openingOpponent = ["Rival", "Buddy", "Basic Fire Energy", "Beach Court", "Switch", "Night Stretcher", "Supply"];
const steps: Array<{ player: string; title: string; details?: string[]; expected: ExpectedChange }> = [
  { player: "", title: "PlayerOne drew 7 cards for the opening hand.", details: ["- 7 drawn cards.", `• ${openingSelf.join(", ")}`], expected: { self: { hand: 7, known: openingSelf } } },
  { player: "", title: "PlayerTwo drew 7 cards for the opening hand.", details: [openingOpponent.join(", ")], expected: { opponent: { hand: 7, known: openingOpponent } } },
  { player: "", title: "PlayerOne played Drakloak to the Active Spot.", expected: { self: { active: drakloak(), hand: 6, known: openingSelf.slice(1) } } },
  { player: "", title: "PlayerOne played Dreepy to the Bench.", expected: { self: { bench: [pokemon("Dreepy")], hand: 5, known: openingSelf.slice(2) } } },
  { player: "", title: "PlayerTwo played Rival to the Active Spot.", expected: { opponent: { active: pokemon("Rival"), hand: 6, known: openingOpponent.slice(1) } } },
  { player: "PlayerOne", title: "PlayerOne played Nest Ball.", details: ["- PlayerOne drew 2 cards and played them to the Bench.", "- Snorunt, Ralts"], expected: { self: { bench: [pokemon("Dreepy"), pokemon("Snorunt"), pokemon("Ralts")], hand: 4, known: openingSelf.slice(3), discard: ["Nest Ball"] } } },
  { player: "PlayerOne", title: "PlayerOne's Drakloak used Recon Directive.", details: ["- PlayerOne drew 2 cards.", "• Drakloak, Potion"], expected: { self: { hand: 6, known: [...openingSelf.slice(3), "Drakloak", "Potion"] } } },
  { player: "PlayerOne", title: "PlayerOne attached Basic Psychic Energy to Drakloak in the Active Spot.", expected: { self: { active: drakloak({ energy: ["Psychic"] }), hand: 5, known: [...openingSelf.slice(4), "Drakloak", "Potion"] } } },
  { player: "PlayerOne", title: "PlayerOne attached Forest Seal Stone to Drakloak in the Active Spot.", expected: { self: { active: drakloak({ energy: ["Psychic"], tool: "Forest Seal Stone" }), hand: 4, known: ["Double Turbo Energy", "Training Court", "Drakloak", "Potion"] } } },
  { player: "PlayerOne", title: "PlayerOne played Training Court to the Stadium spot.", expected: { stadium: "Training Court", self: { hand: 3, known: ["Double Turbo Energy", "Drakloak", "Potion"] } } },
  { player: "PlayerOne", title: "PlayerOne ended their turn.", expected: {} },
  { player: "PlayerTwo", title: "PlayerTwo drew a card.", expected: { opponent: { hand: 7 } } },
  { player: "PlayerTwo", title: "PlayerTwo played Buddy to the Bench.", expected: { opponent: { bench: [pokemon("Buddy")], hand: 6, known: openingOpponent.slice(2) } } },
  { player: "PlayerTwo", title: "PlayerTwo attached Basic Fire Energy to Rival in the Active Spot.", expected: { opponent: { active: pokemon("Rival", { energy: ["Fire"] }), hand: 5, known: openingOpponent.slice(3) } } },
  { player: "PlayerTwo", title: "PlayerTwo played Beach Court to the Stadium spot.", details: ["- PlayerOne discarded Training Court."], expected: { stadium: "Beach Court", self: { discard: ["Training Court", "Nest Ball"] }, opponent: { hand: 4, known: openingOpponent.slice(4) } } },
  { player: "PlayerTwo", title: "PlayerTwo's Rival used Tap on PlayerOne's Drakloak for 40 damage.", details: ["Damage breakdown:", "Base damage: 20 damage", "Brave Bangle: 20 damage", "Total damage: 40 damage"], expected: { self: { active: drakloak({ damage: 40, energy: ["Psychic"], tool: "Forest Seal Stone" }) } } },
  { player: "PlayerOne", title: "PlayerOne drew Potion.", expected: { self: { hand: 4, known: ["Double Turbo Energy", "Drakloak", "Potion", "Potion"] } } },
  { player: "PlayerOne", title: "PlayerOne played Potion.", details: ["- PlayerOne healed 20 damage from PlayerOne's Drakloak."], expected: { self: { active: drakloak({ damage: 20, energy: ["Psychic"], tool: "Forest Seal Stone" }), hand: 3, known: ["Double Turbo Energy", "Drakloak", "Potion"], discard: ["Potion", "Training Court", "Nest Ball"] } } },
  { player: "PlayerOne", title: "PlayerOne attached Double Turbo Energy to Drakloak in the Active Spot.", expected: { self: { active: drakloak({ damage: 20, energy: ["Psychic", "Double Turbo Energy"], tool: "Forest Seal Stone" }), hand: 2, known: ["Drakloak", "Potion"] } } },
  { player: "PlayerOne", title: "PlayerOne's Drakloak is now Confused.", expected: { self: { active: drakloak({ damage: 20, energy: ["Psychic", "Double Turbo Energy"], tool: "Forest Seal Stone", conditions: ["Confused"] }) } } },
  { player: "PlayerOne", title: "PlayerOne retreated Drakloak to Bench.", details: ["- Basic Psychic Energy was discarded from PlayerOne's Drakloak.", "- PlayerOne's Dreepy is now in the Active Spot."], expected: { self: { active: pokemon("Dreepy"), bench: [pokemon("Snorunt"), pokemon("Ralts"), drakloak({ damage: 20, energy: ["Double Turbo Energy"], tool: "Forest Seal Stone" })], discard: ["Basic Psychic Energy", "Potion", "Training Court", "Nest Ball"] } } },
  { player: "PlayerOne", title: "PlayerOne evolved Dreepy to Drakloak in the Active Spot.", expected: { self: { active: drakloak({ underlying: ["Dreepy"] }), hand: 1, known: ["Potion"] } } },
  { player: "PlayerOne", title: "PlayerTwo's Rival is now Poisoned.", expected: { opponent: { active: pokemon("Rival", { energy: ["Fire"], conditions: ["Poisoned"] }) } } },
  { player: "PlayerOne", title: "1 damage counter was placed on PlayerTwo's Rival for the Special Condition Poisoned.", expected: { opponent: { active: pokemon("Rival", { damage: 10, energy: ["Fire"], conditions: ["Poisoned"] }) } } },
  { player: "PlayerOne", title: "PlayerOne's Drakloak used Tap on PlayerTwo's Rival for 60 damage.", expected: { opponent: { active: pokemon("Rival", { damage: 70, energy: ["Fire"], conditions: ["Poisoned"] }) } } },
  { player: "PlayerOne", title: "PlayerTwo's Rival was Knocked Out!", details: ["- Basic Fire Energy was discarded from PlayerTwo's Rival."], expected: { opponent: { active: null, discard: ["Rival", "Basic Fire Energy"] } } },
  { player: "PlayerOne", title: "PlayerTwo's Buddy is now in the Active Spot.", expected: { opponent: { active: pokemon("Buddy"), bench: [] } } },
  { player: "PlayerOne", title: "PlayerOne took a Prize card.", details: ["Supply was added to PlayerOne's hand."], expected: { self: { hand: 2, known: ["Potion", "Supply"] } } },
  { player: "PlayerTwo", title: "PlayerTwo ended their turn.", expected: {} },
  { player: "PlayerOne", title: "PlayerOne shuffled 2 cards from their hand into their deck.", details: ["Potion, Supply"], expected: { self: { hand: 0, known: [] } } },
  { player: "PlayerOne", title: "PlayerOne drew 3 cards.", details: ["- Night Stretcher, Supply, Basic Psychic Energy"], expected: { self: { hand: 3, known: ["Night Stretcher", "Supply", "Basic Psychic Energy"] } } },
  { player: "PlayerOne", title: "PlayerOne played Night Stretcher.", details: ["- PlayerOne moved Basic Psychic Energy from their discard pile to their hand."], expected: { self: { hand: 3, known: ["Supply", "Basic Psychic Energy", "Basic Psychic Energy"], discard: ["Night Stretcher", "Potion", "Training Court", "Nest Ball"] } } },
  { player: "PlayerTwo", title: "PlayerTwo conceded the game.", expected: {} },
  { player: "PlayerOne", title: "PlayerOne wins the game.", expected: {} },
];

export const expectedGameChanges = steps.map(({ expected }) => expected);
export const canonicalReplayGame: ReplayLogSource = {
  id: "synthetic-complete-replay", date: "2026-10-01", result: "Win", format: "Synthetic",
  selfPlayerName: "PlayerOne", opponentPlayerName: "PlayerTwo", selfDeckName: "First deck", opponentDeckName: "Second deck",
  selfPrizesTaken: 1, opponentPrizesTaken: 0, totalTurns: 3,
  effectTags: {
    "PlayerOne played Nest Ball.": "item",
    "PlayerOne's Drakloak used Recon Directive.": "ability",
    "PlayerOne attached Forest Seal Stone to Drakloak in the Active Spot.": "tool",
    "PlayerOne played Potion.": "item",
    "PlayerOne played Night Stretcher.": "item",
  },
  sections: steps.reduce<ReplayLogSource["sections"]>((sections, step, index) => {
    if (!sections.length || sections.at(-1)!.player !== step.player) sections.push({
      title: step.player ? `${step.player}'s Turn` : "Setup", player: step.player,
      actions: [], prizesAfterTurn: { PlayerOne: index >= 28 ? 5 : 6, PlayerTwo: 6 },
    });
    sections.at(-1)!.actions.push({ title: step.title, details: step.details ?? [] });
    if (index === 27) sections.at(-1)!.prizesAfterTurn.PlayerOne = 5;
    return sections;
  }, []),
};
