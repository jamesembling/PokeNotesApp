import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import {
  resolvePersistableLogDeckLink,
  type DeckLinkCandidate
} from "./lib/log-import/deck-linking";

const REQUIRED_ENV_VARS = ["NEW_SUPABASE_URL", "NEW_SUPABASE_SERVICE_KEY"];

type ScriptArgs = {
  batchSize: number;
  cursorId?: string;
  dryRun: boolean;
  userId?: string;
};

type DeckRow = {
  id: string;
  user_id: string;
  deck_name: string;
  deck_pokemon: unknown;
};

type LogRow = {
  id: string;
  user_id: string;
  linked_deck_id: string | null;
  linked_deck_list_id: string | null;
  self_deck_name: string;
  self_deck_slug: string;
  self_deck_sprites: string;
};

type Summary = {
  alreadyLinked: number;
  ambiguous: number;
  linked: number;
  scanned: number;
  skipped: number;
};

for (const envVar of REQUIRED_ENV_VARS) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

const supabase = createClient(
  process.env.NEW_SUPABASE_URL!,
  process.env.NEW_SUPABASE_SERVICE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

function parseArgs(argv: string[]): ScriptArgs {
  const parsed: ScriptArgs = {
    batchSize: 200,
    dryRun: false
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }

    if (arg.startsWith("--user-id=")) {
      const userId = arg.slice("--user-id=".length).trim();
      if (userId) {
        parsed.userId = userId;
      }
      continue;
    }

    if (arg.startsWith("--batch-size=")) {
      const batchSize = Number.parseInt(arg.slice("--batch-size=".length), 10);
      if (Number.isFinite(batchSize) && batchSize > 0) {
        parsed.batchSize = batchSize;
      }
      continue;
    }

    if (arg.startsWith("--after-id=")) {
      const cursorId = arg.slice("--after-id=".length).trim();
      if (cursorId) {
        parsed.cursorId = cursorId;
      }
    }
  }

  return parsed;
}

function parseStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

function splitSprites(value: string) {
  return String(value || "")
    .split(",")
    .map((sprite) => sprite.trim())
    .filter(Boolean);
}

function formatSummary(summary: Summary) {
  return [
    `scanned=${summary.scanned}`,
    `linked=${summary.linked}`,
    `ambiguous=${summary.ambiguous}`,
    `skipped=${summary.skipped}`,
    `already-linked=${summary.alreadyLinked}`
  ].join(" ");
}

async function loadDeckCandidates(userId?: string) {
  let query = supabase
    .from("decks")
    .select("id,user_id,deck_name,deck_pokemon")
    .order("user_id", { ascending: true })
    .order("id", { ascending: true });

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const candidatesByUser = new Map<string, DeckLinkCandidate[]>();

  for (const row of (((data ?? []) as unknown) as DeckRow[])) {
    const current = candidatesByUser.get(row.user_id) ?? [];
    current.push({
      id: row.id,
      deckName: row.deck_name,
      deckPokemon: parseStringArray(row.deck_pokemon)
    });
    candidatesByUser.set(row.user_id, current);
  }

  return candidatesByUser;
}

async function fetchLogBatch(args: {
  batchSize: number;
  cursorId?: string;
  userId?: string;
}) {
  let query = supabase
    .from("logs")
    .select(
      [
        "id",
        "user_id",
        "linked_deck_id",
        "linked_deck_list_id",
        "self_deck_name",
        "self_deck_slug",
        "self_deck_sprites"
      ].join(",")
    )
    .is("linked_deck_id", null)
    .order("id", { ascending: true })
    .limit(args.batchSize);

  if (args.userId) {
    query = query.eq("user_id", args.userId);
  }

  if (args.cursorId) {
    query = query.gt("id", args.cursorId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (((data ?? []) as unknown) as LogRow[]);
}

async function updateLinkedDeckId(logId: string, userId: string, linkedDeckId: string) {
  const { error } = await supabase
    .from("logs")
    .update({
      linked_deck_id: linkedDeckId
    })
    .eq("id", logId)
    .eq("user_id", userId)
    .is("linked_deck_id", null)
    .is("linked_deck_list_id", null);

  if (error) {
    throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const summary: Summary = {
    alreadyLinked: 0,
    ambiguous: 0,
    linked: 0,
    scanned: 0,
    skipped: 0
  };

  const candidatesByUser = await loadDeckCandidates(args.userId);

  console.log(
    `Starting log link backfill (${args.dryRun ? "dry-run" : "apply"}) batchSize=${args.batchSize}${args.userId ? ` userId=${args.userId}` : ""}${args.cursorId ? ` afterId=${args.cursorId}` : ""}`
  );
  console.log(`Loaded deck candidates for ${candidatesByUser.size} user(s).`);

  let cursorId = args.cursorId;
  let batchNumber = 0;

  while (true) {
    const rows = await fetchLogBatch({
      batchSize: args.batchSize,
      cursorId,
      userId: args.userId
    });

    if (rows.length === 0) {
      break;
    }

    batchNumber += 1;
    console.log(`Processing batch ${batchNumber} (${rows.length} log(s))`);

    for (const row of rows) {
      cursorId = row.id;
      summary.scanned += 1;

      const decision = resolvePersistableLogDeckLink(
        candidatesByUser.get(row.user_id) ?? [],
        {
          linkedDeckId: row.linked_deck_id,
          linkedDeckListId: row.linked_deck_list_id,
          selfDeckName: row.self_deck_name,
          selfDeckSlug: row.self_deck_slug,
          selfDeckSprites: splitSprites(row.self_deck_sprites)
        }
      );

      if (decision.status === "already-linked") {
        summary.alreadyLinked += 1;
        continue;
      }

      if (decision.status === "ambiguous") {
        summary.ambiguous += 1;
        continue;
      }

      if (decision.status === "no-match") {
        summary.skipped += 1;
        continue;
      }

      if (!args.dryRun) {
        await updateLinkedDeckId(row.id, row.user_id, decision.linkedDeckId);
      }

      summary.linked += 1;
    }

    console.log(`Batch ${batchNumber} summary: ${formatSummary(summary)}`);
  }

  console.log(`Finished log link backfill: ${formatSummary(summary)}`);
}

main().catch((error) => {
  console.error("Log link backfill failed.");
  console.error(error);
  process.exit(1);
});
