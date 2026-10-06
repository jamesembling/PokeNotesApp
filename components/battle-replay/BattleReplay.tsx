"use client";

import Image from "next/image";
import { createContext, memo, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  TriangleIcon,
  TrophyIcon,
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
  resolveReplayBoardDisplay,
  resolveReplayDisplayEvent,
} from "@/lib/battle-replay/preview";
import styles from "./battle-replay.module.css";

function UnavailableArtwork({ name }: { name: string }) {
  return <span className={styles.unavailableArtwork}><strong>{name}</strong></span>;
}

const ATTACK_IMPACT_MS = 1194;
const DECK_SHUFFLE_MS = 750;

const ArtworkContext = createContext<Record<string, string>>({});
const TurnActorContext = createContext<ReplayActor | null>(null);
const DefinitionContext = createContext<ReplayProgram["cardResolutions"]>({});

function CardArtwork({ card, alt, sizes, eager = false }: { card: Pick<ReplayZoneCard, "name" | "imageUrl" | "definitionKey">; alt: string; sizes: string; eager?: boolean }) {
  const artwork = useContext(ArtworkContext);
  const cardResolutions = useContext(DefinitionContext);
  const resolution = resolveReplayCardPreviewDefinition(card, { cardResolutions });
  const src = resolution ? resolution.selectedPrinting?.imageUrl : card.imageUrl || (Object.hasOwn(artwork, card.name) ? artwork[card.name] : undefined);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return src && failedSrc !== src
    ? <Image className={styles.cardArtwork} loading={eager ? "eager" : "lazy"} quality={95} alt={resolution?.displayBasis === "played_evidence" ? `${card.name}, recorded printing` : alt} fill sizes={sizes} src={src} onError={() => setFailedSrc(src)} />
    : <UnavailableArtwork name={card.name} />;
}

const TimelineAction = memo(function TimelineAction({ event, selected, step, onSeek }: {
  event: ReplayEvent; selected: boolean; step: number; onSeek: (index: number) => void;
}) {
  return <li><button aria-current={selected ? "step" : undefined} className={styles.timelineAction}
    data-actor={event.actor} data-selected={selected || undefined} onClick={() => onSeek(step)} type="button">
    <span>{event.turn === 0 ? "Setup" : `Turn ${event.turn}`}</span><strong>{event.label}</strong>
    <p>{event.summary}</p>
  </button></li>;
});

type PreviewCard = ReplayZoneCard & {
  initialPileIndex?: number;
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
  plausibleFields?: ReplayCard["plausibleFields"];
};

function CardHealth({ card, hidden = false }: { card: PreviewCard; hidden?: boolean }) {
  const cardResolutions = useContext(DefinitionContext);
  const printedHp = card.baseHp ?? resolveReplayCardPreviewDefinition(card, { cardResolutions })?.printedHp;
  const remainingHp = card.hp == null || card.damageKnown === false ? null : Math.max(0, card.hp - (card.damage ?? 0));
  const percent = card.hp && remainingHp !== null ? Math.round(remainingHp / card.hp * 100) : 100;
  const tone = remainingHp === null ? "unknown" : percent <= 24 ? "critical" : percent <= 75 ? "warning" : "healthy";
  return <div aria-hidden={hidden} className={styles.healthStatus} data-tone={tone}>
    {remainingHp !== null && card.hp != null ? <div aria-label={`${card.name}: ${remainingHp} of ${card.hp} HP remaining`}
      aria-valuemax={card.hp} aria-valuemin={0} aria-valuenow={remainingHp} className={styles.healthTrack} role="meter">
      <span style={{ transform: `scaleX(${percent / 100})` }} />
    </div> : null}
    <span className={styles.healthLabel} aria-hidden="true">{remainingHp !== null || card.hp || printedHp ? "HP" : null}</span>
    <strong>{remainingHp ?? (card.hp ? `${card.hp} max` : printedHp ? `${printedHp} printed` : null)}</strong>
  </div>;
}

function AbilityUsedMarker({ className }: { className: string }) {
  return <span aria-label="Ability used this turn" className={className}><TriangleIcon aria-hidden="true" /></span>;
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
      {energySymbolTypes.has(type.toLowerCase()) ? <Image alt="" width={64} height={64} src={`/images/battle-replay/energy/${type.toLowerCase()}.svg`} /> : <ZapIcon aria-hidden="true" />}
      {count ? <strong aria-hidden="true" className={styles.energyOrbCount}>{count}</strong> : null}
    </span>)}
  </div>;
}

function ConditionMarkers({ conditions }: { conditions?: ReplayCard["conditions"] }) {
  if (!conditions?.length) return null;
  return <div className={styles.conditionMarkers}>
    {conditions.map((condition) => <span key={condition} aria-label={condition} title={condition} className={styles.conditionMarker} data-condition={condition}>
      {condition === "Asleep" ? <span aria-hidden="true">Zzz</span> : condition === "Paralyzed" ? <ZapIcon aria-hidden="true" /> : condition === "Confused" ? <ZapIcon aria-hidden="true" /> : <Image alt="" width={41} height={41} src={`/images/battle-replay/conditions/${condition.toLowerCase()}.png`} />}
    </span>)}
  </div>;
}

function EvolutionReveal({ anchor }: { anchor: { current: HTMLDivElement | null } }) {
  const [placement, setPlacement] = useState<{ frame: HTMLElement; left: number; top: number; width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const card = anchor.current?.querySelector<HTMLElement>("[data-card-artwork-frame]");
    const frame = anchor.current?.closest<HTMLElement>("[data-replay-board-frame]");
    if (!card || !frame) return;
    const source = card.getBoundingClientRect();
    const bounds = frame.getBoundingClientRect();
    setPlacement({ frame, left: source.left - bounds.left - source.width / 2, top: source.top - bounds.top - source.height / 2, width: source.width * 2, height: source.height * 2 });
    const settle = () => setPlacement(null);
    window.addEventListener("resize", settle);
    return () => window.removeEventListener("resize", settle);
  }, [anchor]);
  if (!placement) return null;
  return createPortal(<div aria-hidden="true" data-evolution-reveal className={styles.evolutionReveal}
    style={{ left: placement.left, top: placement.top, width: placement.width, height: placement.height }}
    onAnimationEnd={(event) => { if (event.target === event.currentTarget) setPlacement(null); }}>
    <div className={styles.evolutionRadiance} />
    <div className={styles.evolutionSheen} />
    <svg className={styles.evolutionSparks} viewBox="-100 -140 200 280" fill="none">
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M-42-64-66-99M42-64 66-99M-48 0H-82M48 0H82M-42 64-66 99M42 64 66 99M0-72V-113M0 72V113" />
      </g>
      <g fill="currentColor">
        <path d="m-61-48 2-8 2 8 8 2-8 2-2 8-2-8-8-2Zm120 108 2-8 2 8 8 2-8 2-2 8-2-8-8-2Zm-95 43 1.5-6 1.5 6 6 1.5-6 1.5-1.5 6-1.5-6-6-1.5Zm63-195 1.5-6 1.5 6 6 1.5-6 1.5-1.5 6-1.5-6-6-1.5Z" />
      </g>
    </svg>
  </div>, placement.frame);
}

