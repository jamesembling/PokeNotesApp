import assert from "node:assert/strict";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

const rootDir = resolve(import.meta.dirname, "..");
loadDotenv({ path: resolve(rootDir, ".env.e2e.local"), override: true });

const apiUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
const anonKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "");
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");

if (process.env.POKENOTES_E2E_LOCAL !== "1") {
  throw new Error("Refusing to run without the local E2E marker.");
}
const parsedApiUrl = new URL(apiUrl);
if (!["localhost", "127.0.0.1"].includes(parsedApiUrl.hostname) || parsedApiUrl.port !== "54321") {
  throw new Error(`Refusing non-local Supabase URL ${parsedApiUrl.origin}.`);
}
if (!anonKey || !serviceRoleKey) {
  throw new Error("The generated local E2E Supabase keys are missing.");
}

const admin = createClient(apiUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const anon = createClient(apiUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const runId = crypto.randomUUID();
const draftIds: string[] = [];
const logIds: string[] = [];
let secondaryUserId = "";

const immutableFacts = {
  selfPlayerName: "E2ETrainer",
  opponentPlayerName: "DraftVerifier",
  result: "Win",
  goOrder: "First",
  coinTossWon: true,
  language: "en",
  rawLog: `FormerTrainer won the coin toss.\ndraft-verifier-${runId}`,
  sections: [],
  totalTurns: 2,
  selfPrizesTaken: 1,
  opponentPrizesTaken: 0,
  selfAttackDamage: 60,
  opponentAttackDamage: 0,
  selfMulligans: 0,
  opponentMulligans: 0,
  reason: "Prizes"
};

type EditableReview = {
  selfDeckSlug: string;
  selfDeckSprites: string[];
  opponentDeckSlug: string;
  opponentDeckSprites: string[];
  date: string;
  format: string;
  linkedDeckId: string | null;
  linkedDeckListId: string | null;
  matchNotes: string | null;
};

const editable: EditableReview = {
  selfDeckSlug: "dragapult",
  selfDeckSprites: ["dragapult"],
  opponentDeckSlug: "charizard",
  opponentDeckSprites: ["charizard"],
  date: "2026-08-29",
  format: "Standard",
  linkedDeckId: null,
  linkedDeckListId: null,
  matchNotes: "Executable draft verification"
};

const resolved = {
  selfDeckName: "Dragapult",
  selfDeckSlug: "dragapult",
  selfDeckSprites: ["dragapult"],
  opponentDeckName: "Charizard",
  opponentDeckSlug: "charizard",
  opponentDeckSprites: ["charizard"]
};

async function requireFixtureUserId() {
  const email = String(process.env.POKE_NOTES_TEST_LOGIN_EMAIL || "");
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
  if (error) throw error;
  const user = data.users.find((candidate) => candidate.email === email);
  if (!user) throw new Error("The local E2E fixture user is missing. Reset the local stack first.");
  return user.id;
}

async function readStatistics(userId: string) {
  const { data, error } = await admin
    .from("user_log_stats")
    .select("games_played,games_won,games_lost,attack_damage,opponent_attack_damage,coin_flips_won,coin_flips_lost,mulligans_taken,prizes_taken,tracked_damage,tracked_prizes")
    .eq("user_id", userId)
    .single();
  if (error) throw error;
  return data;
}

async function insertDraft(userId: string, options: { expired?: boolean } = {}) {
  const id = crypto.randomUUID();
  const now = Date.now();
  const createdAt = new Date(now - (options.expired ? 120 : 1) * 60_000).toISOString();
  const expiresAt = new Date(now + (options.expired ? -60 : 30) * 60_000).toISOString();
  const { error } = await admin.from("battle_log_import_drafts").insert({
    id,
    user_id: userId,
    immutable_facts: immutableFacts,
    initial_editable: editable,
    created_at: createdAt,
    expires_at: expiresAt
  });
  if (error) throw error;
  draftIds.push(id);
  return id;
}

async function commit(args: {
  draftId: string;
  editable?: EditableReview;
  idempotencyKey: string;
  userId: string;
}) {
  return admin.rpc("commit_battle_log_import_draft", {
    p_user_id: args.userId,
    p_draft_id: args.draftId,
    p_idempotency_key: args.idempotencyKey,
    p_editable: args.editable ?? editable,
    p_resolved: resolved
  });
}

async function expectRpcFailure(
  operation: ReturnType<typeof commit>,
  expectedMessage: RegExp
) {
  const { error } = await operation;
  assert(error, "Expected the database operation to fail.");
  assert.match(error.message, expectedMessage);
}

async function main() {
  const ownerUserId = await requireFixtureUserId();
  const baselineStatistics = await readStatistics(ownerUserId);
  const secondaryEmail = `draft-verifier-${runId}@pokenotes.local`;
  const { data: secondaryUser, error: secondaryUserError } =
    await admin.auth.admin.createUser({ email: secondaryEmail, email_confirm: true });
  if (secondaryUserError || !secondaryUser.user) {
    throw secondaryUserError ?? new Error("Could not create the secondary local verifier user.");
  }
  secondaryUserId = secondaryUser.user.id;

  const privateDraftId = await insertDraft(ownerUserId);
  const { error: anonReadError } = await anon
    .from("battle_log_import_drafts")
    .select("id")
    .eq("id", privateDraftId);
  assert(anonReadError, "Anonymous callers must not be able to read import drafts.");

  await expectRpcFailure(
    commit({
      draftId: privateDraftId,
      idempotencyKey: crypto.randomUUID(),
      userId: secondaryUserId
    }),
    /different account/i
  );

  const expiredDraftId = await insertDraft(ownerUserId, { expired: true });
  await expectRpcFailure(
    commit({
      draftId: expiredDraftId,
      idempotencyKey: crypto.randomUUID(),
      userId: ownerUserId
    }),
    /expired/i
  );

  const retryDraftId = await insertDraft(ownerUserId);
  await expectRpcFailure(
    commit({
      draftId: retryDraftId,
      editable: { ...editable, linkedDeckId: `missing-${runId}` },
      idempotencyKey: crypto.randomUUID(),
      userId: ownerUserId
    }),
    /unavailable/i
  );
  const { data: retryData, error: retryError } = await commit({
    draftId: retryDraftId,
    idempotencyKey: crypto.randomUUID(),
    userId: ownerUserId
  });
  if (retryError) throw retryError;
  assert.equal(retryData?.status, "created");
  logIds.push(String(retryData?.battleLogId));

  const concurrentDraftId = await insertDraft(ownerUserId);
  const idempotencyKey = crypto.randomUUID();
  const concurrentResults = await Promise.all([
    commit({ draftId: concurrentDraftId, idempotencyKey, userId: ownerUserId }),
    commit({ draftId: concurrentDraftId, idempotencyKey, userId: ownerUserId })
  ]);
  for (const result of concurrentResults) {
    if (result.error) throw result.error;
  }
  assert.deepEqual(
    concurrentResults.map(({ data }) => data?.status).sort(),
    ["created", "replay"]
  );
  const concurrentLogId = String(concurrentResults[0]?.data?.battleLogId);
  assert.equal(concurrentResults[1]?.data?.battleLogId, concurrentLogId);
  logIds.push(concurrentLogId);

  await expectRpcFailure(
    commit({
      draftId: concurrentDraftId,
      editable: { ...editable, matchNotes: "conflicting retry" },
      idempotencyKey,
      userId: ownerUserId
    }),
    /different review values/i
  );

  const { data: savedLogs, error: savedLogsError } = await admin
    .from("logs")
    .select("id,result,total_turns,raw_log,coin_toss_won,self_player_name")
    .in("id", logIds);
  if (savedLogsError) throw savedLogsError;
  assert.equal(savedLogs.length, 2);
  for (const log of savedLogs) {
    assert.equal(log.result, "Win");
    assert.equal(log.total_turns, 2);
    assert.equal(log.raw_log, immutableFacts.rawLog);
    assert.equal(log.self_player_name, "E2ETrainer");
    assert.equal(log.coin_toss_won, true);
  }

  // The raw alternate username differs from the canonical stored player name.
  // A successful replay must not count twice, and the stored toss fact must win.
  assert.deepEqual(await readStatistics(ownerUserId), {
    ...baselineStatistics,
    games_played: baselineStatistics.games_played + 2,
    games_won: baselineStatistics.games_won + 2,
    attack_damage: baselineStatistics.attack_damage + 120,
    coin_flips_won: baselineStatistics.coin_flips_won + 2,
    prizes_taken: baselineStatistics.prizes_taken + 2,
    tracked_damage: baselineStatistics.tracked_damage + 120,
    tracked_prizes: baselineStatistics.tracked_prizes + 2
  });

  const { error: deletionError } = await admin.from("logs").delete().in("id", logIds);
  if (deletionError) throw deletionError;
  logIds.length = 0;
  assert.deepEqual(await readStatistics(ownerUserId), baselineStatistics);

  console.log(
    "Battle Log import draft verification passed: privacy, ownership, expiry, rollback/retry, atomic concurrency, replay, conflict rejection, immutable persistence, alternate-username statistics, and deletion reconciliation."
  );
}

async function run() {
  try {
    await main();
  } finally {
    if (logIds.length > 0) {
      await admin.from("logs").delete().in("id", logIds);
    }
    if (draftIds.length > 0) {
      await admin.from("battle_log_import_drafts").delete().in("id", draftIds);
    }
    if (secondaryUserId) {
      await admin.auth.admin.deleteUser(secondaryUserId);
    }
  }
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
