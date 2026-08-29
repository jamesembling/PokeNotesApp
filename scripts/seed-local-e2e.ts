import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { interpretDeckList } from "@/lib/decks/deck-list-parse";
import { sortDeckListCardsLocally } from "@/lib/deck-lists/local-sort";
import { CANONICAL_DECK_LIST_SORT_VERSION } from "@/lib/deck-lists/version";
import { buildLocalE2EBattleLogFixture } from "@/scripts/local-e2e-battle-log-fixture";
import type { Database, Json } from "@/types/supabase";

const rootDir = resolve(import.meta.dirname, "..");
const apiUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const email = String(process.env.POKE_NOTES_TEST_LOGIN_EMAIL || "");
const password = String(process.env.POKE_NOTES_TEST_LOGIN_PASSWORD || "");

assertLocalOnly();

const client = createClient<Database>(apiUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const verificationClient = createClient(apiUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const now = "2026-08-21T09:00:00.000Z";
let userId = "";
let rawDeckList = "";
let parsedCards: ReturnType<typeof interpretDeckList>["cards"] = [];
let sortedCards: ReturnType<typeof sortDeckListCardsLocally> = [];
let battleLogFixtures: Record<
  "Loss" | "Win",
  ReturnType<typeof buildLocalE2EBattleLogFixture>
>;

async function main() {
  rawDeckList = await readFile(
    resolve(rootDir, "tests/e2e/fixtures/deck-list-valid.txt"),
    "utf8",
  );
  const [rawWinBattleLog, rawLossBattleLog] = await Promise.all([
    readFile(
      resolve(rootDir, "tests/e2e/fixtures/battle-log-valid.txt"),
      "utf8",
    ),
    readFile(
      resolve(rootDir, "tests/e2e/fixtures/battle-log-loss-valid.txt"),
      "utf8",
    ),
  ]);
  parsedCards = interpretDeckList(rawDeckList).cards;
  sortedCards = sortDeckListCardsLocally(parsedCards);
  battleLogFixtures = {
    Win: buildLocalE2EBattleLogFixture({
      ptcglUsername: "E2ETrainer",
      rawLog: rawWinBattleLog,
    }),
    Loss: buildLocalE2EBattleLogFixture({
      ptcglUsername: "E2ETrainer",
      rawLog: rawLossBattleLog,
    }),
  };

  const { data: createdUser, error: createUserError } =
    await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: "E2E Trainer",
        given_name: "E2E",
        family_name: "Trainer",
      },
    });
  if (createUserError || !createdUser.user) {
    throw new Error(
      `Could not create local fixture user: ${createUserError?.message || "missing user"}`,
    );
  }
  userId = createdUser.user.id;

  await insert("profiles", {
    id: userId,
    display_name: "E2E Trainer",
    first_name: "E2E",
    last_name: "Trainer",
    email,
    ptcgl_username: "E2ETrainer",
    role: "user",
    avatar_color: "purple",
    auth_account_created_at: now,
    last_login_at: now,
    last_active_at: now,
    login_count: 3,
    created_at: now,
    updated_at: now,
  });

  await insertMany("pokemon_catalog", [
    pokemon("dreepy", "Dreepy", 885, "Basic", null),
    pokemon("drakloak", "Drakloak", 886, "Stage 1", "dreepy"),
    pokemon("dragapult", "Dragapult", 887, "Stage 2", "drakloak"),
    pokemon("munkidori", "Munkidori", 1015, "Basic", null),
    pokemon("charmander", "Charmander", 4, "Basic", null),
    pokemon("charmeleon", "Charmeleon", 5, "Stage 1", "charmander"),
    pokemon("charizard", "Charizard", 6, "Stage 2", "charmeleon"),
    pokemon("ralts", "Ralts", 280, "Basic", null),
    pokemon("kirlia", "Kirlia", 281, "Stage 1", "ralts"),
    pokemon("gardevoir", "Gardevoir", 282, "Stage 2", "kirlia"),
  ]);

  const attachedList = deckListValue(
    "e2e-list-attached",
    "League Cup List",
    "2026-08-18",
  );
  const matchup = {
    id: "e2e-matchup-charizard",
    deckName: "Charizard ex",
    deckPokemon: ["charizard"],
    format: "Standard",
    goPreference: "Second",
    matchupFavor: "Even",
    idealBench: "Dreepy, Dreepy, Munkidori",
    techsNeeded: "Conserve Boss's Orders",
    matchupPlan: "Pressure the active while building a second Dragapult.",
    createdAt: now,
    updatedAt: now,
  };

  await insertMany("decks", [
    {
      id: "e2e-deck-dragapult",
      user_id: userId,
      deck_name: "Dragapult Fixture",
      archetype_id: "dragapult",
      format: "Standard",
      go_preference: "First",
      deck_pokemon: ["dragapult", "munkidori"],
      core_strategy: "Spread damage, then close with precise prize mapping.",
      general_notes:
        "Stable record for browser journeys; safe to edit or delete after reset.",
      setup_goals: ["Open Dreepy", "Establish two attackers"],
      resource_plan: "Protect recovery and count switch outs.",
      deck_lists: [attachedList],
      matchups: [matchup],
      created_at: now,
      updated_at: now,
    },
    {
      id: "e2e-deck-spare",
      user_id: userId,
      deck_name: "Gardevoir Fixture",
      archetype_id: "gardevoir",
      format: "Standard",
      go_preference: "Second",
      deck_pokemon: ["gardevoir"],
      core_strategy: "Build a resilient board and trade efficiently.",
      general_notes:
        "Second fixture makes selectors and list/tile views meaningful.",
      setup_goals: ["Fill the bench"],
      resource_plan: "Track Psychic Energy.",
      deck_lists: [],
      matchups: [],
      created_at: now,
      updated_at: now,
    },
  ]);

  await insertMany("deck_lists", [
    deckListRow(
      "e2e-list-attached",
      "e2e-deck-dragapult",
      "League Cup List",
      "2026-08-18",
      0,
    ),
    deckListRow(
      "e2e-list-standalone",
      null,
      "Standalone Testing List",
      "2026-08-20",
      1,
    ),
  ]);

  await insert("deck_matchups", {
    id: matchup.id,
    deck_id: "e2e-deck-dragapult",
    user_id: userId,
    deck_name: matchup.deckName,
    deck_pokemon: matchup.deckPokemon,
    format: matchup.format,
    go_preference: matchup.goPreference,
    matchup_favor: matchup.matchupFavor,
    ideal_bench: matchup.idealBench,
    techs_needed: matchup.techsNeeded,
    matchup_plan: matchup.matchupPlan,
    position: 0,
    created_at: now,
    updated_at: now,
  });

  await insert("tournaments", {
    id: "e2e-tournament-local-cup",
    user_id: userId,
    name: "Fixture League Cup",
    date_from: "2026-08-15",
    date_to: "2026-08-15",
    linked_deck_id: "e2e-deck-dragapult",
    linked_deck_list_id: "e2e-list-attached",
    deck_name: "Dragapult Fixture",
    deck_sprites: ["dragapult", "munkidori"],
    category: "cup",
    placement: "t8",
    format: "Standard",
    notes: "Synthetic tournament for create, edit, deck-list and round flows.",
    created_at: now,
    updated_at: now,
  });

  await insert("tournament_rounds", {
    id: "e2e-round-1",
    tournament_id: "e2e-tournament-local-cup",
    user_id: userId,
    round_number: 1,
    opponent_deck_name: "Charizard ex",
    opponent_deck_sprites: ["charizard"],
    result: "Win",
    notes: "Fixture round ready to view and edit.",
    created_at: now,
    updated_at: now,
  });

  await insertMany("logs", [
    logRow({
      id: "e2e-log-win-charizard",
      date: "2026-08-19",
      result: "Win",
      opponentName: "Charizard ex",
      opponentSlug: "charizard-ex",
      opponentSprites: "charizard",
      linkedDeckId: "e2e-deck-dragapult",
      linkedDeckListId: "e2e-list-attached",
      notes: "Boss around the single-prize pivot next time.",
    }),
    logRow({
      id: "e2e-log-loss-gardevoir",
      date: "2026-08-20",
      result: "Loss",
      opponentName: "Gardevoir ex",
      opponentSlug: "gardevoir-ex",
      opponentSprites: "gardevoir",
      linkedDeckId: "e2e-deck-dragapult",
      linkedDeckListId: "e2e-list-attached",
      notes: null,
    }),
    logRow({
      id: "e2e-log-win-standalone",
      date: "2026-08-21",
      result: "Win",
      opponentName: "Charizard ex",
      opponentSlug: "charizard-ex",
      opponentSprites: "charizard",
      linkedDeckId: null,
      linkedDeckListId: "e2e-list-standalone",
      notes:
        "This log exercises a first-class list without a strategy association.",
    }),
  ]);

  await assertCount("decks", 2, userId);
  await assertCount("deck_lists", 2, userId);
  await assertCount("logs", 3, userId);
  await assertCount("tournaments", 1, userId);
  await assertCount("user_log_stats", 1, userId);
  await assertCount("deck_log_stats", 1, userId);
  await assertCount("user_archetype_matchup_stats", 2, userId);

  console.log(
    "Seeded one synthetic account with 2 decks, 2 lists, 1 matchup, 1 tournament, 1 round, and 3 logs.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

function assertLocalOnly() {
  if (process.env.POKENOTES_E2E_LOCAL !== "1") {
    throw new Error("Refusing to seed without POKENOTES_E2E_LOCAL=1.");
  }
  const url = new URL(apiUrl);
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.port !== "54321"
  ) {
    throw new Error(`Refusing to seed non-local Supabase URL ${url.origin}.`);
  }
  if (!serviceRoleKey || !email || !password) {
    throw new Error("Local seed credentials are incomplete.");
  }
}

