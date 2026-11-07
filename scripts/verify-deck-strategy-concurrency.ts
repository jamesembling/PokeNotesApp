import assert from "node:assert/strict";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { commitDeckStrategy } from "@/lib/decks/strategy-service";

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

type StrategyClient = Parameters<typeof commitDeckStrategy>[0]["supabase"];

const runId = crypto.randomUUID().slice(0, 8);
const deckId = `strategy-concurrency-${runId}`;
let userId = "";

function strategyForm(version: string, next: Record<string, string>, saved: Record<string, string>) {
  const formData = new FormData();
  formData.set("expectedUpdatedAt", version);
  for (const [name, value] of Object.entries(next)) {
    formData.set(name, value);
  }
  for (const [name, value] of Object.entries(saved)) {
    formData.set(`expected${name[0].toUpperCase()}${name.slice(1)}`, value);
  }
  return formData;
}

async function deckVersion() {
  const { data, error } = await admin.from("decks").select("updated_at").eq("id", deckId).single();
  if (error) throw error;
  return data.updated_at as string;
}

async function main() {
  try {
    const email = `strategy-concurrency-${runId}@example.test`;
    const password = `Local-Strategy-${Date.now()}!9x`;
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    if (createError) throw createError;
    userId = created.user.id;

    const editor = createClient(apiUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { error: signInError } = await editor.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    const supabase = editor as StrategyClient;

    const { error: deckError } = await admin.from("decks").insert({
      id: deckId,
      user_id: userId,
      deck_name: "Strategy concurrency",
      core_strategy: "Opening plan",
      setup_goals: ["Bench two Dreepy"]
    });
    if (deckError) throw deckError;

    const loaded = {
      coreStrategy: "Opening plan",
      generalNotes: "",
      goPreference: "",
      resourcePlan: "",
      setupGoals: "Bench two Dreepy"
    };
    const viewedVersion = await deckVersion();

    // A Matchup commit from another tab advances only the Deck version.
    const { data: matchupStatus, error: matchupError } = await editor.rpc("commit_deck_aggregate_child", {
      p_deck_id: deckId,
      p_kind: "matchup",
      p_operation: "create",
      p_child: {
        id: `${deckId}-matchup`,
        deckName: "Opponent",
        deckPokemon: ["mew-ex"],
        format: "Standard",
        goPreference: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      p_expected_child_updated_at: null,
      p_updated_at: new Date().toISOString()
    });
    if (matchupError) throw matchupError;
    assert.equal(matchupStatus, "committed");
    assert.notEqual(await deckVersion(), viewedVersion, "the Matchup commit must advance the Deck version");

    const firstEdit = { ...loaded, coreStrategy: "Opening plan\nAttack turn two" };
    const { updatedAt } = await commitDeckStrategy({
      deckId,
      formData: strategyForm(viewedVersion, firstEdit, loaded),
      supabase,
      userId
    });
    assert.equal(updatedAt, await deckVersion(), "the retried save returns the committed Deck version");

    // A Strategy edit from another tab is still a conflict, even with a fresh Deck version guess.
    const { error: otherTabError } = await admin
      .from("decks")
      .update({ core_strategy: "Other tab plan", updated_at: new Date().toISOString() })
      .eq("id", deckId);
    if (otherTabError) throw otherTabError;
    await assert.rejects(
      commitDeckStrategy({
        deckId,
        formData: strategyForm(updatedAt, { ...firstEdit, generalNotes: "Late note" }, firstEdit),
        supabase,
        userId
      }),
      /changed in another tab/
    );

    const { data: stored, error: storedError } = await admin
      .from("decks")
      .select("core_strategy,general_notes,setup_goals")
      .eq("id", deckId)
      .single();
    if (storedError) throw storedError;
    assert.deepEqual(stored, {
      core_strategy: "Other tab plan",
      general_notes: "",
      setup_goals: ["Bench two Dreepy"]
    });

    console.log("Deck Strategy concurrency verified: unrelated Deck version changes retry; Strategy edits conflict.");
  } finally {
    await admin.from("deck_matchups").delete().eq("deck_id", deckId);
    await admin.from("decks").delete().eq("id", deckId);
    if (userId) {
      await admin.auth.admin.deleteUser(userId);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
