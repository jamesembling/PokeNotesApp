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
const users = [];
const tournaments = [];

async function makeUser(label) {
  const email = `tournament-rehearsal-${label}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.test`;
  const password = `Local-Rehearsal-${Date.now()}!9x`;
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });
  if (createError) throw createError;
  users.push(created.user.id);
  const client = createClient(url, anonKey);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: created.user.id, client };
}

async function makeTournament(userId, name) {
  const id = crypto.randomUUID();
  const { error } = await service.from("tournaments").insert({
    id,
    user_id: userId,
    name,
    date_from: "2026-09-19",
    date_to: "2026-09-19",
    deck_name: "Mew / Dragapult",
    deck_sprites: ["mew-ex", "dragapult-ex"],
    format: "Standard",
    participation: "player",
    category: "",
    placement: "",
    notes: ""
  });
  if (error) throw error;
  tournaments.push(id);
  return id;
}

async function tournamentVersion(id) {
  const { data, error } = await service.from("tournaments").select("updated_at").eq("id", id).single();
  if (error) throw error;
  return data.updated_at;
}

async function assertOne(query, message) {
  const { data, error } = await query;
  if (error) throw error;
  if (!data || data.length !== 1) throw new Error(message);
  return data[0];
}

const primary = await makeUser("owner");
const other = await makeUser("other");
const tournamentId = await makeTournament(primary.id, "P1 workflow rehearsal");
const sourceTournamentId = await makeTournament(primary.id, "Existing source capture");
const staleTournamentId = await makeTournament(primary.id, "Stale rollback");
const metadataTournamentId = crypto.randomUUID();
tournaments.push(metadataTournamentId);