function CardFace({
  card,
  actor,
  damageTaken = 0,
  knockedOut = false,
  effectKey,
  compact = false,
  faceDown = false,
  instantReveal = false,
  motion,
  bannerName,
  onPreview,
}: {
  card: ReplayCard;
  actor: ReplayActor;
  damageTaken?: number;
  knockedOut?: boolean;
  effectKey?: string;
  compact?: boolean;
  faceDown?: boolean;
  instantReveal?: boolean;
  motion?: "bench" | "evolve" | "promote" | "retreat";
  bannerName?: string;
  onPreview: (card: PreviewCard) => void;
}) {
  const stackRef = useRef<HTMLDivElement>(null);
  const turnActor = useContext(TurnActorContext);
  const abilityUsed = Boolean(card.abilityUsed && turnActor === actor);
  const cardResolutions = useContext(DefinitionContext);
  const toolName = card.tool;
  const toolImageUrl = toolName ? Object.values(cardResolutions ?? {}).find((resolution) => resolution.name === toolName && resolution.selectedPrinting?.imageUrl)?.selectedPrinting?.imageUrl ?? "" : "";
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
    >
      <div className={styles.cardSurface}>
      {motion === "evolve" ? <EvolutionReveal key={`${effectKey}-${card.name}`} anchor={stackRef} /> : null}
      {knockedOut ? <span key={`ko-${effectKey}`} className={styles.knockoutStamp} role="status" aria-label={`${card.name} was Knocked Out`}>KO</span> : null}
      {damageTaken > 0 ? <span key={`damage-${effectKey}`} className={styles.attackDamage} role="status" aria-label={`${card.name} took ${damageTaken} damage`}>−{damageTaken}</span> : null}
      {bannerName ? <span className={styles.boardActionBanner} data-card-banner={bannerName}>{bannerName}</span> : null}
      {!faceDown && toolName ? <button type="button" className={styles.attachedToolCard}
        aria-label={`Preview attached ${toolName}, Tool artwork`}
        onClick={() => onPreview({ ...card, abilityUsed, initialPileIndex: 1 + card.underlying.length + card.energy.length })}>
        <CardArtwork card={{ name: toolName, imageUrl: toolImageUrl }} alt={`${toolName}, attached Tool artwork`} sizes="144px" />
      </button> : null}
      <div className={styles.cardHolder}>
        <div className={styles.cardArtworkFrame} data-card-artwork-frame>
        <button
          key={card.name}
          aria-label={faceDown ? "Face-down Pokémon" : `Preview ${card.name}${abilityUsed ? ", ability used this turn" : ""}`}
          disabled={faceDown}
          className={`${styles.cardFace} ${styles.cardPreviewTrigger}`}
          onClick={() => onPreview({ ...card, abilityUsed })}
          type="button"
        >
          <span className={styles.cardFlipper}>
            <span aria-hidden={faceDown} className={styles.cardFront}>
              <CardArtwork card={card} alt={`${card.name}, card artwork`} sizes="144px" />
              {card.damageKnown !== false && card.damage > 0 ? (
                <span
                  aria-label={`${card.damage} damage`}
                  className={styles.damageBadge}
                  data-digits={String(card.damage).length}
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
        {card.energy.length > 0 && !faceDown ? <EnergyOrbs energy={card.energy} className={styles.boardEnergyOrbs} /> : null}
        </div>
        <CardHealth card={card} hidden={faceDown} />
      </div>
      {!faceDown ? <ConditionMarkers conditions={card.conditions} /> : null}
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
      <strong>{count}</strong>
    </>
  );

  if (!onInspect) {
    return (
      <div aria-label={count === null ? label : `${count} cards in ${label.toLowerCase()}`} className={styles.pile}>
        {pileContents}
      </div>
    );
  }

  return (
    <button
      aria-label={`View ${label.toLowerCase()}${count === null ? "" : `, ${count} ${count === 1 ? "card" : "cards"}`}`}
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
      aria-label={remaining === null ? "Prize cards" : `${remaining} Prize cards remaining`}
      className={styles.prizes}
    >
      <Pile count={remaining} label="Prizes" />
    </div>
  );
}

function HandFan({ actor, onPreview, side }: { actor: ReplayActor; onPreview: (card: PreviewCard) => void; side: ReplaySide }) {
  const visibleCardCount = side.handCount ?? (actor === "self" ? side.knownHand.length : 0);
  return (
    <div
      aria-label={
        actor === "self"
          ? side.handCount === null ? "Your hand" : `${side.handCount} cards in your hand`
          : side.handCount === null ? "Opponent hand" : `${side.handCount} cards in the opponent's hidden hand`
      }
      className={styles.handArea}
      data-replay-hand={actor}
    >
      <div className={styles.handLabel}>
        <span>Hand</span>
        <strong>{side.handCount}</strong>
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
                  <CardArtwork card={knownCard} alt={`${knownCard.name}, card artwork in hand`} sizes="80px" />
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
        <CardArtwork card={stadium} alt={`${stadium.name}, card artwork`} sizes="(max-width: 40rem) 56px, 80px" />
      </button>
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
          <CardArtwork card={boardCard} alt={`${card.name}, card artwork`} sizes="112px" />
        </button>
        <ConditionMarkers conditions={boardCard.conditions} />
        {boardCard.damageKnown !== false && boardCard.damage ? <span aria-label={`${boardCard.damage} damage`} className={styles.transactionDamageCounter} data-digits={String(boardCard.damage).length}>{boardCard.damage}</span> : null}
        {abilityUsed ? <AbilityUsedMarker className={styles.transactionAbilityUsedMarker} /> : null}
        {boardCard.energy?.length ? <EnergyOrbs energy={boardCard.energy} className={styles.transactionEnergyOrbs} /> : null}
        {boardCard.tool ? <span className={styles.transactionTool}>Tool · {boardCard.tool}</span> : null}
      </div>;
    })}
    {hiddenCardCount ? <div aria-label={`${hiddenCardCount} face-down ${hiddenCardCount === 1 ? "card" : "cards"}`} className={styles.transactionHiddenCards}>
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
          <span>{stage.label.replace(" · plausible recipient", "")}</span>
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
    <p>Logged movement</p>
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
  playedSupporter,
  playedItem,
  abilities,
  attackDamagePending,
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
  playedSupporter?: ReplayZoneCard;
  playedItem?: ReplayZoneCard;
  abilities: Array<{ actor: ReplayActor; cardId: string; name: string }>;
  attackDamagePending: boolean;
}) {
  const bannerName = (card: ReplayCard) => abilities.find((ability) => ability.actor === actor && ability.cardId === card.id)?.name;
  const abilityCardId = abilities.find((ability) => ability.actor === actor)?.cardId;
  const coinToss = resolveOpeningCoinToss(currentEvent);
  const turnChoice = resolveOpeningTurnChoice(currentEvent);
  const turnActor = useContext(TurnActorContext);
  const currentTurn = turnActor === actor;
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
  const isEvolution = (card: ReplayCard, previous?: ReplayCard | null) => previous && previous.name !== card.name
    && currentEvent?.transaction?.stages.some((stage) => stage.kind === "evolve" && stage.actor === actor && stage.cards.some((entry) => entry.id === card.id));
  const activeMotion = side.active && isCurrentActor
    ? isEvolution(side.active, previousActive)
      ? "evolve"
      : previousSide.active?.id !== side.active.id
        ? "promote"
        : undefined
    : undefined;
  const isAttack = currentEvent?.label === "Attack";
  const damageTaken = (card: ReplayCard) => !isAttack || attackDamagePending ? 0 : (currentEvent.transaction?.stages ?? []).reduce((amount, stage) => {
    if (stage.kind !== "damage" || stage.actor !== actor || !stage.cards.some((entry) => entry.id === card.id)) return amount;
    // A restored earlier allocation changes the displayed total, but is not
    // new damage. Animate only this source operation's recorded amount.
    const recorded = /^(\d+) damage(?: · plausible recipient)?$/.exec(stage.label);
    return recorded ? amount + Number(recorded[1]) : amount;
  }, 0);
  const benchCapacity = stadium?.name === "Area Zero Underdepths" || displayBench.length > 5 ? 8 : 5;
  const benchRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const bench = benchRef.current;
    if (!bench) return;
    const centre = () => {
      const source = abilityCardId ? [...bench.querySelectorAll<HTMLElement>("[data-board-card]")].find((card) => card.dataset.boardCard === abilityCardId) : undefined;
      if (source && bench.scrollWidth > bench.clientWidth) {
        const card = source.getBoundingClientRect();
        const viewport = bench.getBoundingClientRect();
        bench.scrollLeft += card.left + card.width / 2 - viewport.left - viewport.width / 2;
      } else bench.scrollLeft = (bench.scrollWidth - bench.clientWidth) / 2;
    };
    centre();
    const observer = new ResizeObserver(centre);
    observer.observe(bench);
    return () => observer.disconnect();
  }, [abilityCardId, benchCapacity]);

  return (
    <section className={styles.playerBoard} data-actor={actor} data-current-turn={currentTurn || undefined}>
      {currentTurn ? <div aria-hidden="true" className={styles.boardTurnBorder} /> : null}
      <header className={styles.playerHeader}>
        <div className={styles.playerIdentity}>
          <span>{actor === "self" ? "You" : "Opponent"}</span>
          <strong>{side.name}</strong>
          {currentTurn ? <span className="sr-only">{actor === "self" ? "Your turn" : "Opponent’s turn"}</span> : null}
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
                <CardFace actor={actor} bannerName={bannerName(displayActive)} damageTaken={damageTaken(displayActive)} knockedOut={knockedOutIds.has(displayActive.id)} effectKey={currentEvent?.sourceTitle} card={displayActive} faceDown={faceDown} instantReveal={instantReveal} motion={activeMotion} onPreview={onPreview} />
              ) : (
                <span aria-hidden="true" className={styles.emptyZone} />
              )}
            </div>
            <StadiumSpot actor={actor} onPreview={onPreview} stadium={stadium} />
            {playedSupporter || playedItem ? <div className={styles.boardSupporter} data-played-supporter={playedSupporter ? actor : undefined} data-played-item={playedItem ? actor : undefined}>
              <span>{playedItem ? "Item" : "Supporter"}</span>
              <button aria-label={`Preview played ${(playedItem ?? playedSupporter)!.name}`} className={`${styles.stadium} ${styles.cardPreviewTrigger}`} onClick={() => onPreview((playedItem ?? playedSupporter)!)} type="button">
                <CardArtwork card={(playedItem ?? playedSupporter)!} alt={`${(playedItem ?? playedSupporter)!.name}, played ${playedItem ? "Item" : "Supporter"}`} sizes="(max-width: 40rem) 56px, 80px" eager />
              </button>
            </div> : null}
          </div>
          <div ref={benchRef} className={styles.bench} aria-label={`${side.name} Bench`} data-capacity={benchCapacity}>
            {Array.from({ length: benchCapacity }).map((_, index) => {
              const benchCard = displayBench[index];
              const previousCard = benchCard
                ? [previousSide.active, ...previousSide.bench].find((card) => card?.id === benchCard.id)
                : undefined;
              const wasActive = benchCard && previousSide.active?.id === benchCard.id;
              const isNew = benchCard && !previousSide.bench.some((card) => card.id === benchCard.id);
              const motion = benchCard && isCurrentActor && isEvolution(benchCard, previousCard)
                ? "evolve"
                : wasActive ? "retreat" : isNew ? "bench" : undefined;
              return (
              <div
                className={styles.benchSlot}
                data-populated={benchCard ? true : undefined}
                key={index}
              >
                {benchCard ? (
                  <CardFace actor={actor} bannerName={bannerName(benchCard)} knockedOut={knockedOutIds.has(benchCard.id)} damageTaken={damageTaken(benchCard)} effectKey={currentEvent?.sourceTitle} card={benchCard} compact faceDown={faceDown} instantReveal={instantReveal} motion={motion} onPreview={onPreview} />
                ) : null}
              </div>
            );})}
          </div>
          {side.unplaced?.length ? <div className={styles.unplacedCards} aria-label={`${side.name} Pokémon`}>
            <div>{side.unplaced.map((card) => <CardFace actor={actor} card={card} bannerName={bannerName(card)} compact key={card.id} faceDown={faceDown} instantReveal={instantReveal} onPreview={onPreview} />)}</div>
          </div> : null}
        </div>

        <div className={styles.zonePiles}>
          <Pile count={side.deckCount} label="Deck" />
          <Pile
            animate={side.discard[0]?.id !== previousSide.discard[0]?.id}
            count={side.discardCount ?? null}
            label="Discard"
            onInspect={() => onInspectDiscard(actor)}
            topCard={playedItem ? previousSide.discard[0] : side.discardCount == null || side.uncertainZones?.includes("discard") || side.discardCount > side.discard.length ? undefined : side.discard[0]}
          />
        </div>
      </div>
      <HandFan actor={actor} onPreview={onPreview} side={side} />
    </section>
  );
}

type BoardSnapshot = {
  index: number;
  cards: Map<string, { rect: DOMRect; uncertain: boolean }>;
  hands: Map<ReplayActor, { rect: DOMRect; cards: Map<string, DOMRect[]>; slots: Array<{ rect: DOMRect; name?: string }> }>;
  decks: Map<ReplayActor, DOMRect>;
};

function boardChanged(previous: ReplayState, current: ReplayState) {
  return (["self", "opponent"] as const).some((actor) => {
    const positions = (side: ReplaySide) => [side.active, ...side.bench]
      .map((card) => card ? `${card.id}:${card.name}` : null);
    return JSON.stringify(positions(previous[actor])) !== JSON.stringify(positions(current[actor]));
  });
}

function handRefreshBoardAction(event: ReplayEvent | null, previous: ReplayState, state: ReplayState) {
  if (!event?.transaction || event.unresolved?.length) return null;
  const [play, shuffle, draw] = event.transaction.stages;
  if (event.transaction.stages.length !== 3 || play?.kind !== "play" || play.cards.length !== 1
    || play.cards[0].name !== "Lillie's Determination" || shuffle?.kind !== "shuffle"
    || draw?.kind !== "draw" || event.transaction.stages.some((stage) => stage.scope === "both" || stage.targetResolved === false || stage.actor !== event.actor)) return null;
  const returnedCount = shuffle.cards.length + (shuffle.hiddenCount ?? 0);
  const drawnCount = draw.cards.length + (draw.hiddenCount ?? 0);
  if (previous[event.actor].handCount !== returnedCount + 1 || state[event.actor].handCount !== drawnCount) return null;
  const drawStart = 800 + DECK_SHUFFLE_MS + returnedCount * 60;
  return { actor: event.actor, card: play.cards[0], returned: shuffle.cards, returnedCount, drawnCount, drawStart, duration: drawStart + drawnCount * 90 + 650 };
}

function damageTransferBoardAction(event: ReplayEvent | null, previous: ReplayState, state: ReplayState) {
  const ability = event?.transaction?.stages.find((stage) => stage.kind === "ability" && stage.label === "Adrena-Brain");
  if (!event || !ability || ability.cards.length !== 1 || ability.cards[0].name !== "Munkidori"
    || event.transaction?.stages.some((stage) => !["ability", "move", "damage"].includes(stage.kind))) return null;
  const moves = event.sourceDetails.map((line) => /^- .+? moved (a|\d+) damage counters? from .+?['’]s (.+?) to .+?['’]s (.+?)\.$/i.exec(line)).filter((match) => match !== null);
  if (moves.length !== 1) return null;
  const count = moves[0][1] === "a" ? 1 : Number(moves[0][1]);
  if (count < 1 || count > 3) return null;
  const changes = (["self", "opponent"] as const).flatMap((actor) => {
    const before = [previous[actor].active, ...previous[actor].bench];
    return [state[actor].active, ...state[actor].bench].flatMap((card) => {
      const old = before.find((entry) => entry?.id === card?.id);
      return card && old && card.name === old.name && card.damageKnown !== false && old.damageKnown !== false && card.damage !== old.damage
        ? [{ actor, id: card.id, name: card.name, before: old.damage, after: card.damage }] : [];
    });
  });
  const source = changes.find((card) => card.actor === event.actor && card.name === moves[0][2] && card.before - card.after === count * 10);
  const target = changes.find((card) => card.actor !== event.actor && card.name === moves[0][3] && card.after - card.before === count * 10);
  if (changes.length !== 2 || !source || !target
    || ![state[event.actor].active, ...state[event.actor].bench].some((card) => card?.id === ability.cards[0].id)) return null;
  return { actor: event.actor, source, target, count, duration: 2200 };
}

