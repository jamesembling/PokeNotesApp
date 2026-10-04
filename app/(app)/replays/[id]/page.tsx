import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/shadcn/button";
import { BattleReplay } from "@/components/battle-replay/BattleReplay";
import { PageActions } from "@/components/ui/PageActions";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageWidth } from "@/components/ui/PageWidth";
import { ItemTitle } from "@/components/ui/Typography";
import { requireUser } from "@/lib/auth";
import { resolveBattleLogEffectCatalogEvidence, resolveBattleLogEffectEvidenceFromRows, createBattleLogEffectEvidenceResolver } from "@/lib/battle-log/effect-catalog";
import { buildCardDefinitionIndex, definitionEffectRows, resolveCardDefinition } from "@/lib/card-definition-catalog/resolve";
import { loadCardDefinitions } from "@/lib/card-definition-catalog/server";
import { normalizeText } from "@/lib/log-import/normalization";
import { collectReplayDefinitionNames, collectReplayOwnerCardCounts, collectReplayOwnerCardNames } from "@/lib/battle-replay/metadata";
import type { ReplayEffectKind } from "@/lib/battle-replay/types";
import { compileBattleReplay } from "@/lib/battle-replay/compiler";
import { getLogById } from "@/lib/db/logs";
import { getDeckListById } from "@/lib/db/deck-lists";
import { getLinkedReplayDefinitions, getReplayLinkedDeckListCompatibility } from "@/lib/battle-replay/linked-deck-list";
import { loadReplaySetCodes } from "@/lib/battle-replay/linked-deck-list-server";
import { hydrateReplaySelectedArtwork } from "@/lib/battle-replay/selected-artwork-server";

export const metadata: Metadata = { title: "Battle Replay (Beta) | Poke Notes" };

