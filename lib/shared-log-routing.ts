import type { SharedBattleLogSnapshot } from "@/lib/db/log-shares";

export function requireSharedLogSnapshot<T>(
  sharedLog: SharedBattleLogSnapshot | null,
  onMissing: () => T
) {
  if (!sharedLog) {
    return onMissing();
  }

  return sharedLog;
}