function prizeBoardAction(event: ReplayEvent | null) {
  if (event?.label !== "Prize" || !event.transaction?.stages.length) return null;
  if (event.transaction.stages.some((stage) => !(stage.kind === "draw" && stage.label === "Take Prize" && stage.actor === event.actor && stage.scope !== "both")
    && !(stage.kind === "move" && stage.label === "Promote"))) return null;
  const stages = event.transaction.stages.filter((stage) => stage.kind === "draw");
  const cards = stages.flatMap((stage) => stage.cards);
  const count = stages.reduce((total, stage) => total + stage.cards.length + (stage.hiddenCount ?? 0), 0);
  if (count < 1 || count > 6) return null;
  return { actor: event.actor, cards, count, duration: event.actor === "self" ? count * 2100 + 250 : count * 180 + 1200 };
}

function boardAbilityActivations(event: ReplayEvent | null, previous: ReplayState, state: ReplayState) {
  const stages = event?.transaction?.stages.filter((stage) => stage.kind === "ability") ?? [];
  return stages.flatMap((stage) => {
    const actor = stage.actor ?? event!.actor;
    const side = state[actor];
    const cards = [side.active, ...side.bench, ...(side.unplaced ?? [])].filter((card): card is ReplayCard => Boolean(card));
    const source = cards.find((card) => stage.cards.some((used) => used.id === card.id
      || Boolean(used.physicalCardId && used.physicalCardId === card.physicalCardId)));
    const newlyUsed = cards.filter((card) => card.abilityUsed
      && ![previous[actor].active, ...previous[actor].bench, ...(previous[actor].unplaced ?? [])].some((before) => before?.id === card.id && before.abilityUsed));
    const cardId = source?.id ?? (stages.length === 1 && newlyUsed.length === 1 ? newlyUsed[0].id : undefined);
    return cardId ? [{ actor, cardId, name: stage.label }] : [];
  });
}

type DeckAbilityCard = { card?: ReplayZoneCard; destination: "hand" | "bench" | "discard" | "deck" | "attach"; evolution?: boolean; sourceId?: string; targetId?: string; actor?: ReplayActor; pile?: "Deck" | "Discard" | "Hand" | "Board"; faceUp?: boolean };
type BoardDrawAction = {
  actor: ReplayActor; pile: "Deck" | "Prizes" | "Discard" | "Hand"; kind: "ability" | "prize" | "item" | "retreat" | "evolution";
  flights: Array<DeckAbilityCard & { delay: number; reveal: boolean }>;
};

function evolutionBoardAction(event: ReplayEvent | null, previous: ReplayState, state: ReplayState) {
  if (event?.label !== "Evolve" || !event.transaction || event.unresolved?.length) return null;
  if (event.transaction.stages.some((stage) => !["before", "evolve"].includes(stage.kind)
    || stage.targetResolved === false || stage.hiddenCount || stage.scope === "both")) return null;
  const flights: BoardDrawAction["flights"] = [];
  for (const stage of event.transaction.stages.filter((stage) => stage.kind === "evolve")) {
    const actor = stage.actor ?? event.actor;
    for (const card of stage.cards) {
      const target = [state[actor].active, ...state[actor].bench].find((target) => target?.id === card.id && target.name === card.name);
      const before = [previous[actor].active, ...previous[actor].bench].find((before) => before?.id === target?.id);
      if (!target || !before || before.name === card.name) return null;
      flights.push({ actor, card, targetId: target.id, pile: "Hand", destination: "bench", evolution: true,
        faceUp: true, reveal: false, delay: 100 + flights.length * 180 });
    }
  }
  return flights.length ? { actor: event.actor, flights, duration: flights.at(-1)!.delay + 700 + 1000 } : null;
}

function itemBoardAction(event: ReplayEvent | null, state: ReplayState, program: ReplayProgram) {
  const play = event?.transaction?.stages.find((stage) => stage.kind === "play");
  if (!event || play?.kind !== "play" || play.cards.length !== 1) return null;
  const card = play.cards[0];
  const definition = resolveReplayCardPreviewDefinition(card, program);
  if ((definition?.agreedFacts?.trainerType ?? definition?.selectedDefinition?.trainerType) !== "Item") return null;
  const flights: BoardDrawAction["flights"] = [];
  const shuffles: Array<{ actor: ReplayActor; delay: number }> = [];
  let delay = 550;
  const handled = !event.unresolved?.length && event.transaction!.stages.every((stage) =>
    ["play", "draw", "discard", "bench", "return", "shuffle", "before", "evolve"].includes(stage.kind)
    && (stage.kind !== "return" || stage.label === "To hand")
    && stage.targetResolved !== false && stage.scope !== "both");
  if (handled) for (const stage of event.transaction!.stages) {
    const actor = stage.actor ?? event.actor;
    const cards = [...stage.cards, ...Array.from({ length: stage.hiddenCount ?? 0 }, () => undefined)];
    if (stage.kind === "before") continue;
    if (stage.kind === "play") continue;
    for (const entry of cards) {
      const destination = stage.kind === "shuffle" ? "deck" : stage.kind === "discard" ? "discard"
        : stage.kind === "bench" || stage.kind === "evolve" ? "bench" : "hand";
      const pile = stage.kind === "discard" || stage.kind === "shuffle" || stage.kind === "evolve" ? "Hand"
        : stage.kind === "return" ? "Discard" : "Deck";
      const target = destination === "bench" ? [state[actor].active, ...state[actor].bench].find((target) => target && entry && target.id === entry.id) : undefined;
      const drawn = entry && (stage.kind === "bench" || stage.kind === "discard") ? flights.find((flight) =>
        flight.actor === actor && flight.destination === "hand" && flight.card
        && (flight.card.id === entry.id || Boolean(entry.physicalCardId && entry.physicalCardId === flight.card.physicalCardId))) : undefined;
      if (drawn) {
        drawn.destination = destination;
        drawn.targetId = target?.id;
        drawn.reveal = Boolean(drawn.card);
        continue;
      }
      const reveal = Boolean(entry) && pile !== "Hand" && (actor === "self" || destination === "bench");
      flights.push({ card: entry, actor, pile, destination, evolution: stage.kind === "evolve", targetId: target?.id, reveal,
        faceUp: Boolean(entry) && pile === "Hand" && (actor === "self" || destination === "discard" || destination === "bench"), delay });
      delay += reveal ? 2100 : pile === "Hand" ? 120 : 180;
    }
    if (stage.kind === "shuffle") {
      shuffles.push({ actor, delay: delay + 450 });
      delay += 450 + DECK_SHUFFLE_MS;
    } else if (stage.kind === "discard" || stage.kind === "evolve") delay += 450;
    else if (cards.length) delay += 850;
  }
  const finish = Math.max(handled ? 1000 : 1900, ...flights.map((flight) => flight.delay + (flight.evolution ? 1600 : flight.reveal ? 1900 : flight.pile === "Hand" ? 450 : 1000)), ...shuffles.map((shuffle) => shuffle.delay + DECK_SHUFFLE_MS)) + 200;
  return { actor: event.actor, card, flights, shuffles, finish, duration: finish + 650, handled };
}

function deckAbilityBoardAction(event: ReplayEvent | null, state: ReplayState) {
  if (event?.label !== "Ability" || !event.transaction || event.unresolved?.length) return null;
  const stages = event.transaction.stages;
  const ability = stages.find((stage) => stage.kind === "ability");
  if (!ability || stages.some((stage) => !["ability", "draw", "bench", "discard"].includes(stage.kind)
    || stage.scope === "both" || stage.targetResolved === false || stage.actor !== event.actor)) return null;
  const sameCard = (left: ReplayZoneCard, right: ReplayZoneCard) => left.id === right.id
    || Boolean(left.physicalCardId && left.physicalCardId === right.physicalCardId);
  const drawn = stages.filter((stage) => stage.kind === "draw");
  const cards: DeckAbilityCard[] = drawn.flatMap((stage) => [
    ...stage.cards.map((card): DeckAbilityCard => ({ card, destination: "hand" })),
    ...Array.from({ length: stage.hiddenCount ?? 0 }, (): DeckAbilityCard => ({ destination: "hand" })),
  ]);
  if (!cards.length || cards.length > 10) return null;
  // Only route cards explicitly drawn in this action. A discard cost or another
  // unhandled effect retains its existing transaction presentation.
  for (const stage of stages.filter((stage) => stage.kind === "bench" || stage.kind === "discard")) {
    if (stage.hiddenCount) return null;
    for (const card of stage.cards) {
      const entry = cards.find((entry) => entry.card && sameCard(entry.card, card));
      if (!entry) return null;
      entry.destination = stage.kind as "bench" | "discard";
      entry.targetId = card.id;
    }
  }
  const side = state[event.actor];
  for (const entry of cards.filter((entry) => entry.destination === "bench")) {
    const destination = side.bench.find((card) => entry.card && sameCard(entry.card, card));
    if (!destination) return null;
    entry.targetId = destination.id;
  }
  let nextDelay = 350;
  let duration = 0;
  const flights = cards.map((entry) => {
    const reveal = Boolean(entry.card) && (event.actor === "self" || entry.destination !== "hand");
    const delay = nextDelay;
    duration = Math.max(duration, delay + (reveal ? 1900 : 1000));
    nextDelay += reveal ? 2100 : 180;
    return { ...entry, reveal, delay };
  });
  return { actor: event.actor, flights, duration: duration + 250 };
}

