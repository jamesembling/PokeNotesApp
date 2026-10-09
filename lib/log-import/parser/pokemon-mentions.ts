import type { Language } from "@/types/index";
import { normalizeText } from "@/lib/log-import/normalization";
import type { IdentificationCatalog, PlayerPokemonEvidence } from "@/lib/log-import/types";
import { stripLogCardIdentifiers } from "@/lib/battle-log/card-identifiers";

function getRelevantIdentificationLines(lines: string[], playerName: string, language: Language) {
  if (language === "en") {
    return lines.filter(
      (line) =>
        line.includes(`${playerName} attached`) ||
        line.includes(`${playerName} played `) ||
        (line.includes(`${playerName} drew `) && line.includes("and played it to the Bench")) ||
        line.includes(`${playerName} evolved `) ||
        (line.includes(`${playerName}'s `) &&
          (line.includes("was Knocked Out") || (line.includes(" used") && !line.includes("damage"))))
    );
  }

  if (language === "es") {
    return lines.filter(
      (line) => line.includes(`${playerName} puso en juego a`) && line.includes(" en la Banca.")
    );
  }

  if (language === "de") {
    return lines.filter(
      (line) =>
        (line.includes(playerName) && line.includes(" auf der Bank zu ") && line.includes("entwickelt")) ||
        (line.includes(`${playerName} hat`) && line.includes(" auf die Bank gelegt."))
    );
  }

  if (language === "fr") {
    return lines.filter(
      (line) =>
        (line.includes(`${playerName} a joué`) && line.includes("sur le Banc")) ||
        line.includes(` de ${playerName} a utilisé `)
    );
  }

  if (language === "it") {
    return lines.filter(
      (line) => line.includes(`${playerName} ha pescato e giocato`) && line.includes(" in panchina.")
    );
  }

  if (language === "pt-br") {
    return lines.filter(
      (line) =>
        (line.includes(`${playerName} jogou`) && line.includes(" no Banco.")) ||
        line.includes(`${playerName} evoluiu`) ||
        (line.includes(`${playerName} usou`) && !line.includes("dano")) ||
        (line.includes(`${playerName} de `) && line.includes("foi Nocauteado"))
    );
  }

  return [];
}

function tokenizeLine(line: string) {
  return normalizeText(stripLogCardIdentifiers(line))
    .replace(/\b[a-z0-9 .-]+'s\b/g, "")
    .split(" ")
    .filter(Boolean);
}

export function extractPlayerPokemonMentions(args: {
  lines: string[];
  playerName: string;
  language: Language;
  catalog: IdentificationCatalog;
}): PlayerPokemonEvidence {
  const relevantLines = getRelevantIdentificationLines(args.lines, args.playerName, args.language);
  const mentionCounts = new Map<string, number>();
  const maxTokens = args.catalog.pokemon.maxNameTokens;

  relevantLines.forEach((line) => {
    const tokens = tokenizeLine(line);

    for (let startIndex = 0; startIndex < tokens.length; startIndex += 1) {
      for (
        let size = Math.min(maxTokens, tokens.length - startIndex);
        size >= 1;
        size -= 1
      ) {
        const phrase = tokens.slice(startIndex, startIndex + size).join(" ");
        const slug = args.catalog.pokemon.normalizedNameToSlug.get(phrase);
        if (!slug) {
          continue;
        }

        mentionCounts.set(slug, (mentionCounts.get(slug) ?? 0) + 1);
        startIndex += size - 1;
        break;
      }
    }
  });

  return {
    lines: relevantLines,
    normalizedText: normalizeText(stripLogCardIdentifiers(relevantLines.join(" "))),
    mentionCounts
  };
}