function pokemon(
  slug: string,
  label: string,
  nationalDex: number,
  stage: string,
  evolvesFrom: string | null,
) {
  return {
    slug,
    label,
    national_dex: nationalDex,
    stage,
    evolves_from: evolvesFrom,
    sprite_url: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${nationalDex}.png`,
    last_synced_at: now,
  };
}

function deckListValue(id: string, name: string, date: string) {
  return {
    id,
    name,
    format: "Standard",
    date,
    createdBy: "E2E Trainer",
    notes: "Synthetic list fixture.",
    rawList: rawDeckList,
    parsedCards,
    sortedCards,
    sortedCardsVersion: CANONICAL_DECK_LIST_SORT_VERSION,
    createdAt: now,
    updatedAt: now,
  };
}

function deckListRow(
  id: string,
  deckId: string | null,
  name: string,
  date: string,
  position: number,
) {
  return {
    id,
    deck_id: deckId,
    user_id: userId,
    creation_key: `fixture:${id}`,
    name,
    format: "Standard",
    date,
    created_by: "E2E Trainer",
    notes: "Synthetic list fixture.",
    raw_list: rawDeckList,
    parsed_cards: parsedCards as unknown as Json,
    sorted_cards: sortedCards as unknown as Json,
    sorted_cards_version: CANONICAL_DECK_LIST_SORT_VERSION,
    position,
    created_at: now,
    updated_at: now,
  };
}

function logRow(args: {
  id: string;
  date: string;
  result: "Win" | "Loss";
  opponentName: string;
  opponentSlug: string;
  opponentSprites: string;
  linkedDeckId: string | null;
  linkedDeckListId: string | null;
  notes: string | null;
}) {
  const fixture = battleLogFixtures[args.result];

  return {
    id: args.id,
    user_id: userId,
    date: args.date,
    result: args.result,
    format: "Standard",
    go_order: fixture.goOrder,
    self_player_name: fixture.selfPlayerName,
    self_deck_name: "Dragapult Fixture",
    self_deck_slug: "dragapult-ex",
    self_deck_sprites: "dragapult,munkidori",
    opponent_player_name: fixture.opponentPlayerName,
    opponent_deck_name: args.opponentName,
    opponent_deck_slug: args.opponentSlug,
    opponent_deck_sprites: args.opponentSprites,
    total_turns: fixture.totalTurns,
    coin_toss_won: fixture.coinTossWon,
    self_prizes_taken: fixture.selfPrizesTaken,
    opponent_prizes_taken: fixture.opponentPrizesTaken,
    self_attack_damage: fixture.selfAttackDamage,
    opponent_attack_damage: fixture.opponentAttackDamage,
    self_mulligans: fixture.selfMulligans,
    opponent_mulligans: fixture.opponentMulligans,
    linked_deck_id: args.linkedDeckId,
    linked_deck_list_id: args.linkedDeckListId,
    reason: fixture.reason,
    raw_log: fixture.rawLog,
    sections: fixture.sections,
    match_notes: args.notes,
    imported_at: `${args.date}T18:00:00.000Z`,
    created_at: `${args.date}T18:00:00.000Z`,
    updated_at: `${args.date}T18:00:00.000Z`,
  };
}

async function insert<Table extends keyof Database["public"]["Tables"]>(
  table: Table,
  row: Database["public"]["Tables"][Table]["Insert"],
) {
  const { error } = await client.from(table).insert(row as never);
  if (error)
    throw new Error(`Could not seed ${String(table)}: ${error.message}`);
}

async function insertMany<Table extends keyof Database["public"]["Tables"]>(
  table: Table,
  rows: Database["public"]["Tables"][Table]["Insert"][],
) {
  const { error } = await client.from(table).insert(rows as never);
  if (error)
    throw new Error(`Could not seed ${String(table)}: ${error.message}`);
}

async function assertCount(
  table: keyof Database["public"]["Tables"],
  expected: number,
  ownerId: string,
) {
  const { count, error } = await verificationClient
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("user_id", ownerId);
  if (error)
    throw new Error(`Could not verify ${String(table)}: ${error.message}`);
  if (count !== expected) {
    throw new Error(
      `Expected ${expected} ${String(table)} rows, found ${count ?? "unknown"}.`,
    );
  }
}
