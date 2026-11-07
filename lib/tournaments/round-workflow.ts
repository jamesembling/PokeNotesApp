import type { TournamentCommandStatus } from "@/lib/tournaments/metadata-workflow";
import type { createClient } from "@/lib/supabase/server";
import type { TournamentRoundResult } from "@/types/index";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

function getTournamentRoundCreationIdentity(formData: FormData, fallbackId = crypto.randomUUID()) {
  const creationKey = String(formData.get("creationKey") || "").trim() || fallbackId;

  return {
    creationKey,
    roundId: creationKey
  };
}

/** New rounds commit only through the idempotent RPC so a resubmitted form cannot add a second round. */
export async function commitNewTournamentRound(args: {
  formData: FormData;
  mapError: (error: { code?: string; message?: string }) => Error;
  round: {
    notes: string;
    opponentDeckName: string;
    opponentDeckSprites: string[];
    result: TournamentRoundResult;
  };
  supabase: SupabaseClient;
  tournamentId: string;
}): Promise<TournamentCommandStatus> {
  const { creationKey, roundId } = getTournamentRoundCreationIdentity(args.formData);
  const { data, error } = await args.supabase.rpc("create_tournament_round_idempotent", {
    p_creation_key: creationKey,
    p_notes: args.round.notes,
    p_opponent_deck_name: args.round.opponentDeckName,
    p_opponent_deck_sprites: args.round.opponentDeckSprites,
    p_result: args.round.result,
    p_round_id: roundId,
    p_tournament_id: args.tournamentId
  });

  if (error) {
    throw args.mapError(error);
  }

  const status = (data as { status?: string } | null)?.status;
  if (status !== "committed" && status !== "idempotent") {
    throw new Error("Tournament round commit returned an unexpected result.");
  }
  return status;
}
