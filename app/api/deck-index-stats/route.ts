import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getDeckStatsForIndex } from "@/lib/db/logs";
import type { DeckLinkCandidate } from "@/lib/log-import/deck-linking";

export async function GET(request: NextRequest) {
  const user = await requireUser();
  const deckIds = (request.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (deckIds.length === 0) {
    return NextResponse.json({ stats: [] });
  }

  const decks: DeckLinkCandidate[] = deckIds.map((id) => ({
    id,
    deckName: "",
    deckPokemon: []
  }));
  const statsByDeck = await getDeckStatsForIndex(user.id, decks, deckIds);

  return NextResponse.json(
    {
      stats: deckIds.map((deckId) => {
        const stats = statsByDeck.get(deckId) ?? { total: 0, wins: 0, losses: 0 };
        return {
          deckId,
          total: stats.total,
          wins: stats.wins,
          losses: stats.losses
        };
      })
    },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0"
      }
    }
  );
}
