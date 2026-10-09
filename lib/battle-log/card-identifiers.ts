import { normalizeText } from "@/lib/log-import/normalization";

/** PTCGL identifies printings, not individual copies: (sv5_84) Relicanth. */
const identifiers = /\(([a-z][a-z0-9.-]*)_([a-z0-9-]+)\)\s*/gi;

export type LogCardIdentity = { setId: string; localId: string };

export function stripLogCardIdentifiers(line: string): string {
  return line.replace(identifiers, "");
}

function catalogueSetId(code: string): string {
  const sv = /^sv(\d+)(?:pt(\d+))?$/i.exec(code);
  return sv ? `sv${sv[1].padStart(2, "0")}${sv[2] ? `.${sv[2]}` : ""}` : code.toLowerCase();
}

/** Match a parsed card name back to its original source token. Ownership is
 * taken from a named possessive or the leading player, never the card name. */
export function logCardIdentities(line: string, name: string, owner?: string, players: readonly string[] = []): LogCardIdentity[] {
  const result: LogCardIdentity[] = [];
  for (const match of line.matchAll(identifiers)) {
    const following = stripLogCardIdentifiers(line.slice(match.index! + match[0].length));
    if (!name || normalizeText(following.slice(0, name.length)) !== normalizeText(name)
      || following.length > name.length && !/[\s,.!?]/.test(following[name.length])) continue;
    if (owner) {
      const prefix = stripLogCardIdentifiers(line.slice(0, match.index));
      const possessives = players.map((player) => ({ player, at: Math.max(prefix.lastIndexOf(`${player}'s `), prefix.lastIndexOf(`${player}’s `)) }))
        .filter((entry) => entry.at >= 0).sort((a, b) => b.at - a.at);
      const recordedOwner = possessives[0]?.player ?? players.find((player) => prefix.trim().replace(/^[-•]\s*/, "").startsWith(`${player} `));
      if (recordedOwner && recordedOwner !== owner) continue;
    }
    result.push({ setId: catalogueSetId(match[1]), localId: match[2].replace(/^0+(?=\d)/, "") });
  }
  return result;
}

export function logCardIdentity(line: string, name: string, owner?: string, players?: readonly string[]): LogCardIdentity | undefined {
  const identities = logCardIdentities(line, name, owner, players);
  return identities.length && identities.every((identity) => identity.setId === identities[0].setId && identity.localId === identities[0].localId)
    ? identities[0] : undefined;
}
