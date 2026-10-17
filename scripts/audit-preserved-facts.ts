/** Read-only candidate assessment. Never applies a repair or prints private log text. */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { buildStats } from "@/lib/log-import/parser/stats";
import type { DeckCard, LogSection } from "@/types/index";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key)
  throw new Error("Set the intended Supabase URL and service role in the environment.");
if (process.argv.some((arg) => arg === "--apply"))
  throw new Error("This assessment has no apply mode.");
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const details = process.argv.includes("--details");
const report = {
  target: new URL(url).origin,
  mode: "read-only",
  festivalLogs: { scanned: 0, changed: 0, unverifiable: 0 },
  deckLists: { scanned: 0, changed: 0, unverifiable: 0 },
  tournamentSnapshots: { scanned: 0, changed: 0, unverifiable: 0 },
  candidates: [] as Record<string, unknown>[]
};

async function* rows(table: string, columns: string, festival = false) {
  let cursor = "";
  while (true) {
    let query = client.from(table).select(columns).order("id").limit(250);
    if (cursor) query = query.gt("id", cursor);
    if (festival) query = query.ilike("raw_log", "%Festival Lead%");
    const { data, error } = await query;
    if (error) throw new Error(`${table} assessment failed: ${error.message}`);
    if (!data?.length) return;
    for (const row of data) yield row as unknown as Record<string, unknown>;
    cursor = String((data[data.length - 1] as unknown as Record<string, unknown>).id);
  }
}
function candidate(value: Record<string, unknown>) {
  if (details) report.candidates.push(value);
}

async function main() {
  for await (const row of rows(
    "logs",
    "id,user_id,self_player_name,opponent_player_name,self_attack_damage,opponent_attack_damage,sections,raw_log,result",
    true
  )) {
    report.festivalLogs.scanned += 1;
    const sections = row.sections as LogSection[];
    if (
      !Array.isArray(sections) ||
      !sections.some((section) =>
        section.actions?.some((action) => /Festival Lead/.test(action.title))
      )
    ) {
      report.festivalLogs.unverifiable += 1;
      continue;
    }
    try {
      // Saved sections already preserve the import's canonical account-side name.
      // Use the saved result only to satisfy the stats API; propose damage only.
      const stats = buildStats({
        sections,
        lines: [
          `. ${row.result === "Win" ? row.self_player_name : row.opponent_player_name} wins.`
        ],
        language: "en",
        selfPlayerName: String(row.self_player_name),
        opponentPlayerName: String(row.opponent_player_name)
      });
      if (
        stats.selfAttackDamage !== row.self_attack_damage ||
        stats.opponentAttackDamage !== row.opponent_attack_damage
      ) {
        report.festivalLogs.changed += 1;
        candidate({
          table: "logs",
          id: row.id,
          userId: row.user_id,
          before: [row.self_attack_damage, row.opponent_attack_damage],
          after: [stats.selfAttackDamage, stats.opponentAttackDamage]
        });
      }
    } catch {
      report.festivalLogs.unverifiable += 1;
    }
  }

  const { data: active, error: activeError } = await client
    .from("card_definition_active")
    .select("generation_id")
    .maybeSingle();
  if (activeError) throw activeError;
  const trainerTypes = new Map<string, Set<string>>();
  const normalize = (name: unknown) =>
    String(name || "")
      .replaceAll("’", "'")
      .trim()
      .toLowerCase();
  if (active) {
    const { data: generation, error } = await client
      .from("card_definition_generations")
      .select("completed_at")
      .eq("id", active.generation_id)
      .single();
    if (error || !generation.completed_at)
      throw error || new Error("Active reference evidence is incomplete.");
    let cursor = "";
    while (true) {
      let query = client
        .from("card_definition_catalog")
        .select("source_card_id,definition")
        .eq("generation_id", active.generation_id)
        .order("source_card_id")
        .limit(500);
      if (cursor) query = query.gt("source_card_id", cursor);
      const { data, error } = await query;
      if (error) throw error;
      if (!data.length) break;
      for (const { definition } of data) {
        const card = definition as Record<string, unknown>;
        const name = normalize(card.name);
        const values = trainerTypes.get(name) || new Set<string>();
        values.add(card.category === "Trainer" ? normalize(card.trainerType) : "");
        trainerTypes.set(name, values);
      }
      cursor = data[data.length - 1].source_card_id;
    }
  }
  for (const [table, counts] of [
    ["deck_lists", report.deckLists],
    ["tournament_deck_list_snapshots", report.tournamentSnapshots]
  ] as const) {
    for await (const row of rows(
      table,
      "id,user_id,parsed_cards,sorted_cards,sorted_cards_version"
    )) {
      counts.scanned += 1;
      const cards = row.sorted_cards as DeckCard[];
      const parsed = row.parsed_cards as DeckCard[];
      if (!Array.isArray(cards) || !Array.isArray(parsed)) {
        counts.unverifiable += 1;
        continue;
      }
      let prior = -1;
      let changed = false;
      let unknown = cards.length === 0 && parsed.length > 0;
      const ranks: Record<string, number> = { supporter: 0, item: 1, tool: 2, stadium: 3 };
      for (const card of cards) {
        if (normalize(card.category) !== "trainer") continue;
        const types = trainerTypes.get(normalize(card.name));
        const kind = types?.size === 1 ? [...types][0] : "";
        if (!(kind in ranks)) {
          unknown = true;
          continue;
        }
        const rank = ranks[kind];
        if (rank < prior) changed = true;
        prior = rank;
      }
      if (unknown) counts.unverifiable += 1;
      else if (changed) {
        counts.changed += 1;
        candidate({
          table,
          id: row.id,
          userId: row.user_id,
          sortedCardsVersion: row.sorted_cards_version,
          reason: "Trainer subtype inversion",
          historicalSnapshot: table === "tournament_deck_list_snapshots"
        });
      }
    }
  }
  console.log(JSON.stringify(report, null, 2));
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Assessment failed.");
  process.exitCode = 1;
});
