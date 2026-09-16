import "server-only";

import { revalidateTag, unstable_cache, updateTag } from "next/cache";
import { getDeckLinkCandidates } from "@/lib/log-import/deck-linking";
import { loadLearnedArchetypeRows } from "@/lib/log-import/identifier/catalog";
import { createClient } from "@/lib/supabase/server";

const BATTLE_LOG_IMPORT_CONTEXT_CACHE_SECONDS = 5 * 60;
const BATTLE_LOG_IMPORT_CONTEXT_CACHE_VERSION = "v1";

type ProfileImportIdentityRow = {
  ptcgl_username: string;
  ptcgl_username_aliases: string[];
};

export function getBattleLogImportContextCacheTag(userId: string) {
  return `battle-log-import-context:${userId}`;
}

export async function loadCachedBattleLogImportContext(userId: string) {
  const supabase = await createClient();
  let loadedFromSource = false;
  const load = unstable_cache(
    async () => {
      loadedFromSource = true;
      const [profileResult, learnedArchetypeRows, deckLinkCandidates] = await Promise.all([
        supabase
          .from("profiles")
          .select("ptcgl_username,ptcgl_username_aliases")
          .eq("id", userId)
          .single(),
        loadLearnedArchetypeRows({ supabase, userId }),
        getDeckLinkCandidates(userId, supabase)
      ]);

      if (profileResult.error) {
        throw profileResult.error;
      }

      const profile = profileResult.data as ProfileImportIdentityRow | null;

      return {
        deckLinkCandidates,
        learnedArchetypeRows,
        ptcglUsername: String(profile?.ptcgl_username || "").trim(),
        ptcglUsernameAliases: profile?.ptcgl_username_aliases ?? []
      };
    },
    ["battle-log-import-context", BATTLE_LOG_IMPORT_CONTEXT_CACHE_VERSION, userId],
    {
      revalidate: BATTLE_LOG_IMPORT_CONTEXT_CACHE_SECONDS,
      tags: [getBattleLogImportContextCacheTag(userId)]
    }
  );
  const startedAt = performance.now();
  const value = await load();

  return {
    cacheOutcome: loadedFromSource ? ("miss" as const) : ("hit" as const),
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    value
  };
}

export async function warmBattleLogImportContext(userId: string) {
  await loadCachedBattleLogImportContext(userId);
}

export function invalidateBattleLogImportContext(userId: string) {
  updateTag(getBattleLogImportContextCacheTag(userId));
}

export function revalidateBattleLogImportContext(userId: string) {
  revalidateTag(getBattleLogImportContextCacheTag(userId), { expire: 0 });
}
