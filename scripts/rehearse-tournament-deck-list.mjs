#!/usr/bin/env node

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.e2e.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  throw new Error("Run npm run e2e:local:setup before the Tournament Deck List rehearsal.");
}

const parsedUrl = new URL(url);
if (!["localhost", "127.0.0.1"].includes(parsedUrl.hostname) || parsedUrl.port !== "54321") {
  throw new Error(`Refusing non-local Supabase URL ${parsedUrl.origin}.`);
}

const service = createClient(url, serviceKey);
const email = `tournament-rehearsal-${Date.now()}@example.test`;
const password = `Local-Rehearsal-${Date.now()}!9x`;
let userId;
let tournamentId;

try {
  const { data: created, error: createUserError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });
  if (createUserError) throw createUserError;
  userId = created.user.id;

  const userClient = createClient(url, anonKey);
  const { error: signInError } = await userClient.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  tournamentId = crypto.randomUUID();
  const { data: tournament, error: insertError } = await service
    .from("tournaments")
    .insert({
      id: tournamentId,
      user_id: userId,
      name: "P1 workflow rehearsal",
      date_from: "2026-09-19",
      date_to: "2026-09-19",
      deck_name: "Mew / Dragapult",
      deck_sprites: ["mew-ex", "dragapult-ex"],
      format: "Standard",
      participation: "player",
      category: "",
      placement: "",
      notes: ""
    })
    .select("updated_at")
    .single();
  if (insertError) throw insertError;

  const requestId = crypto.randomUUID();
  const payload = {
    id: requestId,
    creationKey: requestId,
    name: "P1 workflow rehearsal",
    format: "Standard",
    date: "2026-09-19",
    createdBy: "Fixture",
    notes: "captured",
    rawList: "4 Mew ex",
    parsedCards: [{ name: "Mew ex", count: 4, category: "Pokemon" }],
    sortedCards: [{ name: "Mew ex", count: 4, category: "Pokemon" }],
    sortedCardsVersion: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const args = {
    p_tournament_id: tournamentId,
    p_request_id: requestId,
    p_payload: payload,
    p_expected_tournament_updated_at: tournament.updated_at,
    p_deck_name: "Mew / Dragapult",
    p_deck_sprites: ["mew-ex", "dragapult-ex"]
  };

  const first = await userClient.rpc("commit_tournament_deck_list", args);
  if (first.error) throw first.error;
  const replay = await userClient.rpc("commit_tournament_deck_list", args);
  if (replay.error) throw replay.error;
  if (replay.data.status !== "idempotent") {
    throw new Error(`Expected idempotent replay, got ${JSON.stringify(replay.data)}`);
  }

  const conflict = await userClient.rpc("commit_tournament_deck_list", {
    ...args,
    p_deck_name: "Conflict"
  });
  if (!conflict.error || conflict.error.code !== "23505") {
    throw new Error(`Expected conflicting request rejection, got ${JSON.stringify(conflict)}`);
  }

  const { data: listRows, error: listError } = await service
    .from("deck_lists")
    .select("id,deck_id,raw_list")
    .eq("user_id", userId)
    .eq("id", first.data.deckListId);
  if (listError) throw listError;
  if (listRows.length !== 1 || listRows[0].deck_id !== null) {
    throw new Error("Standalone Deck List was not persisted independently.");
  }

  const { data: snapshots, error: snapshotError } = await service
    .from("tournament_deck_list_snapshots")
    .select("id,source_deck_list_id,raw_list")
    .eq("tournament_id", tournamentId);
  if (snapshotError) throw snapshotError;
  if (snapshots.length !== 1 || snapshots[0].raw_list !== payload.rawList) {
    throw new Error("Snapshot evidence mismatch.");
  }

  const { error: deleteListError } = await service
    .from("deck_lists")
    .delete()
    .eq("user_id", userId)
    .eq("id", first.data.deckListId);
  if (deleteListError) throw deleteListError;
  const { data: preserved, error: preservedError } = await service
    .from("tournament_deck_list_snapshots")
    .select("id,raw_list")
    .eq("tournament_id", tournamentId);
  if (preservedError) throw preservedError;
  if (preserved.length !== 1 || preserved[0].raw_list !== payload.rawList) {
    throw new Error("Snapshot was not preserved after source deletion.");
  }

  const roundId = crypto.randomUUID();
  const roundArgs = {
    p_tournament_id: tournamentId,
    p_round_id: roundId,
    p_creation_key: crypto.randomUUID(),
    p_opponent_deck_name: "Rehearsal",
    p_opponent_deck_sprites: ["gardevoir-ex"],
    p_result: "Win",
    p_notes: "idempotent"
  };
  const round = await userClient.rpc("create_tournament_round_idempotent", roundArgs);
  if (round.error) throw round.error;
  const roundReplay = await userClient.rpc("create_tournament_round_idempotent", roundArgs);
  if (roundReplay.error) throw roundReplay.error;
  if (roundReplay.data.status !== "idempotent" || roundReplay.data.roundNumber !== round.data.roundNumber) {
    throw new Error("Tournament round replay did not return the original atomic number.");
  }
  const roundConflict = await userClient.rpc("create_tournament_round_idempotent", {
    ...roundArgs,
    p_notes: "conflict"
  });
  if (!roundConflict.error || roundConflict.error.code !== "23505") {
    throw new Error(`Expected conflicting round request rejection, got ${JSON.stringify(roundConflict)}`);
  }

  const { error: deleteTournamentError } = await service
    .from("tournaments")
    .delete()
    .eq("id", tournamentId)
    .eq("user_id", userId);
  if (deleteTournamentError) throw deleteTournamentError;
  const { data: removed, error: removedError } = await service
    .from("tournament_deck_list_snapshots")
    .select("id")
    .eq("tournament_id", tournamentId);
  if (removedError) throw removedError;
  if (removed.length !== 0) throw new Error("Snapshot did not cascade on Tournament deletion.");

  console.log("Tournament Deck List rehearsal passed: atomic create, replay, conflict, source deletion preservation, cascade.");
} finally {
  if (tournamentId) {
    await service.from("tournaments").delete().eq("id", tournamentId);
  }
  if (userId) {
    await service.auth.admin.deleteUser(userId);
  }
}