function abilityAttachmentBoardAction(event: ReplayEvent | null, previous: ReplayState, state: ReplayState, program: ReplayProgram) {
  if (!event?.transaction || event.unresolved?.length) return null;
  const stages = event.transaction.stages;
  const ability = stages.find((stage) => stage.kind === "ability");
  if (!ability || stages[0] !== ability || stages.filter((stage) => stage.kind === "ability").length !== 1
    || ability.cards.length !== 1 || stages.some((stage, index) => stage.kind === "move" && stages[index - 1]?.kind !== "attach" || !["ability", "attach", "move"].includes(stage.kind)
    || stage.scope === "both" || stage.targetResolved === false || stage.actor !== event.actor)) return null;
  const definition = resolveReplayCardPreviewDefinition(ability.cards[0], program);
  const text = (definition?.agreedFacts?.abilities ?? definition?.selectedDefinition?.abilities ?? [])
    .find((entry) => entry.name === ability.label)?.text;
  // Card text establishes the omitted source; the log supplies cards and targets.
  const clauses = text?.split(/(?<=[.!?])\s+/).filter((clause) => /\battach\b/i.test(clause)).join(" ") ?? "";
  const origins = new Set([...clauses.matchAll(/\bfrom your (discard pile|deck|hand)\b/gi)].map((match) => match[1].toLowerCase()));
  if (origins.size !== 1) return null;
  const origin = [...origins][0];
  const pile: "Discard" | "Hand" | "Deck" = origin === "discard pile" ? "Discard" : origin === "hand" ? "Hand" : "Deck";
  const flights: BoardDrawAction["flights"] = [];
  for (const [index, stage] of stages.entries()) {
    if (stage.kind !== "attach") continue;
    const move = stages[index + 1];
    if (!stage.cards.length || stage.hiddenCount || stage.cards.some((card) => !/Energy$/i.test(card.name))
      || move?.kind !== "move" || move.cards.length !== 1) return null;
    const target = [state[event.actor].active, ...state[event.actor].bench].find((card) => card?.id === move.cards[0].id);
    const before = [previous[event.actor].active, ...previous[event.actor].bench].find((card) => card?.id === target?.id);
    if (!target || !before) return null;
    const energy = [...target.energy];
    for (const card of stage.cards) {
      const type = card.name.replace(/^Basic (.+) Energy$/i, "$1");
      const energyIndex = energy.indexOf(type);
      if (energyIndex < 0) return null;
      energy.splice(energyIndex, 1);
      flights.push({ card, actor: event.actor, destination: "attach", targetId: target.id, pile,
        faceUp: true, reveal: false, delay: 550 + flights.length * 180 });
    }
    if (energy.length !== before.energy.length || [...energy].sort().join("\0") !== [...before.energy].sort().join("\0")) return null;
  }
  return flights.length ? { actor: event.actor, pile, flights, duration: flights.at(-1)!.delay + 1100 } : null;
}

