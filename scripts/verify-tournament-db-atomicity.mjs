import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const REQUIRED_CONFIRMATION = "NON_PRODUCTION_DISPOSABLE";
const requireConfiguredTarget = process.argv.includes("--require");
const databaseUrl = String(process.env.POKENOTES_TOURNAMENT_DB_TEST_URL || "").trim();
const anonKey = String(process.env.POKENOTES_TOURNAMENT_DB_TEST_ANON_KEY || "").trim();
const serviceRoleKey = String(
  process.env.POKENOTES_TOURNAMENT_DB_TEST_SERVICE_ROLE_KEY || ""
).trim();
const remoteConfirmation = String(
  process.env.POKENOTES_TOURNAMENT_DB_TEST_CONFIRM || ""
).trim();

function skipOrFail(message) {
  if (requireConfiguredTarget) {
    throw new Error(message);
  }

  console.log(`SKIP tournament database integration: ${message}`);
  process.exit(0);
}

if (!databaseUrl || !anonKey || !serviceRoleKey) {
  skipOrFail(
    "set POKENOTES_TOURNAMENT_DB_TEST_URL, POKENOTES_TOURNAMENT_DB_TEST_ANON_KEY, and POKENOTES_TOURNAMENT_DB_TEST_SERVICE_ROLE_KEY"
  );
}

let targetUrl;
try {
  targetUrl = new URL(databaseUrl);
} catch {
  throw new Error("POKENOTES_TOURNAMENT_DB_TEST_URL must be a valid URL.");
}

const loopbackHosts = new Set(["127.0.0.1", "::1", "localhost"]);
const configuredProductionUrls = [
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_URL,
  process.env.POKENOTES_PRODUCTION_SUPABASE_URL
]
  .map((value) => String(value || "").trim())
  .filter(Boolean);
const normalizedTargetUrl = databaseUrl.replace(/\/+$/, "");

if (
  configuredProductionUrls.some(
    (value) => value.replace(/\/+$/, "") === normalizedTargetUrl
  )
) {
  throw new Error("Refusing to run tournament database integration tests against a configured production URL.");
}

if (!loopbackHosts.has(targetUrl.hostname) && remoteConfirmation !== REQUIRED_CONFIRMATION) {
  throw new Error(
    `Remote database tests require POKENOTES_TOURNAMENT_DB_TEST_CONFIRM=${REQUIRED_CONFIRMATION}.`
  );
}

const clientOptions = {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false
  }
};
const admin = createClient(databaseUrl, serviceRoleKey, clientOptions);
const anon = createClient(databaseUrl, anonKey, clientOptions);
const runId = randomUUID();
const password = `${randomUUID()}Aa1!`;
const userIds = [];
const recordIds = {
  decks: [],
  tournaments: []
};

function authenticatedClient() {
  return createClient(databaseUrl, anonKey, clientOptions);
}

async function createTestUser(label) {
  const email = `pokenotes-tournament-${label}-${runId}@example.invalid`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password
  });

  assert.ifError(error);
  assert.ok(data.user?.id, `Expected ${label} test user id.`);
  userIds.push(data.user.id);

  return { email, id: data.user.id };
}

async function signIn(user) {
  const client = authenticatedClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: user.email,
    password
  });

  assert.ifError(error);
  assert.equal(data.user?.id, user.id);
  return client;
}

async function createTournament(userId, suffix, deckSprites = []) {
  const id = `db-test-tournament-${suffix}-${runId}`;
  const { error } = await admin.from("tournaments").insert({
    id,
    user_id: userId,
    name: `DB integration ${suffix}`,
    date_from: "2026-08-04",
    date_to: "2026-08-04",
    deck_sprites: deckSprites,
    format: "Standard"
  });

  assert.ifError(error);
  recordIds.tournaments.push(id);
  return id;
}

async function maybeSingle(table, column, value) {
  const { data, error } = await admin.from(table).select("*").eq(column, value).maybeSingle();
  assert.ifError(error);
  return data;
}

