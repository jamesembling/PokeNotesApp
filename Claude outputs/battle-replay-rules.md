# Battle Replay game rules

**Owner:** James · **Status:** Draft for review · **Applies to:** `lib/battle-replay/**`

## Why this file exists

Battle Replay should show what actually happened in the game, as completely as the rules of the Pokémon TCG allow. The rules below are **facts about how the game works, not guesses**. The replay must apply them.

Where this file conflicts with the "never infer" guidance in `docs/battle-replay-productisation.md`, **this file wins**.

---

## 1. What to show: three levels

| Level | When | How it looks |
| --- | --- | --- |
| **Known** | The log says it, or a game rule below makes it certain | Shown plainly |
| **Probable** | The best available evidence picks one answer (for example the most likely printing) | Shown, with a small "probably" label |
| **Unknown** | Information the game genuinely hides | Shown as "?" |

- Uncertainty must stay **local**. One unclear action affects only the card, player and zones it could have touched.
- Never blank a whole board, both players, or the rest of the game because one line was unclear.
- As soon as later log lines make something certain again, show it again.

## 2. Setup

- Every deck is **60 cards**. Every opening hand is **7 cards**. Each player sets aside **6 Prize cards**.
- **Mulligan:** the hand goes back into the deck and the player draws a new 7. PTCGL does **not** log the redraw. Assume it happened.
- **Bonus draws for the other player:** `X drew N more card(s) because Y took at least 1 mulligan` means N cards drawn from X's deck into X's hand. It is never a card name.
- `Cards revealed from Mulligan N` followed by a `•` list shows the revealed hand. It changes no counts beyond the mulligan itself.

## 3. Zones and counting

- **Deck = 60 − hand − Prizes − cards in play − discard pile.**
- Cards in play include:
  - every card in an evolution stack
  - attached Energy and Tools
  - the Stadium, which counts for its owner
- A played **Item** or **Supporter** goes to its owner's discard pile once it has been used.
- A **Tool** stays attached to its Pokémon until the log says it was discarded.
- When a new **Stadium** is played, the previous one goes to **its owner's** discard pile.
- A knocked-out Pokémon goes to its owner's discard pile with **everything under and attached to it**.
- Taking a Prize moves a card from Prizes to hand.

## 4. The board

- After setup, each player always has **exactly one Active Pokémon**. The only exception is the brief moment after a knockout or retreat, until the replacement is promoted.
- The Bench holds up to **5** Pokémon unless a card in play says otherwise.
- **Evolving** keeps damage and attachments, removes Special Conditions, and lets the new Pokémon use its Ability that turn.
- Moving from the Active Spot to the Bench (retreat or switch) removes Special Conditions.

## 5. Turn rules

These limits apply unless a card in play says otherwise.

**Turn limits**

| Action | Limit |
| --- | --- |
| Supporter | 1 per turn |
| Energy attached from hand (the normal attachment) | 1 per turn |
| Stadium | 1 per turn. It can't be played if a Stadium with the same name is already in play |
| Retreat | 1 per turn |
| Attack | 1 per turn, and attacking ends the turn |
| Ability with "Once during your turn" | 1 per turn for each copy of that Pokémon |

Card effects can override these limits. For example, Festival Lead lets Dipplin attack twice, and Seething Spirit attaches extra Energy.

**First turns**

- The player who goes **first** can't play a Supporter on their first turn, unless the card says it can.
- The player who goes **first** can't attack on their first turn.
- **No Pokémon can evolve** during either player's first turn.
- A Pokémon can't evolve on the turn it was put into play. This applies to Rare Candy too.

**Deck building**

- A deck can't contain more than **4 cards with the same name**, except Basic Energy.
- A deck can contain only **1 ACE SPEC** card.

### How the replay uses these rules

1. **To settle which copy was affected.** For example, if two Dreepy are on the Bench and one was played this turn, the Dreepy that evolved must be the other one.
2. **As a check, not a correction.** If the log shows something these rules don't allow, the **log wins**. A card effect probably allowed it. The replay should still show what the log says, and flag the action for review if no card in play explains it.

## 6. Attacks, damage and knockouts

