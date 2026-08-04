import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const REQUIRED_CONFIRMATION = "NON_PRODUCTION_DISPOSABLE";
const requireConfiguredTarget = process.argv.includes("--require");
const safetyCheckOnly = process.argv.includes("--safety-check-only");
const databaseUrl = String(process.env.POKENOTES_TOURNAMENT_DB_TEST_URL || "").trim();
const anonKey = String(process.env.POKENOTES_TOURNAMENT_DB_TEST_ANON_KEY || "").trim();
const serviceRoleKey = String(
  process.env.POKENOTES_TOURNAMENT_DB_TEST_SERVICE_ROLE_KEY || ""
).trim();
const remoteConfirmation = String(
  process.env.POKENOTES_TOURNAMENT_DB_TEST_CONFIRM || ""
).trim();
const productionDatabaseUrl = String(
  process.env.POKENOTES_PRODUCTION_SUPABASE_URL || ""
).trim();
const productionProjectRef = String(
  process.env.POKENOTES_PRODUCTION_SUPABASE_PROJECT_REF || ""
).trim();
const targetProjectRef = String(
  process.env.POKENOTES_TOURNAMENT_DB_TEST_PROJECT_REF || ""
).trim();

function parseHttpUrl(value, variableName) {
  let parsedUrl;
  try {
    parsedUrl = new URL(value);
  } catch {
    throw new Error(`${variableName} must be a valid URL.`);
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error(`${variableName} must use HTTP or HTTPS.`);
  }

  return parsedUrl;
}

function canonicalProjectRef(value) {
  return String(value || "").trim().toLowerCase();
}

function projectRefFromUrl(url) {
  const match = url.hostname.toLowerCase().match(/^([a-z0-9-]+)\.supabase\.co$/);
  return match?.[1] || "";
}

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

const targetUrl = parseHttpUrl(databaseUrl, "POKENOTES_TOURNAMENT_DB_TEST_URL");

const loopbackHosts = new Set(["127.0.0.1", "::1", "localhost"]);
const isRemoteTarget = !loopbackHosts.has(targetUrl.hostname.toLowerCase());

if (isRemoteTarget) {
  if (!productionDatabaseUrl && !productionProjectRef) {
    throw new Error(
      "Remote database tests require canonical production identity via POKENOTES_PRODUCTION_SUPABASE_URL and/or POKENOTES_PRODUCTION_SUPABASE_PROJECT_REF."
    );
  }

  const productionUrl = productionDatabaseUrl
    ? parseHttpUrl(productionDatabaseUrl, "POKENOTES_PRODUCTION_SUPABASE_URL")
    : null;
  const canonicalTargetRefs = new Set(
    [canonicalProjectRef(targetProjectRef), projectRefFromUrl(targetUrl)].filter(Boolean)
  );
  const canonicalProductionRefs = new Set(
    [
      canonicalProjectRef(productionProjectRef),
      productionUrl ? projectRefFromUrl(productionUrl) : ""
    ].filter(Boolean)
  );
  let comparedCanonicalIdentity = false;

  if (productionUrl) {
    comparedCanonicalIdentity = true;
    if (targetUrl.origin === productionUrl.origin) {
      throw new Error("Refusing to run tournament database integration tests against production origin.");
    }
  }

  if (canonicalProductionRefs.size > 0 && canonicalTargetRefs.size > 0) {
    comparedCanonicalIdentity = true;
    if (
      [...canonicalProductionRefs].some((projectRef) => canonicalTargetRefs.has(projectRef))
    ) {
      throw new Error(
        "Refusing to run tournament database integration tests against production project ref."
      );
    }
  }

  if (!comparedCanonicalIdentity) {
    throw new Error(
      "Remote database target cannot be compared with the configured canonical production identity."
    );
  }

  if (remoteConfirmation !== REQUIRED_CONFIRMATION) {
    throw new Error(
      `Remote database tests require POKENOTES_TOURNAMENT_DB_TEST_CONFIRM=${REQUIRED_CONFIRMATION}.`
    );
  }
}

if (safetyCheckOnly) {
  console.log("PASS tournament database target safety checks");
  process.exit(0);
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
  assert.match(
    `${expectedCommitError.code || ""} ${expectedCommitError.message || ""}`,
    /22023|Deck list name is required/i,
    "Authenticated deck-list execute must reach the function body."
  );
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

  const { error: anonRoundExecuteError } = await anon.rpc("create_tournament_round", {
    ...roundArgs(`db-test-round-anon-${runId}`),
    p_tournament_id: roundTournamentId
  });
  assert.ok(anonRoundExecuteError, "Anonymous round execute must be denied.");
  assert.match(
    `${anonRoundExecuteError.code || ""} ${anonRoundExecuteError.message || ""}`,
    /42501|permission denied/i
  );
  const { error: anonDeckListExecuteError } = await anon.rpc(
    "commit_tournament_deck_list",
    {
      p_archetype_id: "charizard",
      p_deck_id: `db-test-deck-anon-${runId}`,
      p_deck_list: {
        id: `db-test-list-anon-${runId}`,
        name: "Anonymous",
        rawList: "1 Test Card TST 1",
        parsedCards: [],
        sortedCards: [],
        sortedCardsVersion: 2,
        updatedAt: timestamp
      },
      p_deck_name: "Charizard",
      p_deck_sprites: ["charizard"],
      p_format: "Standard",
      p_tournament_id: faultTournamentId,
      p_updated_at: timestamp
    }
  );
  assert.ok(anonDeckListExecuteError, "Anonymous deck-list execute must be denied.");
  assert.match(
    `${anonDeckListExecuteError.code || ""} ${anonDeckListExecuteError.message || ""}`,
    /42501|permission denied/i
  );
  assert.equal(roundOne.data === 1 || roundOne.data === 2, true);
  console.log("PASS both RPCs deny anonymous execute and allow authenticated execute");
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