try {
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
    p_expected_tournament_updated_at: await tournamentVersion(tournamentId),
    p_deck_name: "Mew / Dragapult",
    p_deck_sprites: ["mew-ex", "dragapult-ex"]
  };
  const first = await primary.client.rpc("commit_tournament_deck_list", args);
  if (first.error) throw first.error;
  const replay = await primary.client.rpc("commit_tournament_deck_list", args);
  if (replay.error || replay.data.status !== "idempotent") throw replay.error || new Error("Standalone replay was not idempotent.");
  const replaceModeConflict = await primary.client.rpc("commit_tournament_deck_list", { ...args, p_allow_replace: true });
  if (!replaceModeConflict.error || replaceModeConflict.error.code !== "23505") throw new Error("Replace mode was omitted from capture replay identity.");
  const conflict = await primary.client.rpc("commit_tournament_deck_list", { ...args, p_deck_name: "Conflict" });
  if (!conflict.error || conflict.error.code !== "23505") throw new Error(`Expected list conflict rejection, got ${JSON.stringify(conflict)}`);

  const firstList = await assertOne(service.from("deck_lists").select("id,deck_id,raw_list").eq("user_id", primary.id).eq("id", first.data.deckListId), "Standalone Deck List was not persisted.");
  if (firstList.deck_id !== null || firstList.raw_list !== payload.rawList) throw new Error("Standalone Deck List was not independent or complete.");
  const initialSnapshot = await assertOne(service.from("tournament_deck_list_snapshots").select("id,source_deck_list_id,raw_list").eq("tournament_id", tournamentId), "Initial snapshot was not persisted.");
  if (initialSnapshot.source_deck_list_id !== first.data.deckListId) throw new Error("Initial snapshot source mismatch.");

  const replacementId = crypto.randomUUID();
  const replacementPayload = { ...payload, id: replacementId, creationKey: replacementId, name: "Replacement list", rawList: "3 Mew ex" };
  const replacement = await primary.client.rpc("commit_tournament_deck_list", {
    ...args,
    p_request_id: crypto.randomUUID(),
    p_payload: replacementPayload,
    p_deck_name: "Mew / Dragapult",
    p_allow_replace: true,
    p_expected_tournament_updated_at: await tournamentVersion(tournamentId)
  });
  if (replacement.error) throw replacement.error;
  if (replacement.data.deckListId === first.data.deckListId) throw new Error("Replacement did not create a new first-class identity.");
  const oldReplay = await primary.client.rpc("commit_tournament_deck_list", args);
  if (oldReplay.error || oldReplay.data.status !== "idempotent") throw oldReplay.error || new Error("Old capture replay was not stable after replace.");
  const currentAfterReplace = await assertOne(service.from("tournaments").select("linked_deck_list_id").eq("id", tournamentId), "Replacement Tournament missing.");
  if (currentAfterReplace.linked_deck_list_id !== replacement.data.deckListId) throw new Error("Old replay restored a replaced snapshot.");
  const oldConflict = await primary.client.rpc("commit_tournament_deck_list", { ...args, p_deck_name: "Old conflict" });
  if (!oldConflict.error || oldConflict.error.code !== "23505") throw new Error("Old request-id conflict was not retained after replace.");

  const removeArgs = {
    p_tournament_id: tournamentId,
    p_expected_tournament_updated_at: await tournamentVersion(tournamentId),
    p_request_id: crypto.randomUUID()
  };
  const removed = await primary.client.rpc("remove_tournament_deck_list", removeArgs);
  if (removed.error) throw removed.error;
  const removeReplay = await primary.client.rpc("remove_tournament_deck_list", removeArgs);
  if (removeReplay.error || removeReplay.data.status !== "idempotent") throw removeReplay.error || new Error("Remove replay was not idempotent.");
  const { data: removedSnapshots, error: removedSnapshotError } = await service.from("tournament_deck_list_snapshots").select("id").eq("tournament_id", tournamentId);
  if (removedSnapshotError) throw removedSnapshotError;
  if (removedSnapshots.length !== 0) throw new Error("Remove did not clear the current snapshot.");
  await assertOne(service.from("deck_lists").select("id").eq("id", replacement.data.deckListId), "Remove deleted the external Deck List.");

  const sourceListId = crypto.randomUUID();
  const sourcePayload = {
    id: sourceListId,
    name: "Existing source",
    format: "Standard",
    date: "2026-09-19",
    createdBy: "Fixture",
    notes: "source",
    rawList: "4 Mew ex\n4 Boss's Orders\n8 Basic Fire Energy",
    parsedCards: [
      { name: "Basic Fire Energy", count: 8, category: "Energy" },
      { name: "Boss's Orders", count: 4, category: "Trainer", trainerType: "Supporter" },
      { name: "Mew ex", count: 4, category: "Pokemon" }
    ],
    sortedCards: [
      { name: "Basic Fire Energy", count: 8, category: "Energy" },
      { name: "Boss's Orders", count: 4, category: "Trainer", trainerType: "Supporter" },
      { name: "Mew ex", count: 4, category: "Pokemon" }
    ],
    sortedCardsVersion: 1
  };
  const sourceCreate = await primary.client.rpc("commit_first_class_deck_list", {
    p_deck_id: null,
    p_operation: "create",
    p_payload: sourcePayload,
    p_creation_key: sourceListId,
    p_expected_updated_at: null,
    p_updated_at: new Date().toISOString()
  });
  if (sourceCreate.error) throw sourceCreate.error;
  const sourceListBeforeStrategy = await assertOne(service.from("deck_lists").select("updated_at").eq("id", sourceListId), "Source list was not created.");
  const strategyArgs = {
    p_deck_id: crypto.randomUUID(),
    p_request_id: "strategy-from-list-rehearsal",
    p_deck_list_id: sourceListId,
    p_payload: {
      deckName: "Mew Strategy",
      format: "Standard",
      archetypeId: "mew-ex",
      deckPokemon: ["mew-ex"]
    },
    p_expected_deck_list_updated_at: sourceListBeforeStrategy.updated_at
  };
  strategyArgs.p_deck_id = strategyArgs.p_request_id;
  const strategyCreate = await primary.client.rpc("create_deck_strategy_from_list", strategyArgs);
  if (strategyCreate.error || strategyCreate.data.status !== "committed") throw strategyCreate.error || new Error("Strategy-from-list did not commit.");
  const strategyReplay = await primary.client.rpc("create_deck_strategy_from_list", strategyArgs);
  if (strategyReplay.error || strategyReplay.data.status !== "idempotent") throw strategyReplay.error || new Error("Strategy-from-list replay was not idempotent.");
  const strategyMirror = await assertOne(service.from("decks").select("deck_lists").eq("id", strategyArgs.p_deck_id), "Strategy mirror was not persisted.");
  if (
    strategyMirror.deck_lists?.[0]?.sortedCardsVersion !== 2
    || strategyMirror.deck_lists?.[0]?.sortedCards?.[0]?.name !== "Mew ex"
  ) throw new Error("Strategy legacy mirror did not persist rebuilt canonical ordering.");
  const linkedSource = await assertOne(service.from("deck_lists").select("deck_id,updated_at").eq("id", sourceListId), "Strategy did not claim source list.");
  if (linkedSource.deck_id !== strategyArgs.p_deck_id) throw new Error("Strategy-from-list did not associate the existing list.");
  const sourceCapture = await primary.client.rpc("commit_tournament_deck_list", {
    p_tournament_id: sourceTournamentId,
    p_request_id: crypto.randomUUID(),
    p_payload: {
      sourceDeckListId: sourceListId,
      parsedCards: [
        { name: "Energy", count: 8, category: "Energy" },
        { name: "Boss's Orders", count: 4, category: "Trainer", trainerType: "Supporter" },
        { name: "Mew ex", count: 4, category: "Pokemon" }
      ],
      sortedCards: [
        { name: "Energy", count: 8, category: "Energy" },
        { name: "Boss's Orders", count: 4, category: "Trainer", trainerType: "Supporter" },
        { name: "Mew ex", count: 4, category: "Pokemon" }
      ],
      sortedCardsVersion: 1,
      associateStrategy: false
    },
    p_expected_tournament_updated_at: await tournamentVersion(sourceTournamentId),
    p_deck_name: "Mew / Dragapult",
    p_deck_sprites: ["mew-ex", "dragapult-ex"],
    p_source_deck_list_id: sourceListId,
    p_source_deck_id: strategyArgs.p_deck_id,
    p_create_deck_list: false
  });
  if (sourceCapture.error) throw sourceCapture.error;
  const sourceSnapshot = await assertOne(service.from("tournament_deck_list_snapshots").select("source_deck_list_id,raw_list").eq("tournament_id", sourceTournamentId), "Existing source snapshot was not captured.");
  if (sourceSnapshot.source_deck_list_id !== sourceListId || sourceSnapshot.raw_list !== sourcePayload.rawList) throw new Error("Existing source capture was incomplete.");
  const sourceTournament = await assertOne(service.from("tournaments").select("linked_deck_id,linked_deck_list_id").eq("id", sourceTournamentId), "Source Tournament was not retained.");
  if (sourceTournament.linked_deck_id !== null || sourceTournament.linked_deck_list_id !== sourceListId) throw new Error("Existing source capture overwrote the independent Tournament Strategy link.");
  const sourceSnapshotCards = await assertOne(service.from("tournament_deck_list_snapshots").select("sorted_cards,sorted_cards_version").eq("tournament_id", sourceTournamentId), "Source ordering snapshot was not persisted.");
  if (
    sourceSnapshotCards.sorted_cards_version !== 2
    || sourceSnapshotCards.sorted_cards[0]?.name !== "Mew ex"
    || sourceSnapshotCards.sorted_cards[1]?.name !== "Boss's Orders"
    || sourceSnapshotCards.sorted_cards[2]?.category !== "Energy"
  ) throw new Error("Existing source capture did not persist rebuilt canonical ordering.");
  const sourceRemove = await primary.client.rpc("remove_tournament_deck_list", {
    p_tournament_id: sourceTournamentId,
    p_expected_tournament_updated_at: await tournamentVersion(sourceTournamentId),
    p_request_id: crypto.randomUUID()
  });
  if (sourceRemove.error) throw sourceRemove.error;
  await assertOne(service.from("deck_lists").select("id").eq("id", sourceListId), "Removing source association deleted the source list.");

  const staleRequestId = crypto.randomUUID();
  const stalePayload = { ...payload, id: staleRequestId, creationKey: staleRequestId };
  const staleVersion = await tournamentVersion(staleTournamentId);
  const { error: changedError } = await service.from("tournaments").update({ notes: "changed elsewhere", updated_at: new Date().toISOString() }).eq("id", staleTournamentId);
  if (changedError) throw changedError;
  const stale = await primary.client.rpc("commit_tournament_deck_list", {
    ...args,
    p_tournament_id: staleTournamentId,
    p_request_id: staleRequestId,
    p_payload: stalePayload,
    p_expected_tournament_updated_at: staleVersion
  });
  if (!stale.error || stale.error.code !== "P0001") throw new Error(`Expected stale capture rejection, got ${JSON.stringify(stale)}`);
  const { data: staleLists, error: staleListsError } = await service.from("deck_lists").select("id").eq("id", staleRequestId);
  if (staleListsError) throw staleListsError;
  const { data: staleSnapshots, error: staleSnapshotsError } = await service.from("tournament_deck_list_snapshots").select("id").eq("tournament_id", staleTournamentId);
  if (staleSnapshotsError) throw staleSnapshotsError;
  if (staleLists.length !== 0 || staleSnapshots.length !== 0) throw new Error("Stale capture left an orphan list or snapshot.");

  const roundCreationKey = crypto.randomUUID();
  const roundArgs = {
    p_tournament_id: sourceTournamentId,
    p_round_id: crypto.randomUUID(),
    p_creation_key: roundCreationKey,
    p_opponent_deck_name: "Rehearsal",
    p_opponent_deck_sprites: ["gardevoir-ex"],
    p_result: "Win",
    p_notes: "idempotent"
  };
  const round = await primary.client.rpc("create_tournament_round_idempotent", roundArgs);
  if (round.error) throw round.error;
  const roundReplay = await primary.client.rpc("create_tournament_round_idempotent", { ...roundArgs, p_round_id: crypto.randomUUID() });
  if (roundReplay.error || roundReplay.data.status !== "idempotent" || roundReplay.data.roundId !== round.data.roundId) throw roundReplay.error || new Error("Round replay did not retain its identity or number.");
  const roundConflict = await primary.client.rpc("create_tournament_round_idempotent", { ...roundArgs, p_notes: "conflict", p_round_id: crypto.randomUUID() });
  if (!roundConflict.error || roundConflict.error.code !== "23505") throw new Error("Expected conflicting round request rejection.");
  const roundRow = await assertOne(service.from("tournament_rounds").select("id,updated_at").eq("id", round.data.roundId), "Round row was not persisted.");
  const { error: roundChangeError } = await service.from("tournament_rounds").update({ notes: "changed elsewhere", updated_at: new Date().toISOString() }).eq("id", roundRow.id);
  if (roundChangeError) throw roundChangeError;
  const { data: staleRound, error: staleRoundError } = await primary.client.from("tournament_rounds").update({ notes: "stale write", updated_at: new Date().toISOString() }).eq("id", roundRow.id).eq("updated_at", roundRow.updated_at).select("id");
  if (staleRoundError) throw staleRoundError;
  if (staleRound.length !== 0) throw new Error("Stale round update was not rejected by compare-and-set.");

  const concurrentRounds = await Promise.all([
    primary.client.rpc("create_tournament_round_idempotent", {
      ...roundArgs,
      p_creation_key: crypto.randomUUID(),
      p_round_id: crypto.randomUUID(),
      p_notes: "concurrent-a"
    }),
    primary.client.rpc("create_tournament_round_idempotent", {
      ...roundArgs,
      p_creation_key: crypto.randomUUID(),
      p_round_id: crypto.randomUUID(),
      p_notes: "concurrent-b"
    })
  ]);
  for (const result of concurrentRounds) if (result.error) throw result.error;
  const concurrentNumbers = concurrentRounds.map((result) => Number(result.data.roundNumber)).sort((a, b) => a - b);
  if (concurrentNumbers[1] !== concurrentNumbers[0] + 1) throw new Error(`Concurrent round allocation was not atomic: ${concurrentNumbers.join(",")}`);

  const { data: hiddenSnapshots, error: hiddenError } = await other.client.from("tournament_deck_list_snapshots").select("id").eq("tournament_id", tournamentId);
  if (hiddenError) throw hiddenError;
  if (hiddenSnapshots.length !== 0) throw new Error("Cross-tenant snapshot read was not denied.");
  const crossTenant = await other.client.rpc("commit_tournament_deck_list", { ...args, p_request_id: crypto.randomUUID(), p_expected_tournament_updated_at: args.p_expected_tournament_updated_at });
  if (!crossTenant.error || crossTenant.error.code !== "P0002") throw new Error("Cross-tenant capture was not denied.");

  const recapture = await primary.client.rpc("commit_tournament_deck_list", {
    p_tournament_id: tournamentId,
    p_request_id: crypto.randomUUID(),
    p_payload: { sourceDeckListId: replacement.data.deckListId },
    p_expected_tournament_updated_at: await tournamentVersion(tournamentId),
    p_deck_name: "Mew / Dragapult",
    p_deck_sprites: ["mew-ex", "dragapult-ex"],
    p_source_deck_list_id: replacement.data.deckListId,
    p_create_deck_list: false
  });
  if (recapture.error) throw recapture.error;
  const { error: deleteTournamentError } = await service.from("tournaments").delete().eq("id", tournamentId).eq("user_id", primary.id);
  if (deleteTournamentError) throw deleteTournamentError;
  const { data: removedAfterCascade, error: cascadeError } = await service.from("tournament_deck_list_snapshots").select("id").eq("tournament_id", tournamentId);
  if (cascadeError) throw cascadeError;
  const { data: commandAfterCascade, error: commandCascadeError } = await service.from("tournament_deck_list_commands").select("id").eq("tournament_id", tournamentId);
  if (commandCascadeError) throw commandCascadeError;
  if (removedAfterCascade.length !== 0 || commandAfterCascade.length === 0) throw new Error("Tournament deletion did not cascade snapshots while retaining command history.");

  const metadataPayload = {
    name: "Metadata identity rehearsal",
    tournament_identifier: "metadata-1",
    location: "Local",
    championship_points: 0,
    professor_points: null,
    date_from: "2026-09-20",
    date_to: "2026-09-20",
    linked_deck_id: null,
    linked_deck_list_id: null,
    deck_name: "",
    deck_sprites: [],
    category: "",
    placement: "",
    participation: "player",
    judge_role: null,
    format: "TEF-PBL",
    notes: "metadata"
  };
  const invalidMetadataId = crypto.randomUUID();
  const invalidMetadata = await primary.client.rpc("commit_tournament_metadata", {
    p_operation: "create",
    p_tournament_id: invalidMetadataId,
    p_request_id: invalidMetadataId,
    p_payload: { ...metadataPayload, format: " Standard" }
  });
  if (!invalidMetadata.error || invalidMetadata.error.code !== "22023") throw new Error("Invalid metadata create was not rejected.");
  const { data: invalidMetadataRows, error: invalidMetadataRowsError } = await service.from("tournaments").select("id").eq("id", invalidMetadataId);
  if (invalidMetadataRowsError) throw invalidMetadataRowsError;
  if (invalidMetadataRows.length !== 0) throw new Error("Invalid metadata create left a row.");
  const invalidFormatId = crypto.randomUUID();
  const invalidFormat = await primary.client.rpc("commit_tournament_metadata", {
    p_operation: "create",
    p_tournament_id: invalidFormatId,
    p_request_id: invalidFormatId,
    p_payload: { ...metadataPayload, format: "ZZZ-ZZZ" }
  });
  if (!invalidFormat.error || invalidFormat.error.code !== "22023") throw new Error("Unknown metadata format was not rejected.");
  const { data: invalidFormatRows, error: invalidFormatRowsError } = await service.from("tournaments").select("id").eq("id", invalidFormatId);
  if (invalidFormatRowsError) throw invalidFormatRowsError;
  if (invalidFormatRows.length !== 0) throw new Error("Unknown metadata format left a row.");
  const sourceMetadataVersion = await tournamentVersion(sourceTournamentId);
  const invalidMetadataUpdate = await primary.client.rpc("commit_tournament_metadata", {
    p_operation: "update",
    p_tournament_id: sourceTournamentId,
    p_request_id: crypto.randomUUID(),
    p_expected_tournament_updated_at: sourceMetadataVersion,
    p_payload: { ...metadataPayload, name: "Mutated", date_to: "2026-09-19", date_from: "2026-09-20" }
  });
  if (!invalidMetadataUpdate.error || invalidMetadataUpdate.error.code !== "22023") throw new Error("Invalid metadata update was not rejected.");
  const unchangedSource = await assertOne(service.from("tournaments").select("name,updated_at").eq("id", sourceTournamentId), "Source Tournament disappeared during metadata validation.");
  if (unchangedSource.name !== "Existing source capture" || unchangedSource.updated_at !== sourceMetadataVersion) throw new Error("Invalid metadata update changed the Tournament.");
  const invalidPlacementUpdate = await primary.client.rpc("commit_tournament_metadata", {
    p_operation: "update",
    p_tournament_id: sourceTournamentId,
    p_request_id: crypto.randomUUID(),
    p_expected_tournament_updated_at: sourceMetadataVersion,
    p_payload: { ...metadataPayload, name: "Mutated", placement: "arbitrary" }
  });
  if (!invalidPlacementUpdate.error || invalidPlacementUpdate.error.code !== "22023") throw new Error("Arbitrary metadata placement was not rejected.");
  const unchangedAfterPlacement = await assertOne(service.from("tournaments").select("name,updated_at").eq("id", sourceTournamentId), "Source Tournament disappeared during placement validation.");
  if (unchangedAfterPlacement.name !== "Existing source capture" || unchangedAfterPlacement.updated_at !== sourceMetadataVersion) throw new Error("Arbitrary metadata placement changed the Tournament.");
  const metadata = await primary.client.rpc("commit_tournament_metadata", {
    p_operation: "create",
    p_tournament_id: metadataTournamentId,
    p_request_id: metadataTournamentId,
    p_payload: metadataPayload
  });
  if (metadata.error || metadata.data.status !== "committed") throw metadata.error || new Error("Metadata create did not commit.");
  const metadataReplay = await primary.client.rpc("commit_tournament_metadata", {
    p_operation: "create",
    p_tournament_id: metadataTournamentId,
    p_request_id: metadataTournamentId,
    p_payload: metadataPayload
  });
  if (metadataReplay.error || metadataReplay.data.status !== "idempotent") throw metadataReplay.error || new Error("Metadata create replay was not idempotent.");
  const { error: metadataDeleteError } = await service.from("tournaments").delete().eq("id", metadataTournamentId).eq("user_id", primary.id);
  if (metadataDeleteError) throw metadataDeleteError;
  const metadataAfterDeleteReplay = await primary.client.rpc("commit_tournament_metadata", {
    p_operation: "create",
    p_tournament_id: metadataTournamentId,
    p_request_id: metadataTournamentId,
    p_payload: metadataPayload
  });
  if (metadataAfterDeleteReplay.error || metadataAfterDeleteReplay.data.status !== "idempotent") throw metadataAfterDeleteReplay.error || new Error("Metadata identity was lost after Tournament deletion.");

  const linkedMetadataId = crypto.randomUUID();
  tournaments.push(linkedMetadataId);
  const linkedMetadataPayload = { ...metadataPayload, name: "Linked replay", linked_deck_id: strategyArgs.p_deck_id, linked_deck_list_id: sourceListId };
  const linkedMetadata = await primary.client.rpc("commit_tournament_metadata", {
    p_operation: "create",
    p_tournament_id: linkedMetadataId,
    p_request_id: linkedMetadataId,
    p_payload: linkedMetadataPayload
  });
  if (linkedMetadata.error || linkedMetadata.data.status !== "committed") throw linkedMetadata.error || new Error("Linked metadata create did not commit.");
  const { error: linkedDeleteError } = await service.from("decks").delete().eq("id", strategyArgs.p_deck_id).eq("user_id", primary.id);
  if (linkedDeleteError) throw linkedDeleteError;
  const linkedMetadataReplay = await primary.client.rpc("commit_tournament_metadata", {
    p_operation: "create",
    p_tournament_id: linkedMetadataId,
    p_request_id: linkedMetadataId,
    p_payload: linkedMetadataPayload
  });
  if (linkedMetadataReplay.error || linkedMetadataReplay.data.status !== "idempotent") throw linkedMetadataReplay.error || new Error("Linked metadata replay was blocked after linked-record deletion.");

  console.log("Tournament Deck List rehearsal passed: standalone replay/conflict, replace/remove history, existing source capture and Strategy independence, stale rollback, round replay/CAS/concurrency, metadata delete-replay, RLS isolation, and cascade.");
} finally {
  for (const id of tournaments) await service.from("tournaments").delete().eq("id", id);
  for (const id of users) await service.auth.admin.deleteUser(id);
}