- Attack damage goes to the **opponent's Active Pokémon** unless the log names a different target.
- One damage counter is **10 damage**.
- **Damage-counter lines:** in `X put N damage counters on X's Pokémon`, the name before "'s" is the player whose effect it is, **not** the Pokémon's owner.
  - Damage counters from an attack or Ability go on the **opponent's** Pokémon. Phantom Dive is an example.
  - For neutral effects such as Risky Ruins, the target is the Pokémon that triggered the effect.
- **Damage breakdowns** explain the total that was already dealt. Never add them again.
  - Read the whole action before applying it. In Festival Lead, the breakdown appears **before** the attack line it belongs to.
- A Pokémon is knocked out when its damage reaches its HP.
- **Special Conditions:**
  - Poisoned: 10 damage at each checkup.
  - Burned: 20 damage at each checkup.
  - Asleep, Paralyzed and Confused replace each other.

## 7. Pokémon with the same name

1. If the copies are **identical** (same damage, attachments, conditions and stack), either one can be used. The result is the same.
2. If they differ, use the rules to decide:
   - Attacks without a named target hit the copy in the **Active Spot**.
   - The copy that was **knocked out** is the one whose damage reached its HP.
   - An effect triggered by playing a Pokémon applies to the copy that was **just played**.
3. If it is still unclear:
   - Keep the **correct number of Pokémon with the correct names** on the board.
   - Mark only that Pokémon's damage or attachments as "?".
   - **Never** leave a knocked-out Pokémon on the board.
   - **Never** leave the Active Spot empty when the log names the new Active Pokémon.

## 8. Card information (HP, artwork, text)

- Use the card catalogue for HP, artwork, attacks and Abilities.
- If every printing of a card has the same HP, show that HP as **known**.
- If printings differ, choose in this order:
  1. the printing in the player's linked deck list
  2. the most recent printing legal in the game's format
- Label that choice **"probably"**.
- **Maximum HP stays visible even when the damage is unknown.** Show the damage as "?" instead of hiding the HP.
- Only hide HP when a card in play is known to change HP **and** that effect cannot be worked out.
- Catalogue card text **may** be used to decide where cards come from or go. For example:
  - Seething Spirit attaches Energy from the discard pile.
  - Crispin attaches Energy from the deck.
  - Night Stretcher returns a card from the discard pile.

## 9. Information that is genuinely hidden

These, and only these, should normally show as unknown:

- the cards in the opponent's hand, unless the log revealed them
- face-down Prize cards, until they are taken and named
- the order of the deck
- cards drawn without being named in the log

## 10. How success is measured

1. Choose **3 reference games** from real saved logs.
2. Someone other than the replay author (James or an independent reviewer) writes the correct board for **both players** at the end of every turn:
   - Active and Bench Pokémon, their damage and attachments
   - hand, deck, Prizes and discard pile counts
   - the Stadium
3. Each change is reported in plain English, for example: "Of 136 actions: 130 correct, 0 wrong, 6 genuinely hidden."
4. **Wrong must be 0.** "Unknown" is only allowed for the hidden information in section 9.
5. Tests must use **real PTCGL wording** copied from saved logs, never invented sentences.

---

## Appendix: real PTCGL wording to support

```text
O took a mulligan.
- Cards revealed from Mulligan 1
• Boss's Orders, Ultra Ball, Gwynn, Banette, Poké Pad, Switch, Gwynn
S drew 1 more card because O took at least 1 mulligan.

S's Dragapult ex used Phantom Dive on O's Lillie's Clefairy ex for 200 damage.
- S put 6 damage counters on S's Meowth ex.        ← this is O's Meowth ex

Risky Ruins was activated.
- O put 2 damage counters on S's Applin.           ← this is O's Applin

O's Dipplin used Festival Lead.
- Damage breakdown:
• 5 Benched Pokémon: 100 damage
- O's Dipplin used Do the Wave on S's Munkidori for 100 damage.
- O chose Do the Wave

O played Kieran.
- O's Dipplin was switched with O's Thwackey to become the Active Pokémon.
O's Dipplin is now in the Active Spot.
```
