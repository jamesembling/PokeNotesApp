import { normalizeText } from "@/lib/log-import/normalization";
import { normalizeLimitlessSetCode } from "@/lib/deck-lists/limitless";
import type { CardDefinition } from "@/lib/card-definition-catalog/types";
import type { ReplayProgram } from "./types";
import { loadReplayOfficialSetCodes } from "./linked-deck-list-server";

const number = (value: string) => value.trim().toUpperCase().replace(/^0+(?=\d)/, "");
const decode = (value: string) => value.replace(/&#(x[\da-f]+|\d+);|&(amp|quot|apos|lt|gt|nbsp|eacute);/gi, (entity, numeric: string | undefined, named: string | undefined) => {
  if (numeric) {
    const code = Number.parseInt(numeric.replace(/^x/i, ""), /^x/i.test(numeric) ? 16 : 10);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : entity;
  }
  return ({ amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", eacute: "é" } as Record<string, string>)[named!.toLowerCase()] ?? entity;
});
const attribute = (tag: string, name: string) => decode(new RegExp(`(?:^|\\s)${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(tag)?.[1] ?? "");
async function boundedPageText(response: Response): Promise<string | null> {
  if (Number(response.headers.get("content-length")) > 256_000 || !response.body) return null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return body + decoder.decode();
      bytes += chunk.value.byteLength;
      if (bytes > 256_000) { await reader.cancel(); return null; }
      body += decoder.decode(chunk.value, { stream: true });
    }
  } finally { reader.releaseLock(); }
}

/** The provider page must identify the same physical printing. Same-name or
 * same-HP substitutes are insufficient; the image URL comes from that page. */
export function selectExactReplayArtwork(
  html: string,
  printing: Pick<CardDefinition, "name" | "localId" | "hp">,
  officialCode: string,
): { imageUrl: string; sourceUrl: string } | null {
  const set = normalizeLimitlessSetCode(officialCode);
  const local = number(printing.localId);
  if (!/^[A-Z0-9-]{1,12}$/.test(set) || !/^[A-Z0-9]{1,12}$/.test(local) || html.length > 256_000) return null;
  const identity = `${set}/${local}`;
  const selectTag = html.match(/<select\b[^>]*\bdata-card-language\b[^>]*>/i)?.[0];
  if (!selectTag || attribute(selectTag, "data-location") !== identity) return null;
  const title = html.match(/<p\b[^>]*class=["'][^"']*\bcard-text-title\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1];
  const nameSpan = title?.match(/<span\b[^>]*class=["'][^"']*\bcard-text-name\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1];
  const link = nameSpan?.match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i);
  if (!link || attribute(link[1], "href") !== `/cards/${identity}` || normalizeText(decode(link[2].replace(/<[^>]*>/g, ""))) !== normalizeText(printing.name)) return null;
  if (printing.hp !== null && Number(/\b(\d+) HP\b/.exec(title!)?.[1]) !== printing.hp) return null;
  const imageArea = html.match(/<div\b[^>]*class=["'][^"']*\bcard-image\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1];
  const imageTag = imageArea?.match(/<img\b[^>]*>/i)?.[0];
  if (!imageTag) return null;
  const candidate = attribute(imageTag, "data-src") || attribute(imageTag, "src");
  try {
    const image = new URL(candidate);
    if (image.origin !== "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com" || image.username || image.password || image.search || image.hash) return null;
    const path = /^\/tpci\/([A-Z0-9-]+)\/([A-Z0-9-]+)_([A-Z0-9]+)_R_EN(?:_LG)?\.png$/.exec(image.pathname);
    if (!path || path[1] !== set || path[2] !== set || number(path[3]) !== local) return null;
    return { imageUrl: image.href, sourceUrl: `https://limitlesstcg.com/cards/${identity}` };
  } catch { return null; }
}

/** Public selected-print identity only. No player data or raw logs are sent.
 * Keep optional artwork bounded and return a new program without changing facts. */
export async function hydrateReplaySelectedArtwork(
  program: ReplayProgram,
  officialCodesBySetId: Readonly<Record<string, string>> = {},
  signal?: AbortSignal,
): Promise<ReplayProgram> {
  const budget = signal ? AbortSignal.any([signal, AbortSignal.timeout(2500)]) : AbortSignal.timeout(2500);
  const selected = new Map<string, CardDefinition>();
  for (const resolution of Object.values(program.cardResolutions ?? {})) {
    const printing = resolution.selectedDefinition;
    if (resolution.selectedPrinting?.imageUrl || !printing || printing.sourceCardId !== resolution.selectedPrinting?.sourceCardId
      || printing.setId !== resolution.selectedPrinting.setId || number(printing.localId) !== number(resolution.selectedPrinting.localId)
      || normalizeText(printing.name) !== normalizeText(resolution.name) || !/^[a-zA-Z0-9._-]{1,32}$/.test(printing.setId)
      || !/^[A-Za-z0-9]{1,12}$/.test(printing.localId)) continue;
    if (selected.size < 24) selected.set(printing.sourceCardId, printing);
  }
  if (!selected.size) return program;
  const providedCodes = Object.fromEntries(Object.entries(officialCodesBySetId).filter(([, code]) => /^[A-Za-z0-9.-]{1,12}$/.test(code)));
  const missingSets = [...new Set([...selected.values()].map((printing) => printing.setId))].filter((id) => !Object.hasOwn(providedCodes, id));
  const setCodes = { ...await loadReplayOfficialSetCodes(missingSets, budget), ...providedCodes };
  const jobs = [...selected.values()];
  const artwork = new Map<string, { imageUrl: string; sourceUrl: string }>();
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async () => {
    while (next < jobs.length && !budget.aborted) {
      const printing = jobs[next++];
      const code = setCodes[printing.setId];
      if (!code) continue;
      const set = normalizeLimitlessSetCode(code);
      if (!/^[A-Z0-9-]{1,12}$/.test(set)) continue;
      try {
        const response = await fetch(`https://limitlesstcg.com/cards/${set}/${number(printing.localId)}`, { signal: budget, next: { revalidate: 86400 } });
        if (!response.ok) continue;
        const body = await boundedPageText(response);
        const found = body === null ? null : selectExactReplayArtwork(body, printing, code);
        if (found) artwork.set(printing.sourceCardId, found);
      } catch { /* Optional art cannot change printing facts or block replay. */ }
    }
  }));
  if (!artwork.size) return program;
  const cardResolutions = Object.fromEntries(Object.entries(program.cardResolutions ?? {}).map(([key, resolution]) => {
    const found = resolution.selectedPrinting && artwork.get(resolution.selectedPrinting.sourceCardId);
    return [key, found && resolution.selectedDefinition ? { ...resolution,
      selectedPrinting: { ...resolution.selectedPrinting!, imageUrl: found.imageUrl },
      selectedDefinition: { ...resolution.selectedDefinition, imageUrl: found.imageUrl },
      artworkSource: { provider: "limitless" as const, sourceUrl: found.sourceUrl },
    } : resolution];
  }));
  return { ...program, cardResolutions };
}