export default async function ReplayPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ position?: string | string[] }>;
}) {
  const [user, { id }, query] = await Promise.all([requireUser(), params, searchParams]);
  if (!id || id.length > 256 || /[\u0000-\u001f\u007f]/.test(id)) notFound();
  const log = await getLogById(user.id, id);
  if (!log) notFound();
  const logHref = `/logs/${encodeURIComponent(log.id)}`;
  const rawLines = log.sections.flatMap((section) => section.actions.flatMap((action) => [action.title, ...action.details]));
  const actionCount = log.sections.reduce((total, section) => total + section.actions.length, 0);
  const withinBounds = actionCount <= 600 && rawLines.length <= 1200 && JSON.stringify(log.sections).length <= 120_000;
  // A bounded evidence pass discovers visible card names before public metadata
  // lookup. Neither private player identities nor raw logs enter the catalogue.
  const preliminary = withinBounds ? compileBattleReplay(log) : null;
  const definitionNames = preliminary && preliminary.status !== "unsupported" ? collectReplayDefinitionNames(preliminary, rawLines, [log.selfPlayerName, log.opponentPlayerName]) : [];
  const signal = AbortSignal.timeout(2500);
  const [legacyEvidence, loadedDefinitions, linkedDeckList] = await Promise.all([
    withinBounds ? resolveBattleLogEffectCatalogEvidence(rawLines, signal) : Promise.resolve({ rows: [] }),
    loadCardDefinitions(definitionNames, signal),
    preliminary && preliminary.status !== "unsupported" && log.linkedDeckListId ? getDeckListById(user.id, log.linkedDeckListId, log.linkedDeckId) : Promise.resolve(null),
  ]);
  const cardDefinitions = Object.fromEntries(Object.entries(loadedDefinitions).map(([name, evidence]) => [name,
    resolveCardDefinition(buildCardDefinitionIndex(evidence.candidates), { name, declaredFormat: log.format }, evidence.coverage, evidence.generation, evidence.sourceCoverage)]));
  const linkedCompatibility = linkedDeckList && preliminary ? getReplayLinkedDeckListCompatibility(linkedDeckList.parsedCards,
    collectReplayOwnerCardNames(preliminary, "self"), collectReplayOwnerCardCounts(preliminary, "self")) : undefined;
  const selfCardDefinitions = linkedDeckList && linkedCompatibility?.status === "compatible" ? getLinkedReplayDefinitions(linkedDeckList.parsedCards, loadedDefinitions,
    await loadReplaySetCodes(linkedDeckList.parsedCards, loadedDefinitions), log.format) : undefined;
  const completeDefinitions = Object.values(cardDefinitions).filter((evidence) => evidence.coverage === "complete" && evidence.candidates.length);
  const verifiedNames = new Set(completeDefinitions.flatMap((evidence) => evidence.candidates.map((card) => normalizeText(card.name))));
  const rows = [
    ...legacyEvidence.rows.filter((row) => !verifiedNames.has(normalizeText(row.normalized_card_name || row.card_name))),
    ...definitionEffectRows(completeDefinitions.flatMap((evidence) => evidence.candidates)),
  ];
  const catalogEvidence = resolveBattleLogEffectEvidenceFromRows(rawLines, rows);
  const effectResolver = createBattleLogEffectEvidenceResolver(rows);
  const supportedTags = new Set<string>(["ability", "attack", "item", "supporter", "tool", "stadium"]);
  const effectTags: Record<string, ReplayEffectKind> = {};
  const effectOrigins: Record<string, "hand" | "deck" | "discard"> = {};
  const effectDetailOrigins: Record<string, "hand" | "deck" | "discard"> = {};
  let actionIndex = 0;
  for (const section of log.sections) for (const action of section.actions) {
    action.details.forEach((detail, detailIndex) => {
      const origin = effectResolver.origin(action.title, detail);
      if (origin) effectDetailOrigins[`${actionIndex}:${detailIndex}`] = origin;
    });
    actionIndex++;
  }
  for (const rawLine of rawLines) {
    const tag = catalogEvidence.tags.get(rawLine.trim());
    const origin = catalogEvidence.origins.get(rawLine.trim());
    if (origin) effectOrigins[rawLine] = origin;
    if (tag && supportedTags.has(tag)) effectTags[rawLine] = tag as ReplayEffectKind;
  }
  const program = await hydrateReplaySelectedArtwork(compileBattleReplay({ ...log, effectTags, effectOrigins, effectDetailOrigins, cardDefinitions: loadedDefinitions, selfCardDefinitions }));
  const requestedPosition = Array.isArray(query.position) ? query.position[0] : query.position;
  const position = requestedPosition && /^\d{1,8}$/.test(requestedPosition) ? Number(requestedPosition) : 0;
  const initialActionIndex = Math.min(position, Math.max(0, program.frames.length - 1));

  return <PageWidth size="wide">
    <PageHeader
      action={<PageActions><Button asChild variant="outline"><Link href={logHref} prefetch={false}>View Battle Log</Link></Button><Button asChild variant="outline"><Link href="/replays" prefetch={false}>Choose another game</Link></Button></PageActions>}
      breadcrumb={[{ label: "Poke Notes", href: "/dashboard" }, { label: "Battle Replay", href: "/replays" }, { label: "Replay" }]}
      subtitle="Beta · Replay the game from its saved Battle Log."
      title="Battle Replay"
    />
    {program.status === "unsupported" ? <section className="flex flex-col items-start gap-3 border-t border-border py-6" aria-label="Replay unavailable">
      <ItemTitle as="h2">This Battle Log cannot be replayed yet</ItemTitle>
      <p className="max-w-prose text-sm text-muted-foreground">Its saved actions do not contain enough supported information. You can still read the original Battle Log.</p>
      <Button asChild variant="outline"><Link href={logHref} prefetch={false}>View Battle Log</Link></Button>
    </section> : <BattleReplay initialActionIndex={initialActionIndex} key={program.id} program={program} />}
  </PageWidth>;
}