async function run() {
  const owner = await createTestUser("owner");
  const otherTenant = await createTestUser("other");
  const [ownerSessionOne, ownerSessionTwo, otherSession] = await Promise.all([
    signIn(owner),
    signIn(owner),
    signIn(otherTenant)
  ]);

  const faultTournamentId = await createTournament(owner.id, "fault", ["charizard"]);
  const faultDeckId = `db-test-deck-fault-${runId}`;
  const faultListId = `db-test-list-fault-${runId}`;
  recordIds.decks.push(faultDeckId);
  const timestamp = new Date().toISOString();
  const { error: expectedCommitError } = await ownerSessionOne.rpc(
    "commit_tournament_deck_list",
    {
      p_archetype_id: "charizard",
      p_deck_id: faultDeckId,
      p_deck_list: {
        id: faultListId,
        format: "Standard",
        rawList: "1 Test Card TST 1",
        parsedCards: [],
        sortedCards: [],
        sortedCardsVersion: 2,
        createdAt: timestamp,
        updatedAt: timestamp
      },
      p_deck_name: "Charizard",
      p_deck_sprites: ["charizard"],
      p_format: "Standard",
      p_tournament_id: faultTournamentId,
      p_updated_at: timestamp
    }
  );

  assert.ok(expectedCommitError, "The injected aggregate commit failure must reach the caller.");
  assert.equal(await maybeSingle("decks", "id", faultDeckId), null);
  assert.equal(await maybeSingle("deck_lists", "id", faultListId), null);
  const faultTournament = await maybeSingle("tournaments", "id", faultTournamentId);
  assert.equal(faultTournament.linked_deck_id, null);
  assert.equal(faultTournament.linked_deck_list_id, null);
  console.log("PASS aggregate failure rolls back deck, list, and tournament link");

  const roundTournamentId = await createTournament(owner.id, "rounds");
  const roundOneId = `db-test-round-a-${runId}`;
  const roundTwoId = `db-test-round-b-${runId}`;
  const roundArgs = (roundId) => ({
    p_notes: "",
    p_opponent_deck_name: "",
    p_opponent_deck_sprites: [],
    p_result: "W",
    p_round_id: roundId,
    p_tournament_id: roundTournamentId
  });
  const [roundOne, roundTwo] = await Promise.all([
    ownerSessionOne.rpc("create_tournament_round", roundArgs(roundOneId)),
    ownerSessionTwo.rpc("create_tournament_round", roundArgs(roundTwoId))
  ]);

  assert.ifError(roundOne.error);
  assert.ifError(roundTwo.error);
  assert.deepEqual([roundOne.data, roundTwo.data].sort((left, right) => left - right), [1, 2]);
  const { data: storedRounds, error: storedRoundsError } = await admin
    .from("tournament_rounds")
    .select("round_number")
    .eq("tournament_id", roundTournamentId)
    .order("round_number", { ascending: true });
  assert.ifError(storedRoundsError);
  assert.deepEqual(storedRounds.map((round) => round.round_number), [1, 2]);
  console.log("PASS concurrent sessions receive distinct sequential round numbers");

  const crossTenantDeckId = `db-test-deck-cross-tenant-${runId}`;
  recordIds.decks.push(crossTenantDeckId);
  const { data: crossTenantRound, error: crossTenantRoundError } = await otherSession.rpc(
    "create_tournament_round",
    roundArgs(`db-test-round-cross-tenant-${runId}`)
  );
  assert.ifError(crossTenantRoundError);
  assert.equal(crossTenantRound, null);
  const { data: crossTenantCommit, error: crossTenantCommitError } = await otherSession.rpc(
    "commit_tournament_deck_list",
    {
      p_archetype_id: "charizard",
      p_deck_id: crossTenantDeckId,
      p_deck_list: {
        id: `db-test-list-cross-tenant-${runId}`,
        name: "Cross tenant",
        format: "Standard",
        rawList: "1 Test Card TST 1",
        parsedCards: [],
        sortedCards: [],
        sortedCardsVersion: 2,
        createdAt: timestamp,
        updatedAt: timestamp
      },
      p_deck_name: "Charizard",
      p_deck_sprites: ["charizard"],
      p_format: "Standard",
      p_tournament_id: faultTournamentId,
      p_updated_at: timestamp
    }
  );
  assert.ifError(crossTenantCommitError);
  assert.equal(crossTenantCommit, "tournament-not-found");
  assert.equal(await maybeSingle("decks", "id", crossTenantDeckId), null);
  const crossTenantTarget = await maybeSingle("tournaments", "id", faultTournamentId);
  assert.equal(crossTenantTarget.linked_deck_id, null);
  assert.equal(crossTenantTarget.linked_deck_list_id, null);
  const { count: ownerRoundCount, error: ownerRoundCountError } = await admin
    .from("tournament_rounds")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", roundTournamentId);
  assert.ifError(ownerRoundCountError);
  assert.equal(ownerRoundCount, 2);
  console.log("PASS cross-tenant RPC calls cannot mutate owner data");

  const { error: anonExecuteError } = await anon.rpc("create_tournament_round", {
    ...roundArgs(`db-test-round-anon-${runId}`),
    p_tournament_id: roundTournamentId
  });
  assert.ok(anonExecuteError, "Anonymous execute must be denied.");
  assert.match(
    `${anonExecuteError.code || ""} ${anonExecuteError.message || ""}`,
    /42501|permission denied/i
  );
  assert.equal(roundOne.data === 1 || roundOne.data === 2, true);
  console.log("PASS anonymous execute is denied and authenticated execute is allowed");
}

async function cleanup() {
  if (recordIds.tournaments.length > 0) {
    const { error } = await admin.from("tournaments").delete().in("id", recordIds.tournaments);
    assert.ifError(error);
  }

  if (recordIds.decks.length > 0) {
    const { error } = await admin.from("decks").delete().in("id", recordIds.decks);
    assert.ifError(error);
  }

  const userDeletionResults = await Promise.all(
    userIds.map((userId) => admin.auth.admin.deleteUser(userId))
  );
  for (const { error } of userDeletionResults) {
    assert.ifError(error);
  }
}

try {
  await run();
  console.log("PASS tournament database integration suite completed");
} finally {
  await cleanup();
}
