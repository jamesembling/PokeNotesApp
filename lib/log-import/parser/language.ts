import type { Language } from "@/types/index";

export const LANGUAGE_STRINGS: Record<
  Language,
  {
    setup: string;
    shuffled: string;
    took: string;
    prize: string;
  }
> = {
  en: {
    setup: "Setup",
    shuffled: "shuffled their deck.",
    took: "took",
    prize: "Prize card"
  },
  de: {
    setup: "Vorbereitung",
    shuffled: "eigene Deck gemischt.",
    took: "hat",
    prize: "Preiskarten aufgenommen"
  },
  es: {
    setup: "Preparación",
    shuffled: "barajó su mazo.",
    took: "tomó",
    prize: "cartas de Premio"
  },
  fr: {
    setup: "Préparation",
    shuffled: "a mélangé son deck.",
    took: "a récupéré",
    prize: "Récompense"
  },
  it: {
    setup: "Allestimento",
    shuffled: "ha rimischiato il proprio mazzo.",
    took: "ha preso",
    prize: "carta Premio"
  },
  "pt-br": {
    setup: "Preparação",
    shuffled: "embaralhou o próprio baralho.",
    took: "pegou",
    prize: "carta de Prêmio"
  }
};

export function detectLanguage(rawLog: string): Language {
  if (rawLog.includes(LANGUAGE_STRINGS.en.setup)) return "en";
  if (rawLog.includes(LANGUAGE_STRINGS.de.setup)) return "de";
  if (rawLog.includes(LANGUAGE_STRINGS.es.setup)) return "es";
  if (rawLog.includes(LANGUAGE_STRINGS.fr.setup)) return "fr";
  if (rawLog.includes(LANGUAGE_STRINGS.it.setup)) return "it";
  if (rawLog.includes(LANGUAGE_STRINGS["pt-br"].setup)) return "pt-br";

  if (process.env.NODE_ENV !== "production") {
    console.warn("[log-import] unknown log language, defaulting to English");
  }

  return "en";
}
