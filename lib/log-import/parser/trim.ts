import type { Language } from "@/types/index";
import { LANGUAGE_STRINGS } from "@/lib/log-import/parser/language";

export function trimBattleLog(rawLog: string, language: Language) {
  const shuffledMarker = LANGUAGE_STRINGS[language].shuffled.toLowerCase();

  return String(rawLog || "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .filter((line) => !line.toLowerCase().includes(shuffledMarker));
}