function retreatBoardAction(event: ReplayEvent | null, previous: ReplayState, state: ReplayState) {
  if (event?.label !== "Retreat" || !event.transaction || event.unresolved?.length) return null;
  const actor = event.actor;
  const stages = event.transaction.stages;
  const out = stages.find((stage) => stage.kind === "move" && stage.label === "Out");
  const source = previous[actor].active;
  if (!source || out?.cards.length !== 1 || out.cards[0].id !== source.id
    || stages.some((stage) => stage.actor !== actor || stage.scope === "both" || stage.targetResolved === false
      || !(stage.kind === "discard" || stage.kind === "move" && ["Out", "Promote"].includes(stage.label)))) return null;
  const discarded = stages.filter((stage) => stage.kind === "discard");
  const paid = discarded.flatMap((stage) => stage.cards);
  const target = state[actor].bench.find((card) => card.id === source.id);
  if (!target || !paid.length || discarded.some((stage) => stage.hiddenCount)
    || paid.some((card) => !/Energy$/i.test(card.name))) return null;
  const remaining = [...source.energy];
  for (const card of paid) {
    const index = remaining.indexOf(card.name.replace(/^Basic (.+) Energy$/i, "$1"));
    if (index < 0) return null;
    remaining.splice(index, 1);
  }
  if ([...remaining].sort().join("\0") !== [...target.energy].sort().join("\0")) return null;
  const arrivals = [...state[actor].discard].filter((card) => !previous[actor].discard.some((before) => before.id === card.id));
  const flights: BoardDrawAction["flights"] = [];
  for (const card of paid) {
    const index = arrivals.findIndex((entry) => entry.name === card.name);
    if (index < 0) return null;
    flights.push({ card: arrivals.splice(index, 1)[0], sourceId: source.id, actor, pile: "Board",
      destination: "discard", reveal: false, faceUp: true, delay: 150 + flights.length * 140 });
  }
  const moveDelay = flights.at(-1)!.delay + 650 + 120;
  return { actor, flights, moveDelay, duration: moveDelay + 650 };
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
  const [previewPileIndex, setPreviewPileIndex] = useState(0);
  const previewPile = useMemo<PreviewCard[]>(() => {
    if (!previewedCard) return [];
    const attachmentCard = (name: string, id: string): PreviewCard => {
      const definition = Object.entries(program.cardResolutions ?? {}).find(([, resolution]) => resolution.name === name && resolution.selectedPrinting?.imageUrl);
      return { id, name, imageUrl: definition?.[1].selectedPrinting?.imageUrl ?? artwork[name] ?? "", definitionKey: definition?.[0] };
    };
    const attachments = (previewedCard.energy ?? []).map((energy, index) => {
      const name = /Energy$/.test(energy) ? energy : `Basic ${energy} Energy`;
      return attachmentCard(name, `${previewedCard.id}-energy-${index}`);
    });
    if (previewedCard.tool) attachments.push(attachmentCard(previewedCard.tool, `${previewedCard.id}-tool`));
    return [previewedCard, ...(previewedCard.underlying ?? []).toReversed(), ...attachments];
  }, [artwork, previewedCard, program.cardResolutions]);
  const previewPileCard = previewPile[previewPileIndex] ?? previewedCard;
  const cyclePreviewPile = (direction: number) => setPreviewPileIndex((index) => Math.max(0, Math.min(index + direction, previewPile.length - 1)));
  const [inspectedDiscard, setInspectedDiscard] =
    useState<ReplayActor | null>(null);
  const [playing, setPlaying] = useState(false);
  const timelineRef = useRef<HTMLOListElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const boardSnapshotRef = useRef<BoardSnapshot | null>(null);
  const boardGhostRef = useRef<HTMLDivElement>(null);
  const attackImpactRef = useRef<HTMLDivElement>(null);
  const [openingRevealPending, setOpeningRevealPending] = useState(false);
  const [animateOpeningReveal, setAnimateOpeningReveal] = useState(false);
  const previewTriggerRef = useRef<HTMLElement | null>(null);
  const discardTriggerRef = useRef<HTMLElement | null>(null);
  const replayEvents = program.events;
  const replayFrames = useMemo(() => program.frames.map((frame) => resolveReplayBoardDisplay(frame, program.cardResolutions)), [program.frames, program.cardResolutions]);
  const replaySource = program.source;
  const state = replayFrames[actionIndex];
  const inspectedDiscardSide = inspectedDiscard ? state[inspectedDiscard] : null;
  const previousState = replayFrames[Math.max(0, actionIndex - 1)];
  const currentEvent = useMemo(() => {
    const recorded = actionIndex > 0 ? replayEvents[actionIndex - 1] : null;
    return resolveReplayDisplayEvent(recorded, program.frames[actionIndex], state);
  }, [actionIndex, program.frames, replayEvents, state]);
  const attackAnnouncement = currentEvent?.label === "Attack"
    ? currentEvent.transaction?.stages.find((stage) => stage.kind === "attack") : undefined;
  const finalSetupIndex = replayEvents.findIndex((event) => event.turn > 0);
  const atOpeningReveal = finalSetupIndex > 0 && actionIndex === finalSetupIndex;
  const openingRevealed = finalSetupIndex > 0 && actionIndex >= finalSetupIndex && !openingRevealPending;
  const routineAction = useMemo(() => routineBoardAction(currentEvent, previousState, state, replayEvents[actionIndex - 2]), [actionIndex, currentEvent, previousState, replayEvents, state]);
  const handRefresh = useMemo(() => handRefreshBoardAction(currentEvent, previousState, state), [currentEvent, previousState, state]);
  const prizeDraw = useMemo(() => prizeBoardAction(currentEvent), [currentEvent]);
  const abilityActivations = useMemo(() => boardAbilityActivations(currentEvent, previousState, state), [currentEvent, previousState, state]);
  const abilityDraw = useMemo(() => deckAbilityBoardAction(currentEvent, state), [currentEvent, state]);
  const abilityAttachment = useMemo(() => abilityAttachmentBoardAction(currentEvent, previousState, state, program), [currentEvent, previousState, state, program]);
  const retreatAction = useMemo(() => retreatBoardAction(currentEvent, previousState, state), [currentEvent, previousState, state]);
  const itemAction = useMemo(() => itemBoardAction(currentEvent, state, program), [currentEvent, state, program]);
  const evolutionAction = useMemo(() => evolutionBoardAction(currentEvent, previousState, state), [currentEvent, previousState, state]);
  const deckShuffles = useMemo(() => handRefresh ? [{ actor: handRefresh.actor, delay: handRefresh.drawStart - DECK_SHUFFLE_MS }] : itemAction?.shuffles ?? [], [handRefresh, itemAction]);
  const [completedItemIndex, setCompletedItemIndex] = useState<number | null>(null);
  const cardDraw = useMemo<BoardDrawAction | null>(() => itemAction ? { ...itemAction, pile: "Deck", kind: "item" } : evolutionAction ? { ...evolutionAction, pile: "Deck", kind: "evolution" } : abilityDraw ? { ...abilityDraw, pile: "Deck", kind: "ability" } : abilityAttachment ? { ...abilityAttachment, kind: "ability" } : retreatAction ? { ...retreatAction, pile: "Discard", kind: "retreat" } : prizeDraw ? { actor: prizeDraw.actor, pile: "Prizes", kind: "prize", flights: Array.from({ length: prizeDraw.count }, (_, index) => ({ card: prizeDraw.cards[index], destination: "hand" as const, targetId: undefined, reveal: prizeDraw.actor === "self" && Boolean(prizeDraw.cards[index]), delay: index * (prizeDraw.actor === "self" ? 2100 : 180) })) } : null, [abilityAttachment, abilityDraw, evolutionAction, itemAction, prizeDraw, retreatAction]);
  const damageTransfer = useMemo(() => damageTransferBoardAction(currentEvent, previousState, state), [currentEvent, previousState, state]);
  const [pendingAttackIndex, setPendingAttackIndex] = useState<number | null>(null);
  const attackDamageAmounts = useMemo(() => {
    const amounts = new Map<string, number>();
    if (!attackAnnouncement) return amounts;
    for (const stage of currentEvent?.transaction?.stages ?? []) {
      const amount = stage.kind === "damage" ? /^(\d+) damage(?: · plausible recipient)?$/.exec(stage.label) : null;
      if (!amount || !stage.actor) continue;
      for (const card of stage.cards) {
        const key = `${stage.actor}:${card.id}`;
        amounts.set(key, (amounts.get(key) ?? 0) + Number(amount[1]));
      }
    }
    return amounts;
  }, [attackAnnouncement, currentEvent]);
  const [counterProgress, setCounterProgress] = useState<{ index: number; departed: number; arrived: number } | null>(null);
  const [arrivedFlights, setArrivedFlights] = useState<{ index: number; flights: number[] } | null>(null);
  const boardState = useMemo(() => {
    const attackPending = pendingAttackIndex === actionIndex;
    if (!damageTransfer && !attackPending && !cardDraw) return state;
    const progress = counterProgress?.index === actionIndex ? counterProgress : { departed: 0, arrived: 0 };
    const damageAt = (card: ReplayCard | null, actor: ReplayActor) => {
      if (!card) return card;
      const cardId = card.id;
      for (const [index, entry] of (cardDraw?.flights ?? []).entries()) {
        if ((entry.sourceId ?? entry.targetId) !== card.id || (entry.actor ?? cardDraw!.actor) !== actor
          || arrivedFlights?.index === actionIndex && arrivedFlights.flights.includes(index)) continue;
        if (entry.evolution) {
          const before = [previousState[actor].active, ...previousState[actor].bench].find((before) => before?.id === cardId);
          if (before) card = before;
        } else if (cardDraw?.kind === "retreat" && entry.card) {
          card = { ...card, energy: [...card.energy, entry.card.name.replace(/^Basic (.+) Energy$/i, "$1")] };
        } else if (entry.destination === "attach" && entry.card) {
          const energy: string[] = [...card.energy];
          const index = energy.indexOf(entry.card.name.replace(/^Basic (.+) Energy$/i, "$1"));
          if (index >= 0) { energy.splice(index, 1); card = { ...card, energy }; }
        }
      }
      // Hold only this action's recorded damage; retrospective copy changes
      // must never become an animated damage amount.
      const attackAmount = attackPending && card.damageKnown !== false ? attackDamageAmounts.get(`${actor}:${card.id}`) ?? 0 : 0;
      const damage = damageTransfer && actor === damageTransfer.source.actor && card.id === damageTransfer.source.id
        ? damageTransfer.source.before - progress.departed * 10
        : damageTransfer && actor === damageTransfer.target.actor && card.id === damageTransfer.target.id
          ? damageTransfer.target.before + progress.arrived * 10 : Math.max(0, card.damage - attackAmount);
      return damage === card.damage ? card : { ...card, damage };
    };
    return { ...state, ...Object.fromEntries((["self", "opponent"] as const).map((actor) => [actor, {
      ...state[actor], ...(cardDraw?.kind === "retreat" && cardDraw.actor === actor ? {
        discard: state[actor].discard.filter((card) => !cardDraw.flights.some((entry, index) => entry.card?.id === card.id
          && !(arrivedFlights?.index === actionIndex && arrivedFlights.flights.includes(index)))),
        discardCount: state[actor].discardCount == null ? state[actor].discardCount : state[actor].discardCount - cardDraw.flights.filter((_, index) =>
          !(arrivedFlights?.index === actionIndex && arrivedFlights.flights.includes(index))).length,
      } : {}), active: damageAt(state[actor].active, actor), bench: state[actor].bench.map((card) => damageAt(card, actor)!),
    }])) };
  }, [actionIndex, arrivedFlights, attackDamageAmounts, cardDraw, counterProgress, damageTransfer, pendingAttackIndex, previousState, state]);
  const movingOnBoard = boardChanged(previousState, state);
  // Effect-driven placements (for example Poffin searching the deck) need the
  // selection context. Direct hand placements and moves are shown on the board.
  const effectPlacement = currentEvent?.label !== "Pokémon" && currentEvent?.transaction?.stages.some((stage) => stage.kind === "bench");
  const inlineTransaction = Boolean(itemAction) || abilityActivations.length > 0 || movingOnBoard && !effectPlacement;
  const visibleTransaction = currentEvent?.transaction ? {
    ...currentEvent.transaction,
    stages: currentEvent.transaction.stages.filter((stage) => !(stage.kind === "draw" && stage.label === "Opening hand")),
  } : null;
  const popupTransaction = visibleTransaction?.stages.length && !routineAction && !handRefresh && !damageTransfer && !(itemAction?.handled || cardDraw && !itemAction) && currentEvent?.label !== "Attack" && currentEvent?.label !== "KO"
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
  const autoplayDelay = itemAction ? itemAction.duration : evolutionAction ? evolutionAction.duration : abilityDraw ? abilityDraw.duration : abilityAttachment ? abilityAttachment.duration : retreatAction ? retreatAction.duration : prizeDraw ? prizeDraw.duration : damageTransfer ? damageTransfer.duration : handRefresh ? handRefresh.duration : atOpeningReveal ? 1800 : currentEvent?.label === "KO" ? 2000 : currentEvent?.label === "Attack" ? 2400 : coinToss ? 4400 : resultOnlyCoinFlip ? 2800 : resolveOpeningTurnChoice(currentEvent) ? 2400 : currentEvent?.transaction && currentEvent.transaction.stages.length > 1 ? 1900 : 1100;
  const maxIndex = replayFrames.length - 1;
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

  useLayoutEffect(() => {
    const board = boardRef.current;
    const frame = board?.parentElement;
    if (!board || !frame || !deckShuffles.length || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const frameRect = frame.getBoundingClientRect();
    const animations: Animation[] = [];
    const cards: HTMLElement[] = [];
    for (const [sequence, shuffle] of deckShuffles.entries()) {
      const deck = board.querySelector<HTMLElement>(`section[data-actor="${shuffle.actor}"] [data-pile-face="Deck"]`);
      const group = frame.querySelector<HTMLElement>(`[data-deck-shuffle="${sequence}"]`);
      if (!deck || !group) continue;
      const origin = deck.getBoundingClientRect();
      if (!origin.width) continue;
      // Split towards the board's interior, so the outer packet cannot clip.
      const split = origin.width * 0.72;
      animations.push(deck.animate([
        { opacity: 1, offset: 0 }, { opacity: 0, offset: 0.08 },
        { opacity: 0, offset: 0.92 }, { opacity: 1, offset: 1 },
      ], { id: "replay-shuffle-pile", delay: shuffle.delay, duration: DECK_SHUFFLE_MS, fill: "both" }));
      group.querySelectorAll<HTMLElement>("[data-shuffle-card]").forEach((card, index) => {
        const leftPacket = index % 2 === 0;
        const layer = Math.floor(index / 2);
        const packetX = leftPacket ? -split : 0;
        const tilt = leftPacket ? -6 : 6;
        Object.assign(card.style, { visibility: "visible", zIndex: `${55 + index}`, left: `${origin.left - frameRect.left}px`, top: `${origin.top - frameRect.top}px`, width: `${origin.width}px`, height: `${origin.height}px` });
        const animation = card.animate([
          { transform: "none", opacity: 0, offset: 0 },
          { transform: `translate(0, ${-layer * 2}px)`, opacity: 1, offset: 0.08, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
          { transform: `translate(${packetX}px, ${-10 - layer * 3}px) rotate(${tilt}deg)`, opacity: 1, offset: 0.3, easing: "ease-in-out" },
          { transform: `translate(${packetX}px, ${-10 - layer * 3}px) rotate(${tilt}deg)`, opacity: 1, offset: 0.38 + index * 0.018, easing: "ease-in-out" },
          { transform: `translate(${-split / 2}px, ${-index * 1.5}px) rotate(${leftPacket ? -1 : 1}deg)`, opacity: 1, offset: 0.58 + index * 0.018, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
          { transform: `translate(0, ${-index}px) rotate(0deg)`, opacity: 1, offset: 0.88 },
          { transform: "none", opacity: 1, offset: 0.96 },
          { transform: "none", opacity: 0, offset: 1 },
        ], { id: "replay-deck-shuffle", delay: shuffle.delay, duration: DECK_SHUFFLE_MS, fill: "both", easing: "linear" });
        animation.onfinish = () => { card.style.visibility = "hidden"; animation.cancel(); };
        animations.push(animation);
        cards.push(card);
      });
    }
    const cancel = () => {
      animations.forEach((animation) => animation.cancel());
      cards.forEach((card) => { card.style.visibility = "hidden"; });
    };
    window.addEventListener("resize", cancel);
    return () => { cancel(); window.removeEventListener("resize", cancel); };
  }, [actionIndex, deckShuffles]);

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
      const slots = [...hand.querySelectorAll<HTMLElement>("[data-hand-index]")].map((card) => ({ rect: card.getBoundingClientRect(), name: card.dataset.handCard }));
      hands.set(hand.dataset.replayHand as ReplayActor, { rect: hand.getBoundingClientRect(), cards: knownCards, slots });
    }
    const decks: BoardSnapshot["decks"] = new Map();
    for (const deck of board.querySelectorAll<HTMLElement>('[data-pile-face="Deck"]')) {
      decks.set(deck.closest<HTMLElement>("[data-actor]")?.dataset.actor as ReplayActor, deck.getBoundingClientRect());
    }
    boardSnapshotRef.current = { index: actionIndex, cards, hands, decks };
  }, [actionIndex]);

  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board || !handRefresh || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const frame = board.parentElement!;
    const actorBoard = board.querySelector<HTMLElement>(`section[data-actor="${handRefresh.actor}"]`)!;
    const hand = actorBoard.querySelector<HTMLElement>("[data-replay-hand]")!;
    const deck = actorBoard.querySelector<HTMLElement>('[data-pile-face="Deck"]')!;
    const supporter = actorBoard.querySelector<HTMLElement>("[data-played-supporter] button")!;
    const drawnCards = [...hand.querySelectorAll<HTMLElement>("[data-hand-index]")];
    const snapshot = boardSnapshotRef.current;
    const oldHand = snapshot && snapshot.index + 1 === actionIndex ? snapshot.hands.get(handRefresh.actor) : undefined;
    const handRect = hand.getBoundingClientRect();
    const cardWidth = drawnCards[0]?.getBoundingClientRect().width ?? 54;
    const overlap = drawnCards[1] ? parseFloat(getComputedStyle(drawnCards[1]).marginLeft) : -16;
    const oldCount = handRefresh.returnedCount + 1;
    const fallbackSlots = Array.from({ length: oldCount }, (_, index) => ({
      rect: new DOMRect(handRect.left + (handRect.width - (cardWidth + (oldCount - 1) * (cardWidth + overlap))) / 2 + index * (cardWidth + overlap), drawnCards[0]?.getBoundingClientRect().top ?? handRect.top, cardWidth, cardWidth / 0.714),
      name: undefined as string | undefined,
    }));
    const slots = [...(oldHand?.slots ?? fallbackSlots)];
    const supporterIndex = Math.max(0, slots.findIndex((slot) => slot.name === handRefresh.card.name));
    const supporterOrigin = slots.splice(supporterIndex, 1)[0]?.rect;
    const animations: Animation[] = [];
    const fly = (element: HTMLElement, origin: DOMRect, destination: DOMRect, delay: number, disappear: boolean, id: string, reveal = false) => {
      const target = element.getBoundingClientRect();
      const animation = element.animate([
        { transform: `translate(${origin.left - target.left}px, ${origin.top - target.top}px) scale(${origin.width / target.width})`, opacity: reveal ? 0 : 1 },
        { opacity: 1, offset: 0.1 },
        { transform: `translate(${destination.left - target.left}px, ${destination.top - target.top}px) scale(${destination.width / target.width})`, opacity: 1, offset: 0.85 },
        { transform: `translate(${destination.left - target.left}px, ${destination.top - target.top}px) scale(${destination.width / target.width})`, opacity: disappear ? 0 : 1 },
      ], { id, delay, duration: 450, fill: "both", easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
      animation.onfinish = () => {
        if (disappear) element.style.visibility = "hidden";
        animation.cancel();
      };
      animations.push(animation);
    };
    if (supporterOrigin) fly(supporter, supporterOrigin, supporter.getBoundingClientRect(), 0, false, "replay-supporter-play");
    const frameRect = frame.getBoundingClientRect();
    const deckRect = deck.getBoundingClientRect();
    frame.querySelectorAll<HTMLElement>("[data-refresh-return]").forEach((card, index) => {
      const name = handRefresh.returned[index]?.name;
      const slotIndex = name ? slots.findIndex((slot) => slot.name === name) : -1;
      const origin = slots.splice(slotIndex >= 0 ? slotIndex : 0, 1)[0]?.rect;
      if (!origin) return;
      Object.assign(card.style, { visibility: "visible", left: `${origin.left - frameRect.left}px`, top: `${origin.top - frameRect.top}px`, width: `${origin.width}px`, height: `${origin.height}px` });
      fly(card, origin, deckRect, 400 + index * 60, true, "replay-hand-return");
    });
    const drawFlights = [...frame.querySelectorAll<HTMLElement>("[data-refresh-draw]")];
    drawnCards.forEach((card, index) => {
      const flight = drawFlights[index];
      if (!flight) return;
      const delay = handRefresh.drawStart + index * 90;
      Object.assign(flight.style, { visibility: "visible", left: `${deckRect.left - frameRect.left}px`, top: `${deckRect.top - frameRect.top}px`, width: `${deckRect.width}px`, height: `${deckRect.height}px` });
      // Flights live outside the scrollable hand; its cards only fade in on arrival.
      fly(flight, deckRect, card.getBoundingClientRect(), delay, true, "replay-hand-draw", true);
      const arrival = card.animate([{ opacity: 0 }, { opacity: 0, offset: 0.99 }, { opacity: 1 }],
        { id: "replay-hand-draw-arrival", duration: delay + 450, fill: "both" });
      arrival.onfinish = () => arrival.cancel();
      animations.push(arrival);
    });
    const cancel = () => {
      animations.forEach((animation) => animation.cancel());
      frame.querySelectorAll<HTMLElement>("[data-refresh-return], [data-refresh-draw]").forEach((card) => { card.style.visibility = "hidden"; });
    };
    window.addEventListener("resize", cancel);
    return () => { cancel(); window.removeEventListener("resize", cancel); };
  }, [actionIndex, handRefresh]);

  useLayoutEffect(() => {
    const board = boardRef.current;
    const side = board?.querySelector<HTMLElement>(`section[data-actor="${itemAction?.actor}"]`);
    const played = side?.querySelector<HTMLElement>("[data-played-item]");
    const face = played?.querySelector<HTMLElement>("button");
    const discard = side?.querySelector<HTMLElement>('[data-pile-face="Discard"]');
    if (!itemAction || !played || !face || !discard) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCompletedItemIndex(actionIndex);
      return;
    }
    const snapshot = boardSnapshotRef.current;
    const oldHand = snapshot?.index === actionIndex - 1 ? snapshot.hands.get(itemAction.actor) : undefined;
    const origin = oldHand?.slots.find((slot) => slot.name === itemAction.card.name)?.rect ?? oldHand?.slots[0]?.rect
      ?? side?.querySelector<HTMLElement>("[data-hand-index]")?.getBoundingClientRect();
    const target = face.getBoundingClientRect();
    const animations: Animation[] = [];
    if (origin && target.width) animations.push(face.animate([
      { transform: `translate(${origin.left - target.left}px, ${origin.top - target.top}px) scale(${Math.min(origin.width, 80) / target.width})` },
      { transform: "none" },
    ], { id: "replay-item-play", duration: 450, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }));
    const destination = discard.getBoundingClientRect();
    const finish = face.animate([
      { transform: "none", opacity: 1 },
      { transform: `translate(${destination.left - target.left}px, ${destination.top - target.top}px) scale(${destination.width / target.width})`, opacity: 1, offset: 0.85 },
      { transform: `translate(${destination.left - target.left}px, ${destination.top - target.top}px) scale(${destination.width / target.width})`, opacity: 0 },
    ], { id: "replay-item-discard", delay: itemAction.finish, duration: 450, fill: "forwards", easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
    finish.onfinish = () => setCompletedItemIndex(actionIndex);
    animations.push(finish);
    const cancel = () => animations.forEach((animation) => animation.cancel());
    const settle = () => { cancel(); setCompletedItemIndex(actionIndex); };
    window.addEventListener("resize", settle);
    return () => { cancel(); window.removeEventListener("resize", settle); };
  }, [actionIndex, itemAction]);

  useLayoutEffect(() => {
    const board = boardRef.current;
    const frame = board?.parentElement;
    if (!cardDraw) return;
    const completed = { index: actionIndex, flights: cardDraw.flights.map((_, index) => index) };
    const arrive = (index: number) => setArrivedFlights((progress) => ({ index: actionIndex,
      flights: [...new Set([...(progress?.index === actionIndex ? progress.flights : []), index])] }));
    if (!board || !frame || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setArrivedFlights(completed); return;
    }
    setArrivedFlights({ index: actionIndex, flights: [] });
    const side = board.querySelector<HTMLElement>(`section[data-actor="${cardDraw.actor}"]`);
    const pile = side?.querySelector<HTMLElement>(`[data-pile-face="${cardDraw.pile}"]`);
    const hand = side?.querySelector<HTMLElement>("[data-replay-hand]");
    if (!side || !pile || !hand) { setArrivedFlights(completed); return; }
    const pileOrigin = pile.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const snapshot = boardSnapshotRef.current;
    if ((cardDraw.kind === "retreat" || cardDraw.kind === "evolution") && snapshot?.index !== actionIndex - 1) {
      setArrivedFlights(completed); return;
    }
    const oldHands = new Map((["self", "opponent"] as const).map((actor) => [actor,
      [...(snapshot?.index === actionIndex - 1 ? snapshot.hands.get(actor)?.slots ?? [] : [])]]));
    if (itemAction) {
      const slots = oldHands.get(itemAction.actor)!;
      const index = slots.findIndex((slot) => slot.name === itemAction.card.name);
      slots.splice(Math.max(0, index), 1);
    }
    const activeRects = [...board.querySelectorAll<HTMLElement>(`.${styles.active}`)].map((element) => element.getBoundingClientRect());
    const centreY = activeRects.reduce((sum, rect) => sum + rect.top + rect.height / 2, 0) / activeRects.length;
    const animations: Animation[] = [];
    frame.querySelectorAll<HTMLElement>("[data-draw-flight]").forEach((flight, index) => {
      const entry = cardDraw.flights[index];
      const actor = entry.actor ?? cardDraw.actor;
      const actorSide = board.querySelector<HTMLElement>(`section[data-actor="${actor}"]`)!;
      const slots = [...actorSide.querySelectorAll<HTMLElement>("[data-hand-index]")];
      const oldSlots = oldHands.get(actor)!;
      const oldIndex = entry.card ? oldSlots.findIndex((slot) => slot.name === entry.card?.name) : -1;
      const boardOrigin = entry.sourceId ? snapshot?.cards.get(`${actor}:${entry.sourceId}`)?.rect : undefined;
      const origin = entry.pile === "Board" && boardOrigin ? new DOMRect(boardOrigin.left + 2, boardOrigin.top + 2, boardOrigin.width - 4, (boardOrigin.width - 4) * 1.4)
        : entry.pile === "Hand" ? oldSlots.splice(Math.max(0, oldIndex), 1)[0]?.rect
        ?? slots[0]?.getBoundingClientRect()
        : entry.pile ? actorSide.querySelector<HTMLElement>(`[data-pile-face="${entry.pile}"]`)?.getBoundingClientRect() : pileOrigin;
      if (!origin?.width) { arrive(index); return; }
      const revealScale = Math.min(180, board.clientWidth * (cardDraw.kind === "prize" ? 0.3 : 0.55)) / origin.width;
      const revealX = frameRect.left + frameRect.width / 2 - origin.width * revealScale / 2 - origin.left;
      const revealY = centreY - origin.height * revealScale / 2 - origin.top;
      const card = entry.card;
      const slot = card ? slots.find((element) => element.dataset.handCardId === card.id) : undefined;
      const handEntries = cardDraw.flights.filter((entry) => entry.destination === "hand" && (entry.actor ?? cardDraw.actor) === actor);
      const handIndex = handEntries.indexOf(entry);
      const destinationCard = entry.destination === "bench" || entry.destination === "attach"
        ? [...actorSide.querySelectorAll<HTMLElement>("[data-board-card]")].find((element) => element.dataset.boardCard === entry.targetId)
        : entry.destination === "discard" || entry.destination === "deck" ? actorSide.querySelector<HTMLElement>(`[data-pile-face="${entry.destination === "deck" ? "Deck" : "Discard"}"]`)
          : slot ?? slots[Math.max(0, slots.length - handEntries.length + handIndex)];
      const destination = (entry.destination === "attach" || entry.evolution
        ? destinationCard?.querySelector<HTMLElement>(`.${styles.cardArtworkFrame}`) : destinationCard)?.getBoundingClientRect();
      if (!destination || !origin.width) { arrive(index); return; }
      const reveal = entry.reveal;
      const delay = entry.delay;
      const duration = entry.evolution ? 700 : entry.pile === "Board" ? 650 : entry.destination === "attach" ? 850 : reveal ? 1900 : entry.pile === "Hand" ? 450 : 1000;
      const scale = entry.destination === "attach" ? 0.28 : destination.width / origin.width;
      const destinationX = entry.destination === "attach" ? destination.left + destination.width / 2 - origin.width * scale / 2 : destination.left;
      const destinationY = entry.destination === "attach" ? destination.bottom - origin.height * scale : destination.top;
      const finishTransform = `translate(${destinationX - origin.left}px, ${destinationY - origin.top}px) scale(${scale})`;
      Object.assign(flight.style, { visibility: "visible", left: `${origin.left - frameRect.left}px`, top: `${origin.top - frameRect.top}px`, width: `${origin.width}px`, height: `${origin.height}px` });
      const animation = flight.animate(reveal ? [
        { transform: "none", opacity: 1, offset: 0, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
        { transform: `translate(${revealX}px, ${revealY}px) scale(${revealScale})`, opacity: 1, offset: 0.24 },
        { transform: `translate(${revealX}px, ${revealY}px) scale(${revealScale})`, opacity: 1, offset: 0.76, easing: "cubic-bezier(0.4, 0, 0.2, 1)" },
        { transform: finishTransform, opacity: 1, offset: 1 },
      ] : entry.evolution ? [
        { transform: "none", opacity: 1, offset: 0 },
        { transform: `translate(${(destinationX - origin.left) * 0.6}px, ${(destinationY - origin.top) * 0.6 - 24}px) scale(${1 + (scale - 1) * 0.8}) rotate(-5deg)`, opacity: 1, offset: 0.65 },
        { transform: finishTransform, opacity: 1, offset: 1 },
      ] : entry.pile === "Board" ? [
        { transform: "none", opacity: 0, offset: 0 },
        { transform: `translate(0, -20px) rotate(${index % 2 ? 6 : -6}deg)`, opacity: 1, offset: 0.18 },
        { transform: finishTransform, opacity: 1, offset: 1 },
      ] : [{ transform: "none", opacity: 1 }, { transform: finishTransform, opacity: 1 }],
      { id: `replay-${cardDraw.kind}-to-${entry.destination}`, delay, duration, fill: "both", easing: reveal ? "linear" : "cubic-bezier(0.4, 0, 0.2, 1)" });
      animation.onfinish = () => { flight.style.visibility = "hidden"; animation.cancel(); arrive(index); };
      animations.push(animation);
      const flipper = flight.querySelector<HTMLElement>(`.${styles.prizeFlightFlipper}`);
      if (reveal && flipper) animations.push(flipper.animate([
        { transform: "perspective(700px) rotateY(180deg)" }, { transform: "perspective(700px) rotateY(0deg)" },
      ], { id: `replay-${cardDraw.kind}-reveal`, delay: delay + 300, duration: 350, fill: "forwards", easing: "ease-out" }));
      const arrivingCard = cardDraw.kind === "retreat" || entry.evolution || entry.destination === "attach" || entry.destination === "deck" ? null : entry.destination === "discard"
        ? card && state[actor].discard[0]?.id === card.id ? destinationCard?.querySelector<HTMLElement>("img") : null
        : destinationCard;
      if (arrivingCard) {
        const appear = arrivingCard.animate([{ opacity: 0 }, { opacity: 0, offset: 0.99 }, { opacity: 1 }],
          { delay: 0, duration: delay + duration, fill: "both" });
        appear.onfinish = () => appear.cancel();
        animations.push(appear);
      }
    });
    const activation = cardDraw.kind === "ability" ? abilityActivations.find((ability) => ability.actor === cardDraw.actor) : undefined;
    if (activation) {
      const source = [...side.querySelectorAll<HTMLElement>("[data-board-card]")].find((card) => card.dataset.boardCard === activation.cardId)?.querySelector<HTMLElement>(`.${styles.cardSurface}`);
      if (source) animations.push(source.animate([{ filter: "brightness(1)" }, { filter: "brightness(1.4)", offset: 0.35 }, { filter: "brightness(1)" }], { id: "replay-ability-activation", duration: 600, easing: "ease-out" }));
    }
    const cancel = () => {
      animations.forEach((animation) => animation.cancel());
      frame.querySelectorAll<HTMLElement>("[data-draw-flight]").forEach((flight) => { flight.style.visibility = "hidden"; });
    };
    const settle = () => { cancel(); setArrivedFlights(completed); };
    window.addEventListener("resize", settle);
    return () => { cancel(); window.removeEventListener("resize", settle); };
  }, [actionIndex, abilityActivations, cardDraw, itemAction, state]);

  useLayoutEffect(() => {
    if (!damageTransfer) return;
    const completed = { index: actionIndex, departed: damageTransfer.count, arrived: damageTransfer.count };
    const board = boardRef.current;
    const frame = board?.parentElement;
    const endpoint = (actor: ReplayActor, id: string) => [...(board?.querySelectorAll<HTMLElement>("[data-board-card]") ?? [])]
      .find((card) => card.dataset.boardCard === id && card.closest<HTMLElement>("[data-actor]")?.dataset.actor === actor)
      ?.querySelector<HTMLElement>(`.${styles.cardArtworkFrame}`);
    const source = endpoint(damageTransfer.source.actor, damageTransfer.source.id);
    const target = endpoint(damageTransfer.target.actor, damageTransfer.target.id);
    if (!frame || !source || !target || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCounterProgress(completed);
      return;
    }
    const frameRect = frame.getBoundingClientRect();
    const from = source.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    if (!from.width || !to.width) { setCounterProgress(completed); return; }
    setCounterProgress({ index: actionIndex, departed: 0, arrived: 0 });
    const counters = [...frame.querySelectorAll<HTMLElement>("[data-counter-flight]")];
    const animations: Animation[] = [];
    const timers: number[] = [];
    const origin = { x: from.right - 18, y: from.top + from.height * 0.28 };
    const destination = { x: to.right - 18, y: to.top + to.height * 0.28 };
    const x = destination.x - origin.x;
    const y = destination.y - origin.y;
    counters.forEach((counter, index) => {
      const delay = 300 + index * 180;
      Object.assign(counter.style, { visibility: "visible", left: `${origin.x - frameRect.left}px`, top: `${origin.y - frameRect.top}px` });
      const animation = counter.animate([
        { transform: "translate(-50%, -50%)", opacity: 0, offset: 0 },
        { transform: "translate(-50%, -50%) scale(1.1)", opacity: 1, offset: 0.08 },
        { transform: `translate(calc(-50% + ${x * 0.5}px), calc(-50% + ${y * 0.5 - 60}px)) scale(1.1)`, opacity: 1, offset: 0.5 },
        { transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`, opacity: 1, offset: 0.92 },
        { transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(0.7)`, opacity: 0, offset: 1 },
      ], { id: "replay-damage-counter-transfer", delay, duration: 850, easing: "linear", fill: "both" });
      timers.push(window.setTimeout(() => setCounterProgress((progress) => ({
        index: actionIndex, departed: Math.max(progress?.index === actionIndex ? progress.departed : 0, index + 1),
        arrived: progress?.index === actionIndex ? progress.arrived : 0,
      })), delay));
      animation.onfinish = () => {
        counter.style.visibility = "hidden";
        animation.cancel();
        setCounterProgress((progress) => ({
          index: actionIndex, departed: progress?.index === actionIndex ? progress.departed : damageTransfer.count,
          arrived: Math.max(progress?.index === actionIndex ? progress.arrived : 0, index + 1),
        }));
      };
      animations.push(animation);
    });
    const cancel = () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      animations.forEach((animation) => animation.cancel());
      counters.forEach((counter) => { counter.style.visibility = "hidden"; });
    };
    const settle = () => { cancel(); setCounterProgress(completed); };
    window.addEventListener("resize", settle);
    return () => { cancel(); window.removeEventListener("resize", settle); };
  }, [actionIndex, damageTransfer]);

  useLayoutEffect(() => {
    const board = boardRef.current;
    const snapshot = boardSnapshotRef.current;
    boardSnapshotRef.current = null;
    if (!board || !snapshot || snapshot.index + 1 !== actionIndex || currentEvent?.label === "KO" || handRefresh || abilityDraw || abilityAttachment || evolutionAction || itemAction?.handled) {
      setPendingAttackIndex(null);
      return;
    }
    let attackImpactTimer: number | undefined;
    const animations: Animation[] = [];
    const elevated: HTMLElement[] = [];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const bench = retreatAction && !reducedMotion
      ? board.querySelector<HTMLElement>(`section[data-actor="${retreatAction.actor}"] .${styles.bench}`) : null;
    const previousOverflow = bench?.style.overflow;
    if (bench) bench.style.overflow = "visible";
    const restoreBench = () => {
      if (bench) { if (previousOverflow) bench.style.overflow = previousOverflow; else bench.style.removeProperty("overflow"); }
    };
    // Attack transactions can also contain Bench counter placement, or start
    // with an Ability such as Festival Lead. Only the actual attack stage
    // drives the collision, and its destination is the defending Active Spot.
    const attack = currentEvent?.label === "Attack"
      ? currentEvent.transaction?.stages.find((stage) => stage.kind === "attack" && stage.actor === currentEvent.actor)
      : undefined;
    if (attack && currentEvent?.actor) {
      const defender = currentEvent.actor === "self" ? "opponent" : "self";
      const attackerStack = board.querySelector<HTMLElement>(`[data-actor="${currentEvent.actor}"] .${styles.active} [data-board-card]`);
      const defenderStack = board.querySelector<HTMLElement>(`[data-actor="${defender}"] .${styles.active} [data-board-card]`);
      const attackerFace = attackerStack?.querySelector<HTMLElement>(`.${styles.cardSurface}`);
      const defenderFace = defenderStack?.querySelector<HTMLElement>(`.${styles.cardSurface}`);
      const directDamage = currentEvent.transaction?.stages.filter((stage) => stage.kind === "damage" && stage.actor === defender) ?? [];
      const targetsActive = directDamage.length === 0 || directDamage.some((stage) => stage.cards.some((card) => card.id === defenderStack?.dataset.boardCard));
      if (attackerStack && attackerFace && defenderFace && targetsActive && attack.cards.some((card) => card.id === attackerStack.dataset.boardCard)) {
        const source = attackerFace.getBoundingClientRect();
        const target = defenderFace.getBoundingClientRect();
        const direction = target.top < source.top ? -1 : 1;
        const x = target.left + target.width / 2 - source.left - source.width / 2;
        // Overlap the near edges slightly: the card strikes its opponent rather
        // than covering it. The holder, HP and attachments travel together.
        const y = target.top + target.height / 2 - source.top - source.height / 2
          - direction * ((source.height + target.height) / 2 - Math.min(source.height, target.height) * 0.22);
        if (source.width && target.width) {
          if (!reducedMotion) attackImpactTimer = window.setTimeout(() => setPendingAttackIndex(null), ATTACK_IMPACT_MS);
          attackerStack.style.zIndex = "50";
          elevated.push(attackerStack);
          const lunge = attackerFace.animate(reducedMotion ? [
            { opacity: 1 }, { opacity: 0.65 }, { opacity: 1 },
          ] : [
            { transform: "none", filter: "brightness(1)", offset: 0, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
            { transform: `translate(0, ${-direction * 23}px) rotate(${-direction * 5}deg) scale(1.045)`, filter: "brightness(1.08)", offset: 0.22, easing: "cubic-bezier(0.55, 0, 1, 0.55)" },
            { transform: `translate(${x}px, ${y}px) rotate(0deg) scale(1.02)`, filter: "brightness(1.2)", offset: 0.42 },
            { transform: `translate(${x}px, ${y}px) rotate(0deg) scale(1.02)`, filter: "brightness(1.08)", offset: 0.49, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
            { transform: `translate(0, ${-direction * 4}px) rotate(${-direction}deg) scale(0.99)`, filter: "brightness(1)", offset: 0.86, easing: "ease-out" },
            { transform: "none", filter: "brightness(1)", offset: 1 },
          ], { id: "replay-attack-lunge", delay: 900, duration: reducedMotion ? 180 : 700, easing: "linear" });
          lunge.onfinish = () => attackerStack.style.removeProperty("z-index");
          animations.push(lunge);
          animations.push(defenderFace.animate(reducedMotion ? [
            { opacity: 1 }, { opacity: 0.65 }, { opacity: 1 },
          ] : [
            { transform: "none", filter: "brightness(1.35)", offset: 0, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
            { transform: `translate(0, ${direction * 26}px) rotate(${direction * 4}deg) scale(0.975)`, filter: "brightness(1.12)", offset: 0.2, easing: "ease-out" },
            { transform: `translate(-3px, ${direction * 8}px) rotate(${-direction * 1.5}deg)`, filter: "brightness(1)", offset: 0.46 },
            { transform: `translate(2px, ${direction * 3}px) rotate(${direction * 0.5}deg)`, filter: "brightness(1)", offset: 0.68 },
            { transform: "none", filter: "brightness(1)", offset: 1 },
          ], { id: "replay-attack-impact", delay: reducedMotion ? 900 : ATTACK_IMPACT_MS, duration: reducedMotion ? 180 : 430, easing: "ease-out" }));
          const impact = attackImpactRef.current;
          if (impact && !reducedMotion) {
            const frame = board.parentElement!.getBoundingClientRect();
            const size = Math.min(150, target.width * 1.5);
            const contactY = direction < 0 ? target.bottom - target.height * 0.11 : target.top + target.height * 0.11;
            Object.assign(impact.style, { visibility: "visible", left: `${target.left + target.width / 2 - frame.left - size / 2}px`, top: `${contactY - frame.top - size / 2}px`, width: `${size}px`, height: `${size}px` });
            const burst = impact.animate([
              { opacity: 0, transform: "scale(0.35)", offset: 0 },
              { opacity: 0.95, transform: "scale(0.8)", offset: 0.16, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
              { opacity: 0.5, transform: "scale(1.12)", offset: 0.48 },
              { opacity: 0, transform: "scale(1.35)", offset: 1 },
            ], { id: "replay-attack-burst", delay: ATTACK_IMPACT_MS, duration: 380, fill: "both", easing: "ease-out" });
            burst.onfinish = () => { impact.style.visibility = "hidden"; burst.cancel(); };
            animations.push(burst);
          }
        }
      }
    }
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
      const animation = card.animate(keyframes, { delay: !reducedMotion && actor === retreatAction?.actor ? retreatAction.moveDelay : 0, fill: "backwards", duration: reducedMotion ? 140 : 500, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
      animation.onfinish = () => { card.style.removeProperty("z-index"); card.style.removeProperty("transform-origin"); restoreBench(); };
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
    if (attackImpactTimer === undefined) setPendingAttackIndex(null);
    const cancel = () => {
      if (attackImpactTimer !== undefined) window.clearTimeout(attackImpactTimer);
      if (ghost) ghost.style.visibility = "hidden";
      if (attackImpactRef.current) attackImpactRef.current.style.visibility = "hidden";
      for (const animation of animations) animation.cancel();
      for (const card of elevated) { card.style.removeProperty("z-index"); card.style.removeProperty("transform-origin"); }
      restoreBench();
    };
    const settle = () => { cancel(); setPendingAttackIndex(null); };
    window.addEventListener("resize", settle);
    return () => { cancel(); window.removeEventListener("resize", settle); };
  }, [actionIndex, abilityAttachment, abilityDraw, currentEvent, evolutionAction, handRefresh, itemAction, movingOnBoard, retreatAction, routineAction]);

  const advanceTo = useCallback((nextIndex: number) => {
    captureBoard();
    setCompletedItemIndex(null);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nextAttack = replayEvents[nextIndex - 1]?.label === "Attack" && replayEvents[nextIndex - 1]?.transaction?.stages.some((stage) => stage.kind === "attack");
    setPendingAttackIndex(nextIndex === actionIndex + 1 && nextAttack && !reducedMotion ? nextIndex : null);
    const reveal = nextIndex === finalSetupIndex && nextIndex === actionIndex + 1 && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setOpeningRevealPending(reveal);
    setAnimateOpeningReveal(reveal);
    setActionIndex(nextIndex);
  }, [actionIndex, captureBoard, finalSetupIndex, replayEvents]);

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
    setPreviewPileIndex(card.initialPileIndex ?? 0);
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
      <p className={styles.artNote}>Reconstructed from the saved Battle Log. Hidden cards stay face down.</p>
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
        <div className={styles.boardFrame} data-replay-board-frame data-transaction={popupTransaction && !inlineTransaction || undefined}>
          <div className={styles.board} ref={boardRef}>
            <PlayerBoard openingRevealed={openingRevealed} instantReveal={!atOpeningReveal || !animateOpeningReveal} controls={playbackControls} coinPhase={coinPhase} actor="opponent" abilities={abilityActivations} attackDamagePending={pendingAttackIndex === actionIndex} playedSupporter={handRefresh?.actor === "opponent" ? handRefresh.card : undefined} playedItem={itemAction?.actor === "opponent" && completedItemIndex !== actionIndex ? itemAction.card : undefined} currentEvent={currentEvent} onInspectDiscard={inspectDiscard} onPreview={previewCard} previousSide={previousState.opponent} side={boardState.opponent} stadium={state.stadium} />
            {attackAnnouncement ? <div aria-hidden="true" className={styles.attackAnnouncementAnchor}>
              <div key={`${program.id}-${actionIndex}`} className={styles.attackAnnouncement}>
                <span>{currentEvent?.actor === "self" ? "Your attack" : "Opponent’s attack"}</span>
                <strong>{attackAnnouncement.label}</strong>
              </div>
            </div> : null}
            {coinToss || resultOnlyCoinFlip ? <div className={styles.boardCoinToss} role="status" aria-label={coinPhase === "call" && coinToss
              ? `${coinToss.caller === "self" ? "You call" : "Opponent calls"} ${coinToss.choice}`
              : coinPhase === "toss" ? "Tossing the coin"
                : coinToss?.winner ? `${coinToss.result}. ${coinToss.winner === "self" ? "You won" : "Opponent won"} the toss.`
                  : resultOnlyCoinFlip ? `${resultOnlyCoinFlip.result}. ${resultOnlyCoinFlip.actor === "self" ? "Your" : "Opponent’s"} coin flip.` : "Coin flip."}>
              {coinPhase !== "call" ? <div aria-hidden="true" className={styles.replayCoin} data-phase={coinPhase}>
                <div className={styles.coinRotor} data-result={coinFlipResult}>
                  <span className={styles.coinMetalFace} data-side="heads" />
                  <span className={styles.coinMetalFace} data-side="tails" />
                </div>
              </div> : null}
            </div> : null}
            {routineAction || handRefresh || abilityDraw || itemAction || atOpeningReveal ? <div className={styles.boardRoutineAnnouncement} aria-hidden="true" key={actionIndex}>
              <span>{atOpeningReveal ? "Setup complete" : (routineAction ?? handRefresh ?? abilityDraw ?? itemAction)?.actor === "self" ? "Your action" : "Opponent action"}</span>
              <strong>{atOpeningReveal ? "Opening Pokémon revealed" : currentEvent?.summary}</strong>
            </div> : null}
            <PlayerBoard openingRevealed={openingRevealed} instantReveal={!atOpeningReveal || !animateOpeningReveal} coinPhase={coinPhase} actor="self" abilities={abilityActivations} attackDamagePending={pendingAttackIndex === actionIndex} playedSupporter={handRefresh?.actor === "self" ? handRefresh.card : undefined} playedItem={itemAction?.actor === "self" && completedItemIndex !== actionIndex ? itemAction.card : undefined} currentEvent={currentEvent} onInspectDiscard={inspectDiscard} onPreview={previewCard} previousSide={previousState.self} side={boardState.self} stadium={state.stadium} />
          </div>
          <div className={styles.boardCardFlight} ref={boardGhostRef} aria-hidden="true" data-board-flight={routineAction?.kind}>
            {routineAction?.card ? <CardArtwork card={routineAction.card} alt="" sizes="100px" /> : <div className={styles.cardBack} />}
          </div>
          {deckShuffles.map((shuffle, sequence) => <div aria-hidden="true" data-deck-shuffle={sequence} data-shuffle-actor={shuffle.actor} key={`${actionIndex}-shuffle-${sequence}`}>
            {Array.from({ length: 8 }, (_, index) => <div className={styles.boardShuffleCard} data-shuffle-card={index} key={index}><div className={styles.cardBack} /></div>)}
          </div>)}
          <div className={styles.attackImpactBurst} ref={attackImpactRef} aria-hidden="true" data-attack-burst>
            <svg viewBox="-64 -64 128 128" fill="none">
              <path d="M-18-20-39-44M18-20 39-44M-23 0H-55M23 0H55M-18 20-39 44M18 20 39 44M0-27V-55M0 27V55" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              <path d="m-33-10-15-5m81 5 15-5m-81 25-15 5m81-5 15 5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.6" />
              <path d="m0-24 5 17 18-6-14 14 15 10-19-4-5 17-5-17-19 4 15-10-14-14 18 6Z" fill="currentColor" />
            </svg>
          </div>
          {handRefresh ? Array.from({ length: handRefresh.returnedCount }, (_, index) => <div className={styles.boardRefreshFlight} data-refresh-return={index} key={`${actionIndex}-return-${index}`} aria-hidden="true">
            {handRefresh.actor === "self" && handRefresh.returned[index] ? <CardArtwork card={handRefresh.returned[index]} alt="" sizes="80px" eager /> : <div className={styles.cardBack} />}
          </div>) : null}
          {handRefresh ? Array.from({ length: handRefresh.drawnCount }, (_, index) => <div className={styles.boardRefreshFlight} data-refresh-draw={index} key={`${actionIndex}-refresh-draw-${index}`} aria-hidden="true">
            {handRefresh.actor === "self" && state.self.knownHand[index] ? <CardArtwork card={state.self.knownHand[index]} alt="" sizes="80px" eager /> : <div className={styles.cardBack} />}
          </div>) : null}
          {damageTransfer ? Array.from({ length: damageTransfer.count }, (_, index) => <span className={`${styles.damageBadge} ${styles.boardDamageFlight}`} data-counter-flight={index} key={`${actionIndex}-counter-${index}`} aria-hidden="true">10</span>) : null}
          {cardDraw ? cardDraw.flights.map((entry, index) => <div className={styles.boardPrizeFlight} data-draw-flight={index} data-draw-kind={cardDraw.kind} data-draw-actor={entry.actor ?? cardDraw.actor} data-draw-destination={entry.destination} key={`${actionIndex}-draw-${index}`} aria-hidden="true">
            {entry.reveal && entry.card ? <div className={styles.prizeFlightFlipper}>
              <div className={styles.prizeFlightFront}><CardArtwork card={entry.card} alt="" sizes="180px" eager /></div>
              <div className={styles.prizeFlightBack}><div className={styles.cardBack} /></div>
            </div> : entry.faceUp && entry.card ? <CardArtwork card={entry.card} alt="" sizes="100px" eager /> : <div className={styles.cardBack} />}
          </div>) : null}
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
                {inspectedDiscardSide?.discardCount != null ? `${inspectedDiscardSide.discardCount} ${inspectedDiscardSide.discardCount === 1 ? "card" : "cards"} · ` : ""}Newest first
              </SheetDescription>
            </SheetHeader>
            <ol className={styles.discardList}>
              {(inspectedDiscard
                ? state[inspectedDiscard].discard
                : []
              ).map((discardedCard, index) => (
                <li key={discardedCard.id}>
                  <button aria-label={`Preview ${discardedCard.name}`} className={`${styles.discardCardImage} ${styles.cardPreviewTrigger}`} onClick={() => previewCard(discardedCard)} type="button">
                    <CardArtwork card={discardedCard} alt={`${discardedCard.name}, card artwork`} sizes="(max-width: 44rem) 76px, 88px" />
                  </button>
                  <div>
                    <strong>{discardedCard.name}</strong>
                    <span>{index === 0 ? "Newest discard" : `#${index + 1}`}</span>
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
            <DialogTitle className="sr-only">{previewPileCard?.name}</DialogTitle>
            <DialogDescription className="sr-only">Enlarged card preview</DialogDescription>
            {previewPileCard ? <div aria-label="Card preview details" className={styles.cardPreviewStage} data-pile={previewPile.length > 1 || undefined} role="region" tabIndex={0} onKeyDown={(event) => {
              if (previewPile.length < 2 || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
              event.preventDefault();
              cyclePreviewPile(event.key === "ArrowLeft" ? -1 : 1);
            }}>
              <div className={styles.previewPileStack} aria-label={`${previewPile.length} cards in pile`}>
                {previewPile.map((card, index) => {
                  const offset = index - previewPileIndex;
                  const depth = Math.abs(offset);
                  return <div key={card.id} className={styles.previewPileCard} data-selected={depth === 0 || undefined}
                    aria-hidden={depth !== 0} style={{ "--pile-depth": Math.min(depth, 2), "--pile-offset": offset, zIndex: previewPile.length - depth } as React.CSSProperties}>
                    <div className={styles.cardPreviewImage}>
                      <CardArtwork card={card} alt={`${card.name}, enlarged card artwork`} sizes="(max-width: 640px) 66vw, 400px" eager />
                      {index === 0 && card.damageKnown !== false && card.damage ? <span aria-label={`${card.damage} damage`} className={styles.cardPreviewDamage} data-digits={String(card.damage).length}>{card.damage}</span> : null}
                    </div>
                  </div>;
                })}
              </div>
              {previewPile.length > 1 ? <div className={styles.previewPileControls}>
                <Button variant="secondary" size="icon" aria-label="Previous card in pile" disabled={previewPileIndex === 0} onClick={() => cyclePreviewPile(-1)}><ChevronLeftIcon aria-hidden="true" className="size-7" /></Button>
                <span className="sr-only" aria-live="polite">{previewPileCard.name}, card {previewPileIndex + 1} of {previewPile.length}</span>
                <Button variant="secondary" size="icon" aria-label="Next card in pile" disabled={previewPileIndex === previewPile.length - 1} onClick={() => cyclePreviewPile(1)}><ChevronRightIcon aria-hidden="true" className="size-7" /></Button>
              </div> : null}
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
