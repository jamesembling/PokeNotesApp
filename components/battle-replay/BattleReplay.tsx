"use client";

import Image from "next/image";
import { createContext, memo, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  TriangleIcon,
  TrophyIcon,
  CircleHelpIcon,
  ZapIcon,
} from "lucide-react";
import { Button } from "@/components/shadcn/button";
import { SectionTitle } from "@/components/ui/Typography";
import { AppDialogContent } from "@/components/ui/AppDialog";
import {
  Dialog,
  DialogDescription,
  DialogTitle,
} from "@/components/shadcn/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/shadcn/sheet";
import {
  type ReplayActor,
  type ReplayCard,
  type ReplayEvent,
  type ReplayState,
  type ReplaySide,
  type ReplayTransaction,
  type ReplayTransactionStage,
  type ReplayProgram,
  type ReplayZoneCard,
} from "@/lib/battle-replay/types";
import {
  resolveBoardCardPreview,
  resolveEnergyMarkers,
  resolveOpeningCoinToss,
  resolveOpeningTurnChoice,
  resolveResultOnlyCoinFlip,
  resolveTransactionActors,
  resolveTransactionStage,
  shouldShowTransactionEvolutionStack,
  resolveReplayCardPreviewDefinition,
} from "@/lib/battle-replay/preview";
import styles from "./battle-replay.module.css";

function UnavailableArtwork({ name }: { name: string }) {
  return <span className={styles.unavailableArtwork}><strong>{name}</strong><span>Artwork unavailable</span></span>;
}

const ArtworkContext = createContext<Record<string, string>>({});
const TurnActorContext = createContext<ReplayActor | null>(null);
const DefinitionContext = createContext<ReplayProgram["cardResolutions"]>({});

function CardArtwork({ card, alt, sizes }: { card: Pick<ReplayZoneCard, "name" | "imageUrl" | "definitionKey">; alt: string; sizes: string }) {
  const artwork = useContext(ArtworkContext);
  const cardResolutions = useContext(DefinitionContext);
  const resolution = resolveReplayCardPreviewDefinition(card, { cardResolutions });
  const src = resolution ? resolution.selectedPrinting?.imageUrl : card.imageUrl || (Object.hasOwn(artwork, card.name) ? artwork[card.name] : undefined);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return src && failedSrc !== src
    ? <Image className={styles.cardArtwork} quality={95} alt={resolution?.displayBasis === "played_evidence" ? `${card.name}, recorded printing` : alt} fill sizes={sizes} src={src} onError={() => setFailedSrc(src)} />
    : <UnavailableArtwork name={card.name} />;
}

const TimelineAction = memo(function TimelineAction({ event, selected, step, onSeek }: {
  event: ReplayEvent; selected: boolean; step: number; onSeek: (index: number) => void;
}) {
  return <li><button aria-current={selected ? "step" : undefined} className={styles.timelineAction}
    data-actor={event.actor} data-selected={selected || undefined} onClick={() => onSeek(step)} type="button">
    <span>{event.turn === 0 ? "Setup" : `Turn ${event.turn}`}</span><strong>{event.label}</strong>
    <p>{event.summary}</p>
    {event.unresolved?.length ? <small>Unresolved · {event.unresolved.join("; ")}</small> : null}
  </button></li>;
});

type PreviewCard = ReplayZoneCard & {
  abilityUsed?: boolean;
  conditions?: ReplayCard["conditions"];
  damage?: number;
  damageKnown?: boolean;
  energy?: string[];
  hp?: number | null;
  baseHp?: number | null;
  underlying?: ReplayZoneCard[];
  tool?: string;
  instanceUncertain?: boolean;
  hpBasis?: ReplayCard["hpBasis"];
  hpModifierBasis?: ReplayCard["hpModifierBasis"];
};

function AbilityUsedMarker({ className }: { className: string }) {
  return (
    <span aria-label="Ability used this turn" className={className}>
      <TriangleIcon aria-hidden="true" />
    </span>
  );
}

/** Historical member references establish printings, not current board flags. */
function printingPreview(card: ReplayZoneCard): PreviewCard {
  const { id, name, imageUrl, definitionKey, setId, localId, observedEffects, definitionOwner } = card;
  return { id, name, imageUrl, definitionKey, setId, localId, observedEffects, definitionOwner };
}

const PLAYED_DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function formatPlayedOn(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value || "Date not recorded" : PLAYED_DATE_FORMATTER.format(date);
}

