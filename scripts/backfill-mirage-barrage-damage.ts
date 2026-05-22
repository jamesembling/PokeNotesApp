import "dotenv/config";

import { createClient } from "@supabase/supabase-js";
import { detectLanguage } from "@/lib/log-import/parser/language";
import { extractPlayerNames } from "@/lib/log-import/parser/players";
import {
  buildStats,
  getPrizesTakenFromLine,
  isPrizeTakenLine
} from "@/lib/log-import/parser/stats";
import { trimBattleLog } from "@/lib/log-import/parser/trim";
import { divideIntoSections } from "@/lib/log-import/parser/turns";

type MirageLogRow = {
  id: string;
  user_id: string;
  date: string;
  imported_at: string;
  self_player_name: string;
  opponent_player_name: string;
  total_turns: number;
  coin_toss_won: boolean | null;
  go_order: "First" | "Second" | "";
  self_prizes_taken: number;
  opponent_prizes_taken: number;
  self_attack_damage: number;
  opponent_attack_damage: number;
  self_mulligans: number;
  opponent_mulligans: number;
  reason: string;
  raw_log: string;
};

const dryRun = !process.argv.includes("--apply");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEW_SUPABASE_URL || "";
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEW_SUPABASE_SERVICE_KEY || "";

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase service environment variables.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

function changedFields(before: Record<string, unknown>, after: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(after)
      .filter(([key, value]) => before[key] !== value)
      .map(([key, value]) => [key, { before: before[key], after: value }])
  );
}

async function main() {
  const { data, error } = await supabase
    .from("logs")
    .select(
      [
        "id",
        "user_id",
        "date",
        "imported_at",
        "self_player_name",
        "opponent_player_name",
        "total_turns",
        "coin_toss_won",
        "go_order",
        "self_prizes_taken",
        "opponent_prizes_taken",
        "self_attack_damage",
        "opponent_attack_damage",
        "self_mulligans",
        "opponent_mulligans",
        "reason",
        "raw_log"
      ].join(",")
    )
    .ilike("raw_log", "%Mirage Barrage%")
    .order("imported_at", { ascending: false });

  if (error) {
    throw error;
  }

  const updates: Array<{
    id: string;
    userId: string;
    date: string;
    importedAt: string;
    changes: Record<string, unknown>;
    payload: Record<string, unknown>;
  }> = [];

  for (const log of (((data ?? []) as unknown) as MirageLogRow[])) {
    const language = detectLanguage(log.raw_log);
    const lines = trimBattleLog(log.raw_log, language);
    const extractedPlayerNames = extractPlayerNames(lines, language);
    const playerNames: [string, string] = [
      log.self_player_name || extractedPlayerNames[0],
      log.opponent_player_name || extractedPlayerNames[1]
    ];
    const sections = divideIntoSections({
      lines,
      language,
      playerNames,
      getPrizesTakenFromLine,
      isPrizeTakenLine
    });
    const stats = buildStats({
      lines,
      sections,
      language,
      selfPlayerName: playerNames[0],
      opponentPlayerName: playerNames[1]
    });
    const before = {
      self_attack_damage: log.self_attack_damage,
      opponent_attack_damage: log.opponent_attack_damage
    };
    const payload = {
      self_attack_damage: stats.selfAttackDamage,
      opponent_attack_damage: stats.opponentAttackDamage
    };
    const changes = changedFields(before, payload);

    if (Object.keys(changes).length > 0) {
      updates.push({
        id: log.id,
        userId: log.user_id,
        date: log.date,
        importedAt: log.imported_at,
        changes,
        payload
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: dryRun ? "dry-run" : "apply",
        scanned: data?.length ?? 0,
        updates: updates.map(({ id, date, importedAt, changes }) => ({
          id,
          date,
          importedAt,
          changes
        }))
      },
      null,
      2
    )
  );

  if (!dryRun) {
    for (const update of updates) {
      const { error: updateError } = await supabase
        .from("logs")
        .update(update.payload)
        .eq("id", update.id);

      if (updateError) {
        throw updateError;
      }
    }

    console.log(`Applied ${updates.length} Mirage Barrage log updates.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
