const TRAINING_COURT_LOG_HOSTS = new Set(["trainingcourt.app", "www.trainingcourt.app"]);
const TRAINING_COURT_LOG_PATH_PATTERN = /^\/ptcg\/logs\/[0-9a-f-]+\/?$/i;
const TRAINING_COURT_LOG_URL_PATTERN =
  /^https?:\/\/(?:www\.)?trainingcourt\.app\/ptcg\/logs\/[0-9a-f-]+(?:\/)?(?:[?#].*)?$/i;

export class TrainingCourtImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrainingCourtImportError";
  }
}

export function isTrainingCourtLogUrl(value: string): boolean {
  return TRAINING_COURT_LOG_URL_PATTERN.test(String(value || "").trim());
}

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(String(value || "").trim());
}

export function normalizeTrainingCourtLogUrl(value: string): string {
  const trimmedValue = String(value || "").trim();

  if (!looksLikeUrl(trimmedValue)) {
    throw new TrainingCourtImportError("Only Training Court log URLs are supported.");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmedValue);
  } catch {
    throw new TrainingCourtImportError("Only Training Court log URLs are supported.");
  }

  const hostname = String(parsedUrl.hostname || "").toLowerCase();
  if (!TRAINING_COURT_LOG_HOSTS.has(hostname)) {
    throw new TrainingCourtImportError("Only Training Court log URLs are supported.");
  }

  if (!TRAINING_COURT_LOG_PATH_PATTERN.test(parsedUrl.pathname)) {
    throw new TrainingCourtImportError("Only Training Court log URLs are supported.");
  }

  parsedUrl.protocol = "https:";
  parsedUrl.host = "www.trainingcourt.app";
  parsedUrl.hash = "";
  parsedUrl.search = "";

  return parsedUrl.toString();
}

function decodeEscapedString(rawValue: string): string {
  return JSON.parse(`"${String(rawValue || "").replace(/"/g, '\\"')}"`) as string;
}

function readEscapedString(
  source: string,
  startIndex: number
): { rawValue: string; nextIndex: number } | null {
  let cursor = startIndex;
  let rawValue = "";

  while (cursor < source.length) {
    if (source[cursor] === "\\" && source[cursor + 1] === '"') {
      return {
        rawValue,
        nextIndex: cursor + 2
      };
    }

    rawValue += source[cursor];
    cursor += 1;
  }

  return null;
}

export function extractTrainingCourtTextNodes(html: string): string[] {
  const marker = 'children\\":';
  const extracted: string[] = [];
  let searchIndex = 0;

  while (true) {
    const markerIndex = html.indexOf(marker, searchIndex);
    if (markerIndex === -1) {
      break;
    }

    const cursor = markerIndex + marker.length;
    let stringResult: { rawValue: string; nextIndex: number } | null = null;

    if (html.startsWith('\\"', cursor)) {
      stringResult = readEscapedString(html, cursor + 2);
    } else if (html.startsWith('[\\"', cursor)) {
      stringResult = readEscapedString(html, cursor + 3);
    }

    if (!stringResult) {
      searchIndex = cursor;
      continue;
    }

    try {
      extracted.push(decodeEscapedString(stringResult.rawValue));
    } catch {
      // Ignore malformed fragments and keep scanning the page.
    }

    searchIndex = stringResult.nextIndex;
  }

  return extracted;
}

function getTrainingCourtPlayerNames(textNodes: string[]): Set<string> {
  const playerNames = new Set<string>();

  textNodes.forEach((value) => {
    const match = String(value || "").match(/^(.*) drew 7 cards for the opening hand\.$/);
    if (match?.[1]) {
      playerNames.add(match[1]);
    }
  });

  return playerNames;
}

export function buildTrainingCourtRawLog(textNodes: string[]): string {
  const rawLines: string[] = [];
  const playerNames = getTrainingCourtPlayerNames(textNodes);
  let sawSetup = false;
  let namesAfterTurnHeader = 0;

  textNodes.forEach((value) => {
    const line = String(value || "").trimEnd();

    if (!line || line === "$") {
      return;
    }

    if (line === "Setup") {
      if (sawSetup) {
        return;
      }

      sawSetup = true;
      rawLines.push(line);
      namesAfterTurnHeader = 0;
      return;
    }

    if (!sawSetup) {
      return;
    }

    if (line.includes(" | Training Court")) {
      return;
    }

    if (line === "[playerName]'s Turn") {
      rawLines.push(line);
      namesAfterTurnHeader = playerNames.size;
      return;
    }

    if (namesAfterTurnHeader > 0 && playerNames.has(line)) {
      namesAfterTurnHeader -= 1;
      return;
    }

    rawLines.push(line);
    namesAfterTurnHeader = 0;
  });

  if (!rawLines.length || rawLines[0] !== "Setup") {
    throw new TrainingCourtImportError(
      "Could not find the Training Court battle log content on that page."
    );
  }

  const openingHandLines = rawLines.filter((line) =>
    line.includes("drew 7 cards for the opening hand.")
  );
  if (openingHandLines.length < 2) {
    throw new TrainingCourtImportError(
      "Training Court page loaded, but the raw battle log could not be reconstructed."
    );
  }

  return rawLines.join("\n");
}

export async function fetchTrainingCourtRawLog(urlValue: string): Promise<string> {
  const normalizedUrl = normalizeTrainingCourtLogUrl(urlValue);
  const response = await fetch(normalizedUrl, {
    signal: AbortSignal.timeout(10000),
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "Poke Notes Importer"
    }
  });

  if (!response.ok) {
    throw new TrainingCourtImportError(
      `Training Court request failed with status ${response.status}.`
    );
  }

  const html = await response.text();
  const textNodes = extractTrainingCourtTextNodes(html);
  return buildTrainingCourtRawLog(textNodes);
}

export async function resolveBattleLogImportInput(value: string): Promise<string> {
  const trimmedValue = String(value || "").trim();

  if (!trimmedValue) {
    return "";
  }

  if (isTrainingCourtLogUrl(trimmedValue)) {
    return await fetchTrainingCourtRawLog(trimmedValue);
  }

  if (looksLikeUrl(trimmedValue)) {
    throw new TrainingCourtImportError("Only Training Court log URLs are supported.");
  }

  return trimmedValue;
}