const energySymbolTypes = new Set(["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "metal", "fairy", "dragon", "colorless"]);

function EnergyOrbs({ energy, className }: { energy: string[]; className: string }) {
  const markers = resolveEnergyMarkers(energy);
  return <div aria-label={`${energy.length} Energy attached: ${energy.join(", ")}`} className={`${styles.energyOrbs} ${className}`}>
    {markers.map(({ count, type }, index) => <span className={styles.energyOrb} key={`${type}-${index}`} aria-label={`${count ?? 1} ${type} Energy attached`} title={`${count ?? 1} ${type} Energy attached`}>
      {energySymbolTypes.has(type.toLowerCase()) ? <Image alt="" width={64} height={64} src={`/images/battle-replay/energy/${type.toLowerCase()}.svg`} /> : <CircleHelpIcon aria-hidden="true" />}
      {count ? <strong aria-hidden="true" className={styles.energyOrbCount}>{count}</strong> : null}
    </span>)}
  </div>;
}

function ConditionMarkers({ conditions }: { conditions?: ReplayCard["conditions"] }) {
  if (!conditions?.length) return null;
  return <div className={styles.conditionMarkers}>
    {conditions.map((condition) => <span key={condition} aria-label={condition} title={condition} className={styles.conditionMarker} data-condition={condition}>
      {condition === "Asleep" ? <span aria-hidden="true">Zzz</span> : condition === "Paralyzed" ? <ZapIcon aria-hidden="true" /> : condition === "Confused" ? <CircleHelpIcon aria-hidden="true" /> : <Image alt="" width={41} height={41} src={`/images/battle-replay/conditions/${condition.toLowerCase()}.png`} />}
    </span>)}
  </div>;
}

function CardFace({
  card,
  actor,
  attackName,
  damageTaken = 0,
  knockedOut = false,
  effectKey,
  compact = false,
  faceDown = false,
  instantReveal = false,
  motion,
  onPreview,
}: {
  card: ReplayCard;
  actor: ReplayActor;
  attackName?: string;
  damageTaken?: number;
  knockedOut?: boolean;
  effectKey?: string;
  compact?: boolean;
  faceDown?: boolean;
  instantReveal?: boolean;
  motion?: "bench" | "evolve" | "promote" | "retreat";
  onPreview: (card: PreviewCard) => void;
}) {
  const stackRef = useRef<HTMLDivElement>(null);
  const turnActor = useContext(TurnActorContext);
  const abilityUsed = Boolean(card.abilityUsed && turnActor === actor);
  const cardResolutions = useContext(DefinitionContext);
  const probableHp = card.hpBasis === "probable" || card.hp === null
    && resolveReplayCardPreviewDefinition(card, { cardResolutions })?.hpBasis === "probable";
  useEffect(() => {
    if (!knockedOut) return;
    const stack = stackRef.current;
    const destination = stack?.closest("section")?.querySelector<HTMLElement>('[data-pile-face="Discard"]');
    if (!stack || !destination) return;
    const source = stack.getBoundingClientRect();
    const target = destination.getBoundingClientRect();
    const x = target.left - source.left;
    const y = target.top - source.top;
    const scale = target.width / source.width;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animation = stack.animate(reducedMotion ? [
      { opacity: 1 }, { opacity: 0 },
    ] : [
      { transform: "translate(0, 0) scale(1)", opacity: 1, offset: 0 },
      { transform: `translate(${x * 0.3}px, ${y * 0.3 - 30}px) scale(1.05) rotate(-8deg)`, opacity: 1, offset: 0.3 },
      { transform: `translate(${x}px, ${y}px) scale(${scale}) rotate(0deg)`, opacity: 1, offset: 0.85 },
      { transform: `translate(${x}px, ${y}px) scale(${scale}) rotate(0deg)`, opacity: 0, offset: 1 },
    ], { delay: 850, duration: reducedMotion ? 250 : 850, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" });
    return () => animation.cancel();
  }, [knockedOut, effectKey]);
  const remainingHp = card.hp === null || card.damageKnown === false ? null : Math.max(0, card.hp - card.damage);
  const healthPercent = card.hp && remainingHp !== null ? Math.round((remainingHp / card.hp) * 100) : 100;
  const healthTone =
    healthPercent <= 24
      ? "critical"
      : healthPercent <= 75
        ? "warning"
        : "healthy";

  return (
    <div
      ref={stackRef}
      className={styles.cardStack}
      data-board-card={card.id}
      data-card-name={card.name}
      data-copy-uncertain={card.instanceUncertain || undefined}
      data-compact={compact || undefined}
      data-motion={motion}
      data-knocked-out={knockedOut || undefined}
      data-face-down={faceDown || undefined}
      data-reveal-instant={instantReveal || undefined}
      data-has-energy={card.energy.length > 0 || undefined}
    >
      {knockedOut ? <span key={`ko-${effectKey}`} className={styles.knockoutStamp} role="status" aria-label={`${card.name} was Knocked Out`}>KO</span> : null}
      {attackName ? <div key={`attack-${effectKey}`} className={styles.boardAttack} aria-hidden="true"><span className={styles.attackPulse} /></div> : null}
      {damageTaken > 0 ? <span key={`damage-${effectKey}`} className={styles.attackDamage} role="status" aria-label={`${card.name} took ${damageTaken} damage`}>−{damageTaken}</span> : null}
      <div className={styles.cardSurface}>
      {!faceDown && card.energy.length ? <div className={styles.attachedEnergyCards} aria-label="Attached Energy artwork">
        {[...new Set(card.energy)].slice(0, 3).map((energy, index) => {
          const name = /Energy$/.test(energy) ? energy : `Basic ${energy} Energy`;
          const imageUrl = Object.values(cardResolutions ?? {}).find((resolution) => resolution.name === name && resolution.selectedPrinting?.imageUrl)?.selectedPrinting?.imageUrl ?? "";
          return <button type="button" className={styles.attachedEnergyCard} style={{ "--energy-layer": index } as React.CSSProperties}
            aria-label={`Preview attached ${name}, representative artwork`} key={name}
            onClick={() => onPreview({ id: `${card.id}-energy-${index}`, name, imageUrl })}>
            <CardArtwork card={{ name, imageUrl }} alt={`${name}, representative attached Energy artwork`} sizes="100px" />
          </button>;
        })}
      </div> : null}
      <button
        aria-label={faceDown ? "Face-down Pokémon" : `Preview ${card.name}${abilityUsed ? ", ability used this turn" : ""}`}
        disabled={faceDown}
        className={`${styles.cardFace} ${styles.cardPreviewTrigger}`}
        onClick={() => onPreview({ ...card, abilityUsed })}
        type="button"
      >
        <span className={styles.cardFlipper}>
          <span aria-hidden={faceDown} className={styles.cardFront}>
            <CardArtwork card={card} alt={`${card.name}, representative card artwork`} sizes={compact ? "80px" : "144px"} />
            {card.damageKnown === false ? <span aria-label="Accumulated damage unknown" className={styles.damageBadge}>?</span> : card.damage > 0 ? (
              <span
                aria-label={`${card.damage} damage`}
                className={styles.damageBadge}
              >
                {card.damage}
              </span>
            ) : null}
            {abilityUsed ? (
              <AbilityUsedMarker className={styles.boardAbilityUsedMarker} />
            ) : null}
          </span>
          <span aria-hidden="true" className={styles.cardReverse}><span className={styles.cardBack} /></span>
        </span>
      </button>
      {!faceDown ? <ConditionMarkers conditions={card.conditions} /> : null}
      {card.energy.length > 0 && !faceDown ? <EnergyOrbs energy={card.energy} className={styles.boardEnergyOrbs} /> : null}
      </div>
      {card.instanceUncertain && !faceDown ? <span className={styles.copyUncertain} title="The log establishes this Pokémon, but does not identify which same-name physical copy it is.">Copy uncertain</span> : null}
      <div aria-hidden={faceDown} className={styles.healthStatus} data-tone={remainingHp === null ? "unknown" : healthTone}>
        {remainingHp !== null && card.hp !== null ? <div
          aria-label={`${card.name}: ${probableHp ? "probably " : ""}${remainingHp} of ${card.hp} HP remaining`}
          aria-valuemax={card.hp}
          aria-valuemin={0}
          aria-valuenow={remainingHp}
          className={styles.healthTrack}
          role="meter"
        >
          <span style={{ transform: `scaleX(${healthPercent / 100})` }} />
        </div> : null}
        <strong>{remainingHp !== null ? `${remainingHp} HP` : card.hp !== null ? `${card.hp} max HP · damage ?` : card.baseHp ? `${card.baseHp} printed HP · max ?` : "HP ?"}</strong>
        {card.hpModifierBasis === "unverified_attachment" ? <span className={styles.probableHp}>Attached effect unverified</span> : null}
      </div>
    </div>
  );
}

function PileFace({ card, hidden }: { card?: ReplayZoneCard; hidden?: boolean }) {
  if (card) return <CardArtwork card={card} alt="" sizes="72px" />;

  if (hidden) return <div aria-hidden="true" className={styles.cardBack} />;

  return <div className={styles.emptyPile} />;
}

function Pile({
  animate,
  count,
  label,
  onInspect,
  topCard,
}: {
  animate?: boolean;
  count: number | null;
  label: string;
  onInspect?: () => void;
  topCard?: ReplayZoneCard;
}) {
  const pileContents = (
    <>
      <div className={styles.pileCards} data-pile-face={label} data-empty={count === 0 || undefined} data-new-card={animate || undefined} key={topCard?.id ?? label}>
        <PileFace card={topCard} hidden={(label === "Deck" || label === "Prizes") && count !== 0} />
      </div>
      <span>{label}</span>
      <strong>{count ?? "Unknown"}</strong>
    </>
  );

  if (!onInspect) {
    return (
      <div aria-label={count === null ? `${label} count unknown` : `${count} cards in ${label.toLowerCase()}`} className={styles.pile}>
        {pileContents}
      </div>
    );
  }

  return (
    <button
      aria-label={`View ${label.toLowerCase()}, ${count === null ? "total count unknown" : `${count} ${count === 1 ? "card" : "cards"}`}`}
      className={styles.pile}
      disabled={count === 0}
      onClick={onInspect}
      type="button"
    >
      {pileContents}
    </button>
  );
}

function PrizeTrack({ remaining }: { remaining: number | null }) {
  return (
    <div
      aria-label={remaining === null ? "Prize cards remaining unknown" : `${remaining} Prize cards remaining`}
      className={styles.prizes}
    >
      <Pile count={remaining} label="Prizes" />
    </div>
  );
}

function HandFan({ actor, onPreview, side, opening }: { actor: ReplayActor; onPreview: (card: PreviewCard) => void; side: ReplaySide; opening: boolean }) {
  const visibleCardCount = side.handCount ?? (actor === "self" ? side.knownHand.length : 0);
  return (
    <div
      aria-label={
        actor === "self"
          ? side.handCount === null ? "Your hand count is unknown" : `${side.handCount} cards in your hand`
          : side.handCount === null ? "Opponent hand count is unknown" : `${side.handCount} cards in the opponent's hidden hand`
      }
      className={styles.handArea}
      data-replay-hand={actor}
      data-opening={opening || undefined}
    >
      <div className={styles.handLabel}>
        <span>Hand</span>
        <strong>{side.handCount ?? "Unknown"}</strong>
      </div>
      <div className={styles.handCards}>
        {Array.from({ length: visibleCardCount }).map((_, index) => {
          const knownCard =
            actor === "self" ? side.knownHand[index] : undefined;
          return (
            <div
              aria-label={knownCard?.name}
              className={styles.handCard}
              data-known={Boolean(knownCard?.imageUrl) || undefined}
              data-hand-card={knownCard?.name}
              data-hand-card-id={knownCard?.id}
              data-hand-index={index}
              key={knownCard?.id ?? `hidden-${index}`}
            >
              {knownCard ? (
                <button aria-label={`Preview ${knownCard.name}`} className={styles.cardPreviewTrigger} onClick={() => onPreview(knownCard)} type="button">
                  <CardArtwork card={knownCard} alt={`${knownCard.name}, representative card artwork in hand`} sizes="80px" />
                </button>
              ) : (
                <div aria-hidden="true" className={styles.cardBack} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StadiumSpot({
  actor,
  onPreview,
  stadium,
}: {
  actor: ReplayActor;
  onPreview: (card: PreviewCard) => void;
  stadium: ReplayState["stadium"];
}) {
  if (!stadium || stadium.actor !== actor) return null;

  return (
    <div className={styles.stadiumSpot}>
      <span>Stadium</span>
      <button aria-label={`Preview ${stadium.name}`} data-board-stadium={actor} className={`${styles.stadium} ${styles.cardPreviewTrigger}`} onClick={() => onPreview({ ...stadium, id: "stadium" })} type="button">
        <CardArtwork card={stadium} alt={`${stadium.name}, representative card artwork`} sizes="(max-width: 40rem) 56px, 80px" />
      </button>
      <strong className={styles.stadiumName}>{stadium.name}</strong>
    </div>
  );
}

function TransactionCards({ actor, onPreview, previousState, stage, state }: { actor: ReplayActor; onPreview: (card: PreviewCard) => void; previousState: ReplayState; stage: ReplayTransactionStage; state: ReplayState }) {
  const turnActor = useContext(TurnActorContext);
  const hiddenCardCount = Math.max(0, Math.floor(stage.hiddenCount ?? 0));
  return <div className={styles.transactionCards} data-many={stage.cards.length > 4 || undefined}>
    {stage.cards.map((card) => {
      const boardCard = resolveBoardCardPreview(card, stage, actor, state, previousState);
      const hasBoardState = boardCard.hp !== undefined;
      const abilityUsed = Boolean(boardCard.abilityUsed && turnActor === actor);
      return <div className={styles.transactionCardState} data-stateful={hasBoardState || undefined} key={card.id}>
        {shouldShowTransactionEvolutionStack(stage, boardCard) ? <div aria-label={`Evolution stack: ${boardCard.underlying?.map((item) => item.name).join(", ")}`} className={styles.transactionEvolutionStack}>
          {(boardCard.underlying ?? []).map((item) => <span key={item.id}>
            <CardArtwork card={item} alt="" sizes="82px" />
          </span>)}
        </div> : null}
        <button aria-label={`Preview ${card.name}${abilityUsed ? ", ability used this turn" : ""}`} className={`${styles.transactionCard} ${styles.cardPreviewTrigger}`} onClick={() => onPreview({ ...boardCard, abilityUsed })} type="button">
          <CardArtwork card={boardCard} alt={`${card.name}, representative card artwork`} sizes="112px" />
        </button>
        <ConditionMarkers conditions={boardCard.conditions} />
        {boardCard.damageKnown === false ? <span aria-label="Accumulated damage unknown" className={styles.transactionDamageCounter}>?</span> : boardCard.damage ? <span aria-label={`${boardCard.damage} damage`} className={styles.transactionDamageCounter}>{boardCard.damage}</span> : null}
        {abilityUsed ? <AbilityUsedMarker className={styles.transactionAbilityUsedMarker} /> : null}
        {boardCard.energy?.length ? <EnergyOrbs energy={boardCard.energy} className={styles.transactionEnergyOrbs} /> : null}
        {boardCard.tool ? <span className={styles.transactionTool}>Tool · {boardCard.tool}</span> : null}
      </div>;
    })}
    {hiddenCardCount ? <div aria-label={`${hiddenCardCount} unknown ${hiddenCardCount === 1 ? "card" : "cards"}`} className={styles.transactionHiddenCards}>
      <div aria-hidden="true" className={styles.transactionCard} data-hidden><div className={styles.cardBack} /></div>
      <span aria-hidden="true" className={styles.transactionCount}>{hiddenCardCount}</span>
    </div> : null}
  </div>;
}

function TransactionOverlay({ onPreview, previousState, state, transaction }: { onPreview: (card: PreviewCard) => void; previousState: ReplayState; state: ReplayState; transaction: ReplayTransaction }) {
  return <section aria-label={`${transaction.title} card resolution`} className={styles.transactionOverlay} data-actor={transaction.actor}>
    <div className={styles.transactionHeading}>
      <span>{transaction.actor === "self" ? "Your action" : "Opponent action"}</span>
      <strong>{transaction.title}</strong>
    </div>
    <ol className={styles.transactionRail}>{transaction.stages.map((stage, index) => {
      const actors = resolveTransactionActors(stage, transaction.actor);
      return <li className={styles.transactionStage} data-kind={stage.kind} data-multi-actor={actors.length > 1 || undefined} key={`${stage.kind}-${index}`}>
        {index > 0 ? <ChevronRightIcon aria-hidden="true" className={styles.transactionArrow} /> : null}
        <div className={styles.transactionStep}>
          <span>{stage.label}</span>
          <div className={styles.transactionParticipants} data-multiple={actors.length > 1 || undefined}>
            {actors.map((actor) => <div className={styles.transactionParticipant} data-actor={actor} key={actor}>
              {actors.length > 1 ? <strong>{actor === "self" ? "You" : "Opponent"}</strong> : null}
              <TransactionCards actor={actor} onPreview={onPreview} previousState={previousState} stage={resolveTransactionStage(stage, actor, previousState, state)} state={state} />
            </div>)}
          </div>
          {stage.damageModifier ? <div
            aria-label={`${stage.damageModifier.type} Weakness. ${stage.damageModifier.baseDamage} ${stage.damageModifier.multiplier ? `times ${stage.damageModifier.multiplier}` : `plus ${stage.damageModifier.bonusDamage}`} equals ${stage.damageModifier.baseDamage + stage.damageModifier.bonusDamage} damage`}
            className={styles.transactionWeaknessBreakdown}
          >
            <span>{stage.damageModifier.type} Weakness</span>
            <strong>{stage.damageModifier.baseDamage} {stage.damageModifier.multiplier ? `x ${stage.damageModifier.multiplier}` : `+ ${stage.damageModifier.bonusDamage}`} = {stage.damageModifier.baseDamage + stage.damageModifier.bonusDamage}</strong>
          </div> : stage.detail ? <small>{stage.detail}</small> : null}
        </div>
      </li>;
    })}</ol>
    <p>Logged movement · representative card artwork</p>
  </section>;
}

type CoinFlipPhase = "call" | "toss" | "result";

function useCoinFlipPhase(event: ReplayEvent | null): CoinFlipPhase {
  const openingToss = resolveOpeningCoinToss(event);
  const initialPhase: CoinFlipPhase = openingToss ? "call" : "toss";
  const [step, setStep] = useState<{ event: ReplayEvent | null; phase: CoinFlipPhase }>({ event: null, phase: "call" });
  useEffect(() => {
    const hasOpeningToss = Boolean(resolveOpeningCoinToss(event));
    const hasResultOnlyFlip = Boolean(resolveResultOnlyCoinFlip(event));
    if (!hasOpeningToss && !hasResultOnlyFlip) {
      setStep({ event, phase: "call" });
      return;
    }
    setStep({ event, phase: hasOpeningToss ? "call" : "toss" });
    const toss = hasOpeningToss
      ? window.setTimeout(() => setStep({ event, phase: "toss" }), 900)
      : undefined;
    const result = window.setTimeout(
      () => setStep({ event, phase: "result" }),
      hasOpeningToss ? 2300 : 1400,
    );
    return () => {
      if (toss) window.clearTimeout(toss);
      window.clearTimeout(result);
    };
  }, [event]);
  return step.event === event ? step.phase : initialPhase;
}

function BoardCardPools({ cards, onPreview, side }: {
  cards: ReplayCard[];
  onPreview: (card: PreviewCard) => void;
  side: ReplaySide;
}) {
  const cardResolutions = useContext(DefinitionContext);
  return side.boardPools?.map((pool) => {
    const members = pool.memberIds.map((id) => cards.find((card) => card.id === id)?.name ?? "Pokémon");
    const assignmentKnown = pool.memberIds.length === 1;
    const locationLabels = { board: "in play", hand: "in hand", discard: "in discard", deck: "in deck" };
    const locationGroups = [...(pool.possiblyReturnedCards?.length ? [{ cards: pool.possiblyReturnedCards, destinations: ["hand" as const, ...(pool.possibleReturnedDestinations ?? [])] }] : []), ...(pool.uncertainCards ?? [])];
    const evidence = pool.memberEvidence?.filter((card) => card.observedEffects?.length || card.setId) ?? [];
    const knownHpEvidence = [...new Set(evidence.flatMap((card) => {
      const resolution = resolveReplayCardPreviewDefinition(card, { cardResolutions });
      return resolution?.hpBasis === "known" && resolution.printedHp ? [`${card.name} · ${resolution.printedHp} printed HP`] : [];
    }))];
    return <div className={styles.boardPool} key={pool.id} role="group" aria-label={`${side.name} card assignment evidence`}>
      <strong>{pool.cards.length ? `In play · ${assignmentKnown ? `with ${members[0]}` : "copy assignment unknown"}` : locationGroups.length ? "Card location evidence" : "Recorded printing evidence"}</strong>
      {pool.cards.length && !assignmentKnown ? <p>On one of: {members.join(", ")}</p> : null}
      {knownHpEvidence.length ? <p>Known printing evidence: {knownHpEvidence.join("; ")}</p> : null}
      <ul>{pool.cards.map((card) => <li key={card.id}>
        <button type="button" className={styles.poolCard}
          aria-label={`Preview ${card.name}, in play ${assignmentKnown ? `with ${members[0]}` : "with copy assignment unknown"}`}
          onClick={() => onPreview(card)}>
          <span><CardArtwork card={card} alt={`${card.name}, representative card artwork`} sizes="48px" /></span>
          <span>{card.name}<small>{card.boardRole === "evolution" ? "Evolution card" : card.boardRole === "tool" ? "Tool" : card.boardRole === "energy" ? "Energy" : "Card"}</small></span>
        </button>
      </li>)}</ul>
      {locationGroups.map((group, index) => {
        const locations = [...(pool.memberIds.length ? ["board"] as const : []), ...group.destinations];
        const locationText = locations.map((location) => locationLabels[location]).join(" or ");
        const locationStatus = locations.length > 1 ? "Location uncertain" : "Recorded location";
        return <div key={index}>
        <p>{locationStatus} · {locationText}</p>
        <ul>{group.cards.map((card) => <li key={card.id}>
          <button type="button" className={styles.poolCard} aria-label={`Preview ${card.name}, ${locationStatus.toLowerCase()}: ${locationText}`} onClick={() => onPreview(card)}>
            <span><CardArtwork card={card} alt={`${card.name}, representative card artwork`} sizes="48px" /></span>
            <span>{card.name}<small>{locationStatus}</small></span>
          </button>
        </li>)}</ul>
      </div>;
      })}
      {evidence.length ? <details>
        <summary>Known printing evidence{assignmentKnown ? "" : " · assignment unknown"}</summary>
        <p>Evidence for these Pokémon; no extra cards are counted.</p>
        <ul>{evidence.map((card, index) => <li key={`${card.id}-${index}`}>
          <button type="button" onClick={() => onPreview(printingPreview(card))}>{card.name}{card.observedEffects?.length ? ` · ${card.observedEffects.join(", ")}` : " · recorded printing"}</button>
        </li>)}</ul>
      </details> : null}
    </div>;
  });
}

function PlayerBoard({
  actor,
  coinPhase,
  currentEvent,
  onInspectDiscard,
  onPreview,
  previousSide,
  side,
  stadium,
  controls,
  openingRevealed,
  instantReveal,
}: {
  actor: ReplayActor;
  coinPhase: CoinFlipPhase;
  currentEvent: ReplayEvent | null;
  onInspectDiscard: (actor: ReplayActor) => void;
  onPreview: (card: PreviewCard) => void;
  previousSide: ReplaySide;
  side: ReplaySide;
  stadium: ReplayState["stadium"];
  controls?: ReactNode;
  openingRevealed: boolean;
  instantReveal: boolean;
}) {
  const coinToss = resolveOpeningCoinToss(currentEvent);
  const turnChoice = resolveOpeningTurnChoice(currentEvent);
  const faceDown = (!currentEvent || currentEvent.turn === 0) && !openingRevealed;
  const isCurrentActor = currentEvent?.actor === actor;
  const isKnockout = currentEvent?.label === "KO";
  const currentCards = [side.active, ...side.bench, ...(side.unplaced ?? [])].filter((card): card is ReplayCard => Boolean(card));
  const knockedOutIds = new Set(isKnockout && !currentEvent?.unresolved?.length
    ? [previousSide.active, ...previousSide.bench].filter((card): card is ReplayCard => Boolean(card) && !currentCards.some((current) => current.id === card?.id)).map((card) => card.id)
    : []);
  // Hold the departing Pokémon in its original slot for this KO action.
  const displayActive = previousSide.active && knockedOutIds.has(previousSide.active.id) ? previousSide.active : side.active;
  const displayBench = knockedOutIds.size > 0
    ? previousSide.bench.map((card) => currentCards.find((current) => current.id === card.id) ?? card)
    : side.bench;
  const previousActive = side.active
    ? [previousSide.active, ...previousSide.bench].find((card) => card?.id === side.active?.id)
    : undefined;
  const activeMotion = side.active && isCurrentActor
    ? currentEvent?.label === "Evolve" && previousActive?.name !== side.active.name
      ? "evolve"
      : previousSide.active?.id !== side.active.id
        ? "promote"
        : undefined
    : undefined;
  const isAttack = currentEvent?.label === "Attack";
  const attackName = isAttack && isCurrentActor
    ? currentEvent.transaction?.stages.find((stage) => stage.kind === "attack")?.label ?? "Attack"
    : undefined;
  const damageTaken = (card: ReplayCard, previous?: ReplayCard | null) => isAttack && previous && card.damageKnown !== false && previous.damageKnown !== false ? Math.max(0, card.damage - previous.damage) : 0;
  const benchCapacity = Math.min(8, Math.max(5, displayBench.length));

  return (
    <section className={styles.playerBoard} data-actor={actor}>
      <header className={styles.playerHeader}>
        <div className={styles.playerIdentity}>
          <span>{actor === "self" ? "You" : "Opponent"}</span>
          <strong>{side.name}</strong>
        </div>
        {side.itemLocked ? <span className={styles.itemLockBadge}>Item lock</span> : null}
        {controls}
      </header>

      <div className={styles.playArea}>
          {coinToss ? <div className={styles.coinCall} data-caller={coinToss.caller === actor || undefined} data-phase={coinPhase} data-winner={coinPhase === "result" && coinToss.winner === actor || undefined}>
            <span className={styles.coinCaller}>{coinToss.caller === actor
              ? `${actor === "self" ? "You" : "Opponent"} called`
              : actor === "self" ? "Your side" : "Opponent’s side"}</span>
            <span aria-hidden="true" className={styles.coinOption} data-side={coinToss.caller === actor ? coinToss.choice : coinToss.choice === "heads" ? "tails" : "heads"} />
            <strong>{coinToss.caller === actor ? coinToss.choice : coinToss.choice === "heads" ? "tails" : "heads"}</strong>
            <span aria-hidden={coinPhase !== "result" || coinToss.winner !== actor} className={styles.coinWinner}><TrophyIcon aria-hidden="true" /> Won the toss</span>
          </div> : null}
          {turnChoice ? <div className={`${styles.coinCall} ${styles.turnChoice}`} data-chooser={turnChoice.actor === actor || undefined}>
            <span className={styles.coinCaller}>{turnChoice.actor === actor ? `${actor === "self" ? "You" : "Opponent"} chose to go` : actor === "self" ? "You play" : "Opponent plays"}</span>
            <strong>{turnChoice.actor === actor ? turnChoice.order : turnChoice.order === "first" ? "second" : "first"}</strong>
          </div> : null}
        <PrizeTrack remaining={side.prizesRemaining} />

        <div className={styles.field}>

          <div className={styles.activeRow}>
            <div
              aria-label={`${side.name} Active Spot`}
              className={styles.active}
              data-populated={displayActive ? true : undefined}
            >
              {displayActive ? (
                <CardFace actor={actor} attackName={attackName} damageTaken={damageTaken(displayActive, previousActive)} knockedOut={knockedOutIds.has(displayActive.id)} effectKey={currentEvent?.sourceTitle} card={displayActive} faceDown={faceDown} instantReveal={instantReveal} motion={activeMotion} onPreview={onPreview} />
              ) : (
                side.activeUncertain ? <span className={styles.unknownActive}>Active Pokémon unknown</span> : <span aria-hidden="true" className={styles.emptyZone} />
              )}
            </div>
            <StadiumSpot actor={actor} onPreview={onPreview} stadium={stadium} />
          </div>
          <div className={styles.bench} aria-label={`${side.name} Bench`} data-capacity={benchCapacity}>
            {Array.from({ length: benchCapacity }).map((_, index) => {
              const benchCard = displayBench[index];
              const previousCard = benchCard
                ? [previousSide.active, ...previousSide.bench].find((card) => card?.id === benchCard.id)
                : undefined;
              const wasActive = benchCard && previousSide.active?.id === benchCard.id;
              const isNew = benchCard && !previousSide.bench.some((card) => card.id === benchCard.id);
              const motion = benchCard && isCurrentActor && currentEvent?.label === "Evolve" && previousCard?.name !== benchCard.name
                ? "evolve"
                : wasActive ? "retreat" : isNew ? "bench" : undefined;
              return (
              <div
                className={styles.benchSlot}
                data-populated={benchCard ? true : undefined}
                key={index}
              >
                {benchCard ? (
                  <CardFace actor={actor} knockedOut={knockedOutIds.has(benchCard.id)} damageTaken={damageTaken(benchCard, previousCard)} effectKey={currentEvent?.sourceTitle} card={benchCard} compact faceDown={faceDown} instantReveal={instantReveal} motion={motion} onPreview={onPreview} />
                ) : null}
              </div>
            );})}
          </div>
          {side.unplaced?.length ? <div className={styles.unplacedCards} aria-label={`${side.name} Pokémon with unknown position`}>
            <p>Position unknown</p>
            <div>{side.unplaced.map((card) => <CardFace actor={actor} card={card} compact key={card.id} faceDown={faceDown} instantReveal={instantReveal} onPreview={onPreview} />)}</div>
          </div> : null}
          {!faceDown ? <BoardCardPools cards={currentCards} onPreview={onPreview} side={side} /> : null}
        </div>

        <div className={styles.zonePiles}>
          <Pile count={side.deckCount} label="Deck" />
          <Pile
            animate={side.discard[0]?.id !== previousSide.discard[0]?.id}
            count={side.discardCount ?? null}
            label="Discard"
            onInspect={() => onInspectDiscard(actor)}
            topCard={side.discardCount == null || side.uncertainZones?.includes("discard") || side.discardCount > side.discard.length ? undefined : side.discard[0]}
          />
        </div>
      </div>
      <HandFan actor={actor} onPreview={onPreview} side={side} opening={currentEvent?.turn === 0} />
    </section>
  );
}

type BoardSnapshot = {
  index: number;
  cards: Map<string, { rect: DOMRect; uncertain: boolean }>;
  hands: Map<ReplayActor, { rect: DOMRect; cards: Map<string, DOMRect[]> }>;
  decks: Map<ReplayActor, DOMRect>;
};

function boardChanged(previous: ReplayState, current: ReplayState) {
  return (["self", "opponent"] as const).some((actor) => {
    const positions = (side: ReplaySide) => [side.active, ...side.bench]
      .map((card) => card ? `${card.id}:${card.name}` : null);
    return JSON.stringify(positions(previous[actor])) !== JSON.stringify(positions(current[actor]));
  });
}

function routineBoardAction(event: ReplayEvent | null, previous: ReplayState, state: ReplayState, previousEvent?: ReplayEvent) {
  if (!event?.transaction || event.turn === 0 || event.unresolved?.length) return null;
  const stages = event.transaction.stages;
  const actor = event.actor;
  if (actor !== "self" && actor !== "opponent") return null;
  const stadium = stages.find((stage) => stage.kind === "stadium");
  const stadiumPlay = event.sourceTitle.match(/^.+? played (.+?)(?: to the Stadium spot)?\.$/i);
  const handConsumed = previous[actor].handCount !== null && state[actor].handCount === previous[actor].handCount! - 1;
  const stadiumChanged = previous.stadium?.name !== state.stadium?.name || previous.stadium?.actor !== state.stadium?.actor;
  const replacementDetail = event.sourceDetails[0]?.match(/^- .+? discarded (.+?)\.$/);
  if (event.label === "Stadium" && stadiumPlay?.[1] === stadium?.cards[0]?.name
    && stadium?.cards.length === 1 && stadium.targetResolved !== false
    && state.stadium?.actor === actor && state.stadium.name === stadium.cards[0].name
    && (previous[actor].handCount === null || handConsumed)
    && (/ to the Stadium spot\.$/i.test(event.sourceTitle) || stadiumChanged || handConsumed)
    && stages.length === (previous.stadium ? 2 : 1)
    && stages.filter((stage) => stage.kind === "stadium").length === 1
    && stages.every((stage) => stage.kind === "stadium" || stage.kind === "discard"
      && Boolean(previous.stadium) && stage.cards.length <= 1
      && stage.cards.every((card) => card.name === previous.stadium?.name))
    && stages.every((stage) => !stage.hiddenCount && stage.targetResolved !== false)
    && (previous.stadium
      ? event.sourceDetails.length === 1 && replacementDetail?.[1] === previous.stadium.name
      : event.sourceDetails.length === 0)) {
    return { kind: "stadium" as const, actor, card: stadium.cards[0] };
  }
  const draw = stages.find((stage) => stage.kind === "draw");
  if (event.label === "Draw" && stages.length === 1 && draw
    && previousEvent?.sourceSectionIndex !== event.sourceSectionIndex
    && draw.cards.length + (draw.hiddenCount ?? 0) === 1) {
    return { kind: "draw" as const, actor, card: actor === "self" ? draw.cards[0] : undefined };
  }
  const attach = stages.find((stage) => stage.kind === "attach");
  const move = stages.find((stage) => stage.kind === "move");
  if (event.label !== "Attach" || event.sourceDetails.length > 0
    || /\bfrom\b.*\b(deck|discard)\b/i.test(event.sourceTitle)
    || stages.length !== 2 || !attach || !move
    || attach.cards.length !== 1 || !/Energy$/.test(attach.cards[0].name)
    || move.cards.length !== 1 || attach.targetResolved === false || move.targetResolved === false) return null;
  const target = [state[actor].active, ...state[actor].bench].find((card) => card?.id === move.cards[0].id);
  const before = [previous[actor].active, ...previous[actor].bench].find((card) => card?.id === target?.id);
  if (!target || !before || target.instanceUncertain || target.energy.length !== before.energy.length + 1) return null;
  if (previous[actor].handCount !== null && state[actor].handCount !== previous[actor].handCount! - 1) return null;
  return { kind: "attach" as const, actor, card: attach.cards[0], targetId: target.id };
}

export function BattleReplay({
  program,
  initialActionIndex = 0,
  artwork = {},
}: {
  program: ReplayProgram;
  initialActionIndex?: number;
  artwork?: Record<string, string>;
}) {
  const [actionIndex, setActionIndex] = useState(() =>
    Math.max(0, Math.min(program.frames.length - 1, initialActionIndex)),
  );
  const [previewedCard, setPreviewedCard] = useState<PreviewCard | null>(null);
  const previewDefinition = previewedCard ? resolveReplayCardPreviewDefinition(previewedCard, program) : undefined;
  const previewHpIsProbable = previewedCard?.hpBasis === "probable" || previewedCard?.hp === null && previewDefinition?.hpBasis === "probable";
  const [inspectedDiscard, setInspectedDiscard] =
    useState<ReplayActor | null>(null);
  const [playing, setPlaying] = useState(false);
  const timelineRef = useRef<HTMLOListElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const boardSnapshotRef = useRef<BoardSnapshot | null>(null);
  const boardGhostRef = useRef<HTMLDivElement>(null);
  const [openingRevealPending, setOpeningRevealPending] = useState(false);
  const [animateOpeningReveal, setAnimateOpeningReveal] = useState(false);
  const previewTriggerRef = useRef<HTMLElement | null>(null);
  const discardTriggerRef = useRef<HTMLElement | null>(null);
  const replayEvents = program.events;
  const replayFrames = program.frames;
  const replaySource = program.source;
  const state = replayFrames[actionIndex];
  const inspectedDiscardSide = inspectedDiscard ? state[inspectedDiscard] : null;
  const discardIdentityIncomplete = inspectedDiscardSide?.discardCount == null || inspectedDiscardSide?.uncertainZones?.includes("discard") ||
    (inspectedDiscardSide?.discardCount ?? 0) > (inspectedDiscardSide?.discard.length ?? 0);
  const previousState = replayFrames[Math.max(0, actionIndex - 1)];
  const currentEvent = actionIndex > 0 ? replayEvents[actionIndex - 1] : null;
  const finalSetupIndex = replayEvents.findIndex((event) => event.turn > 0);
  const atOpeningReveal = finalSetupIndex > 0 && actionIndex === finalSetupIndex;
  const openingRevealed = finalSetupIndex > 0 && actionIndex >= finalSetupIndex && !openingRevealPending;
  const routineAction = useMemo(() => routineBoardAction(currentEvent, previousState, state, replayEvents[actionIndex - 2]), [actionIndex, currentEvent, previousState, replayEvents, state]);
  const movingOnBoard = boardChanged(previousState, state);
  // Effect-driven placements (for example Poffin searching the deck) need the
  // selection context. Direct hand placements and moves are shown on the board.
  const effectPlacement = currentEvent?.label !== "Pokémon" && currentEvent?.transaction?.stages.some((stage) => stage.kind === "bench");
  const inlineTransaction = movingOnBoard && !effectPlacement;
  const visibleTransaction = currentEvent?.transaction ? {
    ...currentEvent.transaction,
    stages: currentEvent.transaction.stages.filter((stage) => !(stage.kind === "draw" && stage.label === "Opening hand")),
  } : null;
  const popupTransaction = visibleTransaction?.stages.length && !routineAction && currentEvent?.label !== "Attack" && currentEvent?.label !== "KO"
    ? inlineTransaction
      ? visibleTransaction.stages.some((stage) => ["find", "draw", "shuffle", "return"].includes(stage.kind))
        ? { ...visibleTransaction, stages: visibleTransaction.stages.filter((stage) => !["before", "bench", "evolve", "move"].includes(stage.kind)) }
        : null
      : visibleTransaction
    : null;
  const coinToss = resolveOpeningCoinToss(currentEvent);
  const resultOnlyCoinFlip = resolveResultOnlyCoinFlip(currentEvent);
  const coinFlipResult = coinToss?.result ?? resultOnlyCoinFlip?.result ?? null;
  const coinPhase = useCoinFlipPhase(currentEvent);
  const autoplayDelay = atOpeningReveal ? 1800 : currentEvent?.label === "KO" ? 2000 : currentEvent?.label === "Attack" ? 2400 : coinToss ? 4400 : resultOnlyCoinFlip ? 2800 : resolveOpeningTurnChoice(currentEvent) ? 2400 : currentEvent?.transaction && currentEvent.transaction.stages.length > 1 ? 1900 : 1100;
  const maxIndex = replayFrames.length - 1;
  const previewHealthPercent = previewedCard?.hp
    ? Math.max(0, ((previewedCard.hp - (previewedCard.damage ?? 0)) / previewedCard.hp) * 100)
    : 100;
  const previewHealthTone = previewHealthPercent <= 24
    ? "critical"
    : previewHealthPercent <= 75
      ? "warning"
      : "healthy";
  const turnStops = useMemo(() => replayEvents.reduce<Array<{ sourceSectionIndex: number; index: number }>>(
    (stops, event, index) => {
      if (stops.at(-1)?.sourceSectionIndex !== event.sourceSectionIndex)
        stops.push({ sourceSectionIndex: event.sourceSectionIndex, index: index + 1 });
      return stops;
    },
    [],
  ), [replayEvents]);
  const previousTurnIndex = turnStops
    .map((stop) => stop.index)
    .filter((index) => index < actionIndex)
    .at(-1);
  const nextTurnIndex = turnStops.find(
    (stop) => stop.index > actionIndex,
  )?.index;

  const captureBoard = useCallback(() => {
    const board = boardRef.current;
    if (!board) return;
    const cards: BoardSnapshot["cards"] = new Map();
    for (const card of board.querySelectorAll<HTMLElement>("[data-board-card]")) {
      const actor = card.closest<HTMLElement>("[data-actor]")?.dataset.actor;
      cards.set(`${actor}:${card.dataset.boardCard}`, { rect: card.getBoundingClientRect(), uncertain: Boolean(card.dataset.copyUncertain) });
    }
    const hands: BoardSnapshot["hands"] = new Map();
    for (const hand of board.querySelectorAll<HTMLElement>("[data-replay-hand]")) {
      const knownCards = new Map<string, DOMRect[]>();
      for (const card of hand.querySelectorAll<HTMLElement>("[data-hand-card]")) {
        const name = card.dataset.handCard!;
        knownCards.set(name, [...(knownCards.get(name) ?? []), card.getBoundingClientRect()]);
      }
      hands.set(hand.dataset.replayHand as ReplayActor, { rect: hand.getBoundingClientRect(), cards: knownCards });
    }
    const decks: BoardSnapshot["decks"] = new Map();
    for (const deck of board.querySelectorAll<HTMLElement>('[data-pile-face="Deck"]')) {
      decks.set(deck.closest<HTMLElement>("[data-actor]")?.dataset.actor as ReplayActor, deck.getBoundingClientRect());
    }
    boardSnapshotRef.current = { index: actionIndex, cards, hands, decks };
  }, [actionIndex]);

  useLayoutEffect(() => {
    const board = boardRef.current;
    const snapshot = boardSnapshotRef.current;
    boardSnapshotRef.current = null;
    if (!board || !snapshot || snapshot.index + 1 !== actionIndex || currentEvent?.label === "KO") return;
    const animations: Animation[] = [];
    const elevated: HTMLElement[] = [];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const card of movingOnBoard ? board.querySelectorAll<HTMLElement>("[data-board-card]") : []) {
      const actor = card.closest<HTMLElement>("[data-actor]")?.dataset.actor as ReplayActor;
      const previous = snapshot.cards.get(`${actor}:${card.dataset.boardCard}`);
      const hand = snapshot.hands.get(actor);
      const matchingHandCards = hand?.cards.get(card.dataset.cardName!) ?? [];
      // A normal Pokémon placement comes from the hand. Search effects such as
      // Buddy-Buddy Poffin have no recorded physical origin here: fade them in.
      const fromHand = !previous && currentEvent?.label === "Pokémon" && currentEvent.actor === actor;
      const origin = previous?.rect ?? (fromHand ? matchingHandCards.length === 1 ? matchingHandCards[0] : hand ? new DOMRect(hand.rect.x + hand.rect.width / 2 - 27, hand.rect.y + hand.rect.height / 2 - 38, 54, 76) : undefined : undefined);
      const destination = card.getBoundingClientRect();
      const uncertain = Boolean(card.dataset.copyUncertain) || previous?.uncertain;
      if (previous && origin && Math.abs(origin.x - destination.x) < 2 && Math.abs(origin.y - destination.y) < 2) continue;
      if (!destination.width || !destination.height) continue;
      const keyframes = reducedMotion || uncertain || !origin
        ? [{ opacity: 0.35 }, { opacity: 1 }]
        : [{ transform: `translate(${origin.x - destination.x}px, ${origin.y - destination.y}px) scale(${origin.width / destination.width})`, opacity: fromHand ? 0.7 : 1 }, { transform: "none", opacity: 1 }];
      card.style.zIndex = "50";
      card.style.transformOrigin = "top left";
      elevated.push(card);
      const animation = card.animate(keyframes, { duration: reducedMotion ? 140 : 500, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
      animation.onfinish = () => { card.style.removeProperty("z-index"); card.style.removeProperty("transform-origin"); };
      animations.push(animation);
    }
    const ghost = boardGhostRef.current;
    if (routineAction && ghost) {
      const hand = snapshot.hands.get(routineAction.actor);
      const matches = routineAction.card ? hand?.cards.get(routineAction.card.name) ?? [] : [];
      const origin = routineAction.kind === "draw" ? snapshot.decks.get(routineAction.actor)
        : matches.length === 1 ? matches[0] : hand ? new DOMRect(hand.rect.x + hand.rect.width / 2 - 27, hand.rect.y + hand.rect.height / 2 - 38, 54, 76) : undefined;
      const targetHand = board.querySelector<HTMLElement>(`[data-replay-hand="${routineAction.actor}"]`);
      const destination = routineAction.kind === "attach"
        ? [...board.querySelectorAll<HTMLElement>("[data-board-card]")].find((card) => card.dataset.boardCard === routineAction.targetId && card.closest<HTMLElement>("[data-actor]")?.dataset.actor === routineAction.actor)?.querySelector<HTMLElement>(`.${styles.cardSurface}`)?.getBoundingClientRect()
        : routineAction.kind === "stadium"
          ? board.querySelector<HTMLElement>(`[data-board-stadium="${routineAction.actor}"]`)?.getBoundingClientRect()
        : (routineAction.card ? [...(targetHand?.querySelectorAll<HTMLElement>("[data-hand-card-id]") ?? [])].find((card) => card.dataset.handCardId === routineAction.card?.id) : undefined)?.getBoundingClientRect()
          ?? targetHand?.querySelector<HTMLElement>("[data-hand-index]:last-child")?.getBoundingClientRect();
      const frame = ghost.parentElement?.getBoundingClientRect();
      if (origin && destination && frame && !reducedMotion) {
        Object.assign(ghost.style, { visibility: "visible", left: `${origin.left - frame.left}px`, top: `${origin.top - frame.top}px`, width: `${origin.width}px`, height: `${origin.height}px` });
        const animation = ghost.animate([
          { transform: "none", opacity: 1 },
          { transform: `translate(${destination.left - origin.left}px, ${destination.top - origin.top}px) scale(${destination.width / origin.width})`, opacity: 1, offset: 0.85 },
          { transform: `translate(${destination.left - origin.left}px, ${destination.top - origin.top}px) scale(${destination.width / origin.width})`, opacity: 0 },
        ], { duration: 650, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
        animation.onfinish = () => { ghost.style.visibility = "hidden"; };
        animations.push(animation);
      }
    }
    const cancel = () => {
      if (ghost) ghost.style.visibility = "hidden";
      for (const animation of animations) animation.cancel();
      for (const card of elevated) { card.style.removeProperty("z-index"); card.style.removeProperty("transform-origin"); }
    };
    window.addEventListener("resize", cancel);
    return () => { cancel(); window.removeEventListener("resize", cancel); };
  }, [actionIndex, currentEvent, movingOnBoard, routineAction]);

  const advanceTo = useCallback((nextIndex: number) => {
    captureBoard();
    const reveal = nextIndex === finalSetupIndex && nextIndex === actionIndex + 1 && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setOpeningRevealPending(reveal);
    setAnimateOpeningReveal(reveal);
    setActionIndex(nextIndex);
  }, [actionIndex, captureBoard, finalSetupIndex]);

  useEffect(() => {
    if (!openingRevealPending) return;
    const timer = window.setTimeout(() => setOpeningRevealPending(false), 500);
    return () => window.clearTimeout(timer);
  }, [actionIndex, openingRevealPending]);

  useEffect(() => {
    if (!playing) return;
    if (actionIndex >= maxIndex) {
      setPlaying(false);
      return;
    }

    const timer = window.setTimeout(
      () => advanceTo(Math.min(maxIndex, actionIndex + 1)),
      autoplayDelay,
    );
    return () => window.clearTimeout(timer);
  }, [actionIndex, autoplayDelay, advanceTo, maxIndex, playing]);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("position", String(actionIndex));
    window.history.replaceState(window.history.state, "", url);
  }, [actionIndex]);

  useEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    const selected = timeline.querySelector<HTMLElement>('[aria-current="step"]');
    const alignSelected = () => {
      if (actionIndex === 0) { timeline.scrollTop = 0; return; }
      if (!selected) return;
      const viewport = timeline.getBoundingClientRect();
      const item = selected.getBoundingClientRect();
      const inset = 8;
      const top = item.top - viewport.top;
      const bottom = item.bottom - viewport.bottom;
      const delta = top < inset || item.height > timeline.clientHeight - inset * 2
        ? top - inset : bottom > -inset ? bottom + inset : 0;
      if (delta) timeline.scrollTo({ top: timeline.scrollTop + delta, behavior: "instant" });
    };
    alignSelected();
    const measure = () => [timeline.clientWidth, timeline.clientHeight, selected?.offsetWidth ?? 0, selected?.offsetHeight ?? 0];
    let bounds = measure();
    let pendingFrame: number | undefined;
    const observer = new ResizeObserver(() => {
      const nextBounds = measure();
      // Paused manual reading stays where the user scrolled until layout changes.
      if (nextBounds.every((value, index) => value === bounds[index])) return;
      bounds = nextBounds;
      if (pendingFrame !== undefined) window.cancelAnimationFrame(pendingFrame);
      pendingFrame = window.requestAnimationFrame(alignSelected);
    });
    observer.observe(timeline);
    if (selected) observer.observe(selected);
    return () => {
      observer.disconnect();
      if (pendingFrame !== undefined) window.cancelAnimationFrame(pendingFrame);
    };
  }, [actionIndex, playing]);

  const seek = useCallback((nextIndex: number, revealBoard = false) => {
    advanceTo(Math.max(0, Math.min(maxIndex, nextIndex)));
    setPlaying(false);
    const stage = stageRef.current;
    if (revealBoard && stage && window.getComputedStyle(stage).order === "-1") {
      window.requestAnimationFrame(() => stage.scrollIntoView({
        block: "start",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      }));
    }
  }, [advanceTo, maxIndex]);
  const seekFromTimeline = useCallback((nextIndex: number) => seek(nextIndex, true), [seek]);

  function seekTurn(direction: -1 | 1) {
    const next = direction < 0 ? previousTurnIndex : nextTurnIndex;
    if (typeof next === "number") seek(next);
  }

  function previewCard(card: PreviewCard) {
    previewTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPlaying(false);
    setPreviewedCard(card);
  }

  function inspectDiscard(actor: ReplayActor) {
    discardTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPlaying(false);
    setInspectedDiscard(actor);
  }

  const playbackControls = (
        <div className={styles.controls}>
          <div
            aria-label="Action controls"
            className={styles.controlGroup}
            role="group"
          >
            <Button
              aria-label="Previous action"
              className={styles.iconControl}
              disabled={actionIndex === 0}
              onClick={() => seek(actionIndex - 1)}
              size="icon"
              variant="outline"
            >
              <ChevronLeftIcon />
            </Button>
            <span>Action</span>
            <Button
              aria-label="Next action"
              className={styles.iconControl}
              disabled={actionIndex === maxIndex}
              onClick={() => seek(actionIndex + 1)}
              size="icon"
              variant="outline"
            >
              <ChevronRightIcon />
            </Button>
          </div>
          <Button
            aria-label={playing ? "Pause replay" : "Play replay"}
            className={styles.iconControl}
            disabled={actionIndex === maxIndex && !playing}
            onClick={() => setPlaying((value) => !value)}
            size="icon-lg"
          >
            {playing ? <PauseIcon /> : <PlayIcon />}
          </Button>
          <div
            aria-label="Turn controls"
            className={styles.controlGroup}
            role="group"
          >
            <Button
              aria-label="Previous turn"
              className={styles.iconControl}
              disabled={previousTurnIndex === undefined}
              onClick={() => seekTurn(-1)}
              size="icon"
              variant="outline"
            >
              <ChevronLeftIcon />
            </Button>
            <span>Turn</span>
            <Button
              aria-label="Next turn"
              className={styles.iconControl}
              disabled={nextTurnIndex === undefined}
              onClick={() => seekTurn(1)}
              size="icon"
              variant="outline"
            >
              <ChevronRightIcon />
            </Button>
          </div>
        </div>
  );

  return (
    <DefinitionContext.Provider value={program.cardResolutions}>
    <TurnActorContext.Provider value={currentEvent?.turnActor ?? null}>
    <ArtworkContext.Provider value={artwork}>
    <div className={styles.replayContainer}>
    <div className={styles.replay}>
      <p className={styles.artNote}>Reconstructed from the saved Battle Log. Unrecorded information stays unknown. Artwork may show a representative printing.</p>

      <div className={styles.matchMeta}>
        <div><span>Matchup</span><strong>{replaySource.selfDeck} vs {replaySource.opponentDeck}</strong></div>
        <div><span>Result</span><strong>{replaySource.result}</strong></div>
        <div><span>Prizes taken</span><strong>{replaySource.selfPrizesTaken}–{replaySource.opponentPrizesTaken}</strong></div>
        <div><span>Turns</span><strong>{replaySource.turns}</strong></div>
      </div>

      <div className={styles.replayShell}>
      <div className={styles.timelinePane}>
        <div className={styles.timelineHeader}>
          <div>
            <SectionTitle size="sm">Match timeline</SectionTitle>
            <p>
              {formatPlayedOn(replaySource.playedOn)} · {replaySource.format || "Format not recorded"} · {replaySource.turns} turns ·{" "}
              {replayEvents.length} visual actions
            </p>
          </div>
          <Button
            aria-label="Restart replay"
            className={styles.iconControl}
            onClick={() => seek(0)}
            size="icon-sm"
            variant="ghost"
          >
            <RotateCcwIcon />
          </Button>
        </div>

        <ol aria-label="Match actions" className={styles.timeline} ref={timelineRef}>
          {replayEvents.map((event, index) => <TimelineAction event={event} key={index} onSeek={seekFromTimeline} selected={index + 1 === actionIndex} step={index + 1} />)}
        </ol>
      </div>

      <div className={styles.replayStage} ref={stageRef}>
        <div className={styles.boardFrame} data-transaction={popupTransaction && !inlineTransaction || undefined}>
          <div className={styles.board} ref={boardRef}>
            <PlayerBoard openingRevealed={openingRevealed} instantReveal={!atOpeningReveal || !animateOpeningReveal} controls={playbackControls} coinPhase={coinPhase} actor="opponent" currentEvent={currentEvent} onInspectDiscard={inspectDiscard} onPreview={previewCard} previousSide={previousState.opponent} side={state.opponent} stadium={state.stadium} />
            {currentEvent?.label === "Attack" ? <div aria-hidden="true" className={styles.attackAnnouncementAnchor}>
              <div key={`${program.id}-${actionIndex}`} className={styles.attackAnnouncement}>
                <span>{currentEvent.actor === "self" ? "Your attack" : "Opponent’s attack"}</span>
                <strong>{currentEvent.transaction?.stages.find((stage) => stage.kind === "attack")?.label ?? "Attack"}</strong>
              </div>

            </div> : null}
            {coinToss || resultOnlyCoinFlip ? <div className={styles.boardCoinToss} role="status" aria-label={coinPhase === "call" && coinToss
              ? `${coinToss.caller === "self" ? "You call" : "Opponent calls"} ${coinToss.choice}`
              : coinPhase === "toss" ? "Tossing the coin"
                : coinToss?.winner ? `${coinToss.result}. ${coinToss.winner === "self" ? "You won" : "Opponent won"} the toss.`
                  : resultOnlyCoinFlip ? `${resultOnlyCoinFlip.result}. ${resultOnlyCoinFlip.actor === "self" ? "Your" : "Opponent’s"} coin flip.` : "Result not recorded."}>
              {coinPhase !== "call" ? <div aria-hidden="true" className={styles.replayCoin} data-phase={coinPhase}>
                <div className={styles.coinRotor} data-result={coinFlipResult}>
                  <span className={styles.coinMetalFace} data-side="heads" />
                  <span className={styles.coinMetalFace} data-side="tails" />
                </div>
                {coinPhase === "result" && !coinFlipResult ? <span>Unknown</span> : null}
              </div> : null}
            </div> : null}
            {routineAction || atOpeningReveal ? <div className={styles.boardRoutineAnnouncement} aria-hidden="true" key={actionIndex}>
              <span>{atOpeningReveal ? "Setup complete" : routineAction?.actor === "self" ? "Your action" : "Opponent action"}</span>
              <strong>{atOpeningReveal ? "Opening Pokémon revealed" : currentEvent?.summary}</strong>
            </div> : null}
            <PlayerBoard openingRevealed={openingRevealed} instantReveal={!atOpeningReveal || !animateOpeningReveal} coinPhase={coinPhase} actor="self" currentEvent={currentEvent} onInspectDiscard={inspectDiscard} onPreview={previewCard} previousSide={previousState.self} side={state.self} stadium={state.stadium} />
          </div>
          <div className={styles.boardCardFlight} ref={boardGhostRef} aria-hidden="true" data-board-flight={routineAction?.kind}>
            {routineAction?.card ? <CardArtwork card={routineAction.card} alt="" sizes="100px" /> : <div className={styles.cardBack} />}
          </div>
          {popupTransaction && !inlineTransaction ? <TransactionOverlay onPreview={previewCard} previousState={previousState} state={state} transaction={popupTransaction} /> : null}
        </div>

        {popupTransaction && inlineTransaction ? <div className={styles.boardActionContext}><TransactionOverlay onPreview={previewCard} previousState={previousState} state={state} transaction={popupTransaction} /></div> : null}

        <div className={styles.currentAction} aria-live="polite">
          <span>
            {currentEvent
              ? currentEvent.turn === 0
                ? "Setup"
                : `Turn ${currentEvent.turn}`
              : "Before setup"}
          </span>
          <strong>
            {(coinToss || resultOnlyCoinFlip) && coinPhase !== "result"
              ? coinPhase === "call" && coinToss ? `${coinToss.caller === "self" ? "You call" : "Opponent calls"} ${coinToss.choice}` : "Tossing the coin…"
              : currentEvent?.summary ?? "Ready to replay the imported battle."}
          </strong>
        </div>

        <div className={styles.scrubber}>
          <label htmlFor="replay-position">
            <span>Replay position</span>
            <strong>
              {actionIndex} / {maxIndex}
            </strong>
          </label>
          <input
            aria-label="Scrub through battle replay"
            id="replay-position"
            max={maxIndex}
            min={0}
            onChange={(event) => seek(Number(event.target.value))}
            type="range"
            value={actionIndex}
          />
        </div>

        {program.status === "partial" ? <details className={styles.replayDiagnostics}>
          <summary>Partial replay · {program.diagnostics.unresolvedMutations} unresolved {program.diagnostics.unresolvedMutations === 1 ? "change" : "changes"}</summary>
          <p>Recorded actions remain available. Unresolved changes are labelled in the timeline.</p>
          <ul>{program.diagnostics.messages.map((message, index) => <li key={index}>{message}</li>)}</ul>
        </details> : null}

        <Sheet
          onOpenChange={(open) => {
            if (!open) setInspectedDiscard(null);
          }}
          open={inspectedDiscard !== null}
        >
          <SheetContent className={styles.discardSheet} side="bottom" onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (discardTriggerRef.current?.isConnected) discardTriggerRef.current.focus();
          }}>
            <SheetHeader className={styles.discardSheetHeader}>
              <SheetTitle>
                {inspectedDiscard === "self" ? "Your" : "Opponent's"} discard
                pile
              </SheetTitle>
              <SheetDescription>
                {inspectedDiscardSide?.discardCount == null
                  ? `${inspectedDiscardSide?.discard.length ?? 0} known ${inspectedDiscardSide?.discard.length === 1 ? "card" : "cards"} · total unknown`
                  : `${inspectedDiscardSide.discardCount} ${inspectedDiscardSide.discardCount === 1 ? "card" : "cards"}${inspectedDiscardSide.discardCount !== inspectedDiscardSide.discard.length ? ` · ${inspectedDiscardSide.discard.length} identified` : ""}`} · {discardIdentityIncomplete ? "identified cards, newest first" : "newest first"}
              </SheetDescription>
            </SheetHeader>
            <ol className={styles.discardList}>
              {(inspectedDiscard
                ? state[inspectedDiscard].discard
                : []
              ).map((discardedCard, index) => (
                <li key={discardedCard.id}>
                  <button aria-label={`Preview ${discardedCard.name}`} className={`${styles.discardCardImage} ${styles.cardPreviewTrigger}`} onClick={() => previewCard(discardedCard)} type="button">
                    <CardArtwork card={discardedCard} alt={`${discardedCard.name}, representative card artwork`} sizes="(max-width: 44rem) 76px, 88px" />
                  </button>
                  <div>
                    <strong>{discardedCard.name}</strong>
                    <span>{index === 0 ? discardIdentityIncomplete ? "Latest identified discard" : "Newest discard" : `#${index + 1}`}</span>
                  </div>
                </li>
              ))}
            </ol>
          </SheetContent>
        </Sheet>

        <Dialog onOpenChange={(open) => { if (!open) setPreviewedCard(null); }} open={previewedCard !== null}>
          <AppDialogContent className={styles.cardPreviewDialog} size="compact" onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (previewTriggerRef.current?.isConnected) previewTriggerRef.current.focus();
          }}>
            <DialogTitle className="sr-only">{previewedCard?.name}</DialogTitle>
            <DialogDescription className="sr-only">Enlarged card preview</DialogDescription>
            {previewedCard ? <div aria-label="Card preview details" className={styles.cardPreviewStage} role="region" tabIndex={0}>
              <div className={styles.cardPreviewImage}>
                <CardArtwork card={previewedCard} alt={`${previewedCard.name}, enlarged representative card artwork`} sizes="340px" />
                <ConditionMarkers conditions={previewedCard.conditions} />
                {previewedCard.damageKnown === false ? <span aria-label="Accumulated damage unknown" className={styles.cardPreviewDamage}>?</span> : previewedCard.damage ? <span aria-label={`${previewedCard.damage} damage`} className={styles.cardPreviewDamage}>{previewedCard.damage}</span> : null}
                {previewedCard.abilityUsed ? <AbilityUsedMarker className={styles.previewAbilityUsedMarker} /> : null}
                {previewedCard.tool ? <span className={styles.cardPreviewTool}>Tool · {previewedCard.tool}</span> : null}
                {previewedCard.energy?.length ? <EnergyOrbs energy={previewedCard.energy} className={styles.previewEnergyOrbs} /> : null}
              </div>
              {previewedCard.hp && previewedCard.damageKnown !== false ? <div className={styles.cardPreviewHealth} data-tone={previewHealthTone}>
                <div aria-label={`${previewHpIsProbable ? "Probably " : ""}${Math.max(0, previewedCard.hp - (previewedCard.damage ?? 0))} of ${previewedCard.hp} HP remaining`} aria-valuemax={previewedCard.hp} aria-valuemin={0} aria-valuenow={Math.max(0, previewedCard.hp - (previewedCard.damage ?? 0))} role="progressbar">
                  <span style={{ width: `${Math.max(0, ((previewedCard.hp - (previewedCard.damage ?? 0)) / previewedCard.hp) * 100)}%` }} />
                </div>
                <strong>{previewHpIsProbable ? "Probably " : ""}{Math.max(0, previewedCard.hp - (previewedCard.damage ?? 0))} / {previewedCard.hp} HP</strong>
              </div> : previewedCard.hp === null || previewedCard.damageKnown === false ? <p className={styles.previewUnknownHealth}>{previewHpIsProbable ? "Probably " : ""}{previewedCard.hp ? `${previewedCard.hp} maximum HP · damage ? · remaining HP ?` : previewedCard.baseHp ? `${previewedCard.baseHp} printed HP · maximum and remaining HP ?` : "HP ?"}</p> : null}
              {previewedCard.hp === undefined && previewDefinition?.printedHp ? <p className={styles.previewUnknownHealth}>{previewDefinition.hpBasis === "probable" ? "Probably " : ""}{previewDefinition.printedHp} HP</p> : null}
            </div> : null}
          </AppDialogContent>
        </Dialog>
      </div>
      </div>
    </div>
    </div>
    </ArtworkContext.Provider>
    </TurnActorContext.Provider>
    </DefinitionContext.Provider>
  );
}
