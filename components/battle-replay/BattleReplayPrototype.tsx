"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  TriangleIcon,
  TrophyIcon,
} from "lucide-react";
import { Button } from "@/components/shadcn/button";
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
  type ReplayZoneCard,
} from "@/lib/battle-replay/prototype";
import { replayPilots } from "@/lib/battle-replay/pilots";
import {
  resolveBoardCardPreview,
  resolveEnergyMarkers,
  resolveOpeningCoinToss,
  resolveOpeningTurnChoice,
  resolveResultOnlyCoinFlip,
  resolveTransactionActors,
  resolveTransactionStage,
  shouldShowTransactionEvolutionStack,
} from "@/lib/battle-replay/preview";
import styles from "./battle-replay.module.css";

type PreviewCard = ReplayZoneCard & {
  abilityUsed?: boolean;
  conditions?: ReplayCard["conditions"];
  damage?: number;
  energy?: string[];
  hp?: number;
  underlying?: ReplayZoneCard[];
  tool?: string;
};

function AbilityUsedMarker({ className }: { className: string }) {
  return (
    <span aria-label="Ability used this turn" className={className}>
      <TriangleIcon aria-hidden="true" />
    </span>
  );
}

const energySymbolTypes = new Set(["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "metal", "fairy", "dragon", "colorless"]);

function EnergyOrbs({ energy, className }: { energy: string[]; className: string }) {
  const markers = resolveEnergyMarkers(energy);
  return <div aria-label={`${energy.length} Energy attached: ${energy.join(", ")}`} className={`${styles.energyOrbs} ${className}`}>
    {markers.map(({ count, type }, index) => <span className={styles.energyOrb} key={`${type}-${index}`} title={count ? `${count} Energy attached` : `${type} Energy`}>
      {energySymbolTypes.has(type.toLowerCase()) ? <Image alt="" width={64} height={64} src={`/images/battle-replay/energy/${type.toLowerCase()}.svg`} /> : <span aria-hidden="true">?</span>}
      {count ? <strong aria-hidden="true" className={styles.energyOrbCount}>{count}</strong> : null}
    </span>)}
  </div>;
}

function ConditionMarkers({ conditions }: { conditions?: ReplayCard["conditions"] }) {
  if (!conditions?.length) return null;
  return <div className={styles.conditionMarkers}>
    {conditions.map((condition) => <span key={condition} aria-label={condition} title={condition} className={styles.conditionMarker} data-condition={condition}>
      {condition === "Asleep" ? <span aria-hidden="true">Zzz</span> : <Image alt="" width={41} height={41} src={`/images/battle-replay/conditions/${condition.toLowerCase()}.png`} />}
    </span>)}
  </div>;
}

function CardFace({
  card,
  attackName,
  damageTaken = 0,
  knockedOut = false,
  effectKey,
  compact = false,
  faceDown = false,
  motion,
  onPreview,
}: {
  card: ReplayCard;
  attackName?: string;
  damageTaken?: number;
  knockedOut?: boolean;
  effectKey?: string;
  compact?: boolean;
  faceDown?: boolean;
  motion?: "bench" | "evolve" | "promote" | "retreat";
  onPreview: (card: PreviewCard) => void;
}) {
  const stackRef = useRef<HTMLDivElement>(null);
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
  const remainingHp = Math.max(0, card.hp - card.damage);
  const healthPercent = Math.round((remainingHp / card.hp) * 100);
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
      data-compact={compact || undefined}
      data-motion={motion}
      data-knocked-out={knockedOut || undefined}
      data-face-down={faceDown || undefined}
      data-has-energy={card.energy.length > 0 || undefined}
    >
      {knockedOut ? <span key={`ko-${effectKey}`} className={styles.knockoutStamp} role="status" aria-label={`${card.name} was Knocked Out`}>KO</span> : null}
      {attackName ? <div key={`attack-${effectKey}`} className={styles.boardAttack} role="status"><span className={styles.attackPulse} aria-hidden="true" /><strong>{attackName}</strong></div> : null}
      {damageTaken > 0 ? <span key={`damage-${effectKey}`} className={styles.attackDamage} role="status" aria-label={`${card.name} took ${damageTaken} damage`}>−{damageTaken}</span> : null}
      <div className={styles.cardSurface}>
      <button
        aria-label={faceDown ? "Face-down Pokémon" : `Preview ${card.name}${card.abilityUsed ? ", ability used this turn" : ""}`}
        disabled={faceDown}
        className={`${styles.cardFace} ${styles.cardPreviewTrigger}`}
        onClick={() => onPreview(card)}
        type="button"
      >
        <span className={styles.cardFlipper}>
          <span aria-hidden={faceDown} className={styles.cardFront}>
            {card.imageUrl ? <Image quality={95}
              alt={`${card.name}, format-legal representative card artwork`}
              fill
              sizes={compact ? "80px" : "144px"}
              src={card.imageUrl}
            /> : <div aria-hidden="true" className={styles.cardBack} />}
            {card.damage > 0 ? (
              <span
                aria-label={`${card.damage} damage`}
                className={styles.damageBadge}
              >
                {card.damage}
              </span>
            ) : null}
            {card.abilityUsed ? (
              <AbilityUsedMarker className={styles.boardAbilityUsedMarker} />
            ) : null}
          </span>
          <span aria-hidden="true" className={styles.cardReverse}><span className={styles.cardBack} /></span>
        </span>
      </button>
      {!faceDown ? <ConditionMarkers conditions={card.conditions} /> : null}
      {card.energy.length > 0 && !faceDown ? <EnergyOrbs energy={card.energy} className={styles.boardEnergyOrbs} /> : null}
      </div>
      <div aria-hidden={faceDown} className={styles.healthStatus} data-tone={healthTone}>
        <div
          aria-label={`${card.name}: ${remainingHp} of ${card.hp} HP remaining`}
          aria-valuemax={card.hp}
          aria-valuemin={0}
          aria-valuenow={remainingHp}
          className={styles.healthTrack}
          role="meter"
        >
          <span style={{ transform: `scaleX(${healthPercent / 100})` }} />
        </div>
        <strong>{remainingHp} HP</strong>
      </div>
    </div>
  );
}

function PileFace({ card, hidden }: { card?: ReplayZoneCard; hidden?: boolean }) {
  if (card?.imageUrl) {
    return <Image quality={95} alt="" fill sizes="72px" src={card.imageUrl} />;
  }

  if (hidden) return <div aria-hidden="true" className={styles.cardBack} />;

  return (
    <div className={styles.emptyPile}>
      {card ? <span>{card.name}</span> : null}
    </div>
  );
}

function Pile({
  animate,
  count,
  label,
  onInspect,
  topCard,
}: {
  animate?: boolean;
  count: number;
  label: string;
  onInspect?: () => void;
  topCard?: ReplayZoneCard;
}) {
  const pileContents = (
    <>
      <div className={styles.pileCards} data-pile-face={label} data-empty={count === 0 || undefined} data-new-card={animate || undefined} key={topCard?.id ?? label}>
        <PileFace card={topCard} hidden={label === "Deck" && count > 0} />
      </div>
      <span>{label}</span>
      <strong>{count}</strong>
    </>
  );

  if (!onInspect) {
    return (
      <div aria-label={`${count} cards in ${label.toLowerCase()}`} className={styles.pile}>
        {pileContents}
      </div>
    );
  }

  return (
    <button
      aria-label={`View ${label.toLowerCase()}, ${count} ${count === 1 ? "card" : "cards"}`}
      className={styles.pile}
      disabled={count === 0}
      onClick={onInspect}
      type="button"
    >
      {pileContents}
    </button>
  );
}

function PrizeTrack({ remaining }: { remaining: number }) {
  return (
    <div
      aria-label={`${remaining} Prize cards remaining`}
      className={styles.prizes}
    >
      <strong>Prizes</strong>
      {Array.from({ length: 6 }).map((_, index) => (
        <span data-remaining={index < remaining || undefined} key={index} />
      ))}
    </div>
  );
}

function HandFan({ actor, onPreview, side }: { actor: ReplayActor; onPreview: (card: PreviewCard) => void; side: ReplaySide }) {
  const visibleCardCount = side.handCount;
  return (
    <div
      aria-label={
        actor === "self"
          ? `${side.handCount} cards in your hand`
          : `${side.handCount} cards in the opponent's hidden hand`
      }
      className={styles.handArea}
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
              key={knownCard?.id ?? `hidden-${index}`}
            >
              {knownCard?.imageUrl ? (
                <button aria-label={`Preview ${knownCard.name}`} className={styles.cardPreviewTrigger} onClick={() => onPreview(knownCard)} type="button">
                  <Image quality={95} alt={`${knownCard.name}, card in hand`} fill sizes="80px" src={knownCard.imageUrl} />
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
      <button aria-label={`Preview ${stadium.name}`} className={`${styles.stadium} ${styles.cardPreviewTrigger}`} onClick={() => onPreview({ id: "stadium", name: stadium.name, imageUrl: stadium.imageUrl })} type="button">
        {stadium.imageUrl ? <Image quality={95}
          alt={`${stadium.name}, format-legal representative card artwork`}
          fill
          sizes="(max-width: 40rem) 56px, 80px"
          src={stadium.imageUrl}
        /> : <div aria-hidden="true" className={styles.cardBack} />}
      </button>
      <strong className={styles.stadiumName}>{stadium.name}</strong>
    </div>
  );
}

function TransactionCards({ actor, onPreview, previousState, stage, state }: { actor: ReplayActor; onPreview: (card: PreviewCard) => void; previousState: ReplayState; stage: ReplayTransactionStage; state: ReplayState }) {
  const hiddenCardCount = Math.max(0, Math.floor(stage.hiddenCount ?? 0));
  return <div className={styles.transactionCards} data-many={stage.cards.length > 4 || undefined}>
    {stage.cards.map((card) => {
      const boardCard = resolveBoardCardPreview(card, stage, actor, state, previousState);
      const hasBoardState = boardCard.hp !== undefined;
      return <div className={styles.transactionCardState} data-stateful={hasBoardState || undefined} key={card.id}>
        {shouldShowTransactionEvolutionStack(stage, boardCard) ? <div aria-label={`Evolution stack: ${boardCard.underlying?.map((item) => item.name).join(", ")}`} className={styles.transactionEvolutionStack}>
          {(boardCard.underlying ?? []).map((item) => <span key={item.id}>
            {item.imageUrl ? <Image quality={95} alt="" fill sizes="82px" src={item.imageUrl} /> : <div aria-hidden="true" className={styles.cardBack} />}
          </span>)}
        </div> : null}
        <button aria-label={`Preview ${card.name}${boardCard.abilityUsed ? ", ability used this turn" : ""}`} className={`${styles.transactionCard} ${styles.cardPreviewTrigger}`} onClick={() => onPreview(boardCard)} type="button">
          {card.imageUrl ? <Image quality={95} alt={`${card.name}, format-legal representative card artwork`} fill sizes="112px" src={card.imageUrl} /> : <div aria-hidden="true" className={styles.cardBack} />}
        </button>
        <ConditionMarkers conditions={boardCard.conditions} />
        {boardCard.damage ? <span aria-label={`${boardCard.damage} damage`} className={styles.transactionDamageCounter}>{boardCard.damage}</span> : null}
        {boardCard.abilityUsed ? <AbilityUsedMarker className={styles.transactionAbilityUsedMarker} /> : null}
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
    <p>Source-evidenced movement · format-legal representative art</p>
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
}: {
  actor: ReplayActor;
  coinPhase: CoinFlipPhase;
  currentEvent: ReplayEvent | null;
  onInspectDiscard: (actor: ReplayActor) => void;
  onPreview: (card: PreviewCard) => void;
  previousSide: ReplaySide;
  side: ReplaySide;
  stadium: ReplayState["stadium"];
}) {
  const coinToss = resolveOpeningCoinToss(currentEvent);
  const turnChoice = resolveOpeningTurnChoice(currentEvent);
  const faceDown = !currentEvent || currentEvent.turn === 0;
  const isCurrentActor = currentEvent?.actor === actor;
  const isKnockout = currentEvent?.label === "KO";
  const currentCards = [side.active, ...side.bench].filter((card): card is ReplayCard => Boolean(card));
  const knockedOutIds = new Set(isKnockout
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
  const damageTaken = (card: ReplayCard, previous?: ReplayCard | null) => isAttack && previous ? Math.max(0, card.damage - previous.damage) : 0;
  const benchCapacity = Math.min(8, Math.max(5, displayBench.length));

  return (
    <section className={styles.playerBoard} data-actor={actor}>
      <header className={styles.playerHeader}>
        <div className={styles.playerIdentity}>
          <span>{actor === "self" ? "You" : "Opponent"}</span>
          <strong>{side.name}</strong>
        </div>
        {side.itemLocked ? <span className={styles.itemLockBadge}>Item lock</span> : null}
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
                <CardFace attackName={attackName} damageTaken={damageTaken(displayActive, previousActive)} knockedOut={knockedOutIds.has(displayActive.id)} effectKey={currentEvent?.sourceTitle} card={displayActive} faceDown={faceDown} motion={activeMotion} onPreview={onPreview} />
              ) : (
                <span aria-hidden="true" className={styles.emptyZone} />
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
                  <CardFace knockedOut={knockedOutIds.has(benchCard.id)} damageTaken={damageTaken(benchCard, previousCard)} effectKey={currentEvent?.sourceTitle} card={benchCard} compact faceDown={faceDown} motion={motion} onPreview={onPreview} />
                ) : null}
              </div>
            );})}
          </div>
        </div>

        <div className={styles.zonePiles}>
          <Pile count={side.deckCount} label="Deck" />
          <Pile
            animate={side.discard[0]?.id !== previousSide.discard[0]?.id}
            count={side.discard.length}
            label="Discard"
            onInspect={() => onInspectDiscard(actor)}
            topCard={side.discard[0]}
          />
        </div>
      </div>
      <HandFan actor={actor} onPreview={onPreview} side={side} />
    </section>
  );
}

export function BattleReplayPrototype({
  initialActionIndex = 0,
  initialPilotId = replayPilots[0].id,
}: {
  initialActionIndex?: number;
  initialPilotId?: string;
}) {
  const initialPilot = replayPilots.find((pilot) => pilot.id === initialPilotId) ?? replayPilots[0];
  const [pilotId, setPilotId] = useState(initialPilot.id);
  const [actionIndex, setActionIndex] = useState(() =>
    Math.max(0, Math.min(initialPilot.frames.length - 1, initialActionIndex)),
  );
  const [previewedCard, setPreviewedCard] = useState<PreviewCard | null>(null);
  const [inspectedDiscard, setInspectedDiscard] =
    useState<ReplayActor | null>(null);
  const [playing, setPlaying] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const activePilot = replayPilots.find((pilot) => pilot.id === pilotId) ?? replayPilots[0];
  const replayEvents = activePilot.events;
  const replayFrames = activePilot.frames;
  const replaySource = activePilot.source;
  const state = replayFrames[actionIndex];
  const previousState = replayFrames[Math.max(0, actionIndex - 1)];
  const currentEvent = actionIndex > 0 ? replayEvents[actionIndex - 1] : null;
  const coinToss = resolveOpeningCoinToss(currentEvent);
  const resultOnlyCoinFlip = resolveResultOnlyCoinFlip(currentEvent);
  const coinFlipResult = coinToss?.result ?? resultOnlyCoinFlip?.result ?? null;
  const coinPhase = useCoinFlipPhase(currentEvent);
  const autoplayDelay = currentEvent?.label === "KO" ? 2000 : currentEvent?.label === "Attack" ? 2400 : coinToss ? 4400 : resultOnlyCoinFlip ? 2800 : resolveOpeningTurnChoice(currentEvent) ? 2400 : currentEvent?.transaction && currentEvent.transaction.stages.length > 1 ? 1900 : 1100;
  const maxIndex = replayFrames.length - 1;
  const previewHealthPercent = previewedCard?.hp
    ? Math.max(0, ((previewedCard.hp - (previewedCard.damage ?? 0)) / previewedCard.hp) * 100)
    : 100;
  const previewHealthTone = previewHealthPercent <= 24
    ? "critical"
    : previewHealthPercent <= 75
      ? "warning"
      : "healthy";
  const turnStops = replayEvents.reduce<Array<{ turn: number; index: number }>>(
    (stops, event, index) => {
      if (stops.at(-1)?.turn !== event.turn)
        stops.push({ turn: event.turn, index: index + 1 });
      return stops;
    },
    [],
  );
  const previousTurnIndex = turnStops
    .map((stop) => stop.index)
    .filter((index) => index < actionIndex)
    .at(-1);
  const nextTurnIndex = turnStops.find(
    (stop) => stop.index > actionIndex,
  )?.index;

  useEffect(() => {
    if (!playing) return;
    if (actionIndex >= maxIndex) {
      setPlaying(false);
      return;
    }

    const timer = window.setTimeout(
      () => setActionIndex((value) => Math.min(maxIndex, value + 1)),
      autoplayDelay,
    );
    return () => window.clearTimeout(timer);
  }, [actionIndex, autoplayDelay, maxIndex, playing]);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("pilot", pilotId);
    url.searchParams.set("position", String(actionIndex));
    window.history.replaceState(window.history.state, "", url);
  }, [actionIndex, pilotId]);

  function seek(nextIndex: number, revealBoard = false) {
    setPlaying(false);
    setActionIndex(Math.max(0, Math.min(maxIndex, nextIndex)));
    if (revealBoard && window.matchMedia("(max-width: 68rem)").matches) {
      window.requestAnimationFrame(() =>
        stageRef.current?.scrollIntoView({ block: "start" }),
      );
    }
  }

  function seekTurn(direction: -1 | 1) {
    const next = direction < 0 ? previousTurnIndex : nextTurnIndex;
    if (typeof next === "number") seek(next);
  }

  function previewCard(card: PreviewCard) {
    setPlaying(false);
    setPreviewedCard(card);
  }

  function inspectDiscard(actor: ReplayActor) {
    setPlaying(false);
    setInspectedDiscard(actor);
  }

  function selectPilot(nextPilotId: string) {
    setPilotId(nextPilotId);
    setActionIndex(0);
    setPlaying(false);
    setPreviewedCard(null);
    setInspectedDiscard(null);
  }

  return (
    <div className={styles.prototype}>
      <section aria-label="Replay pilot selection" className={styles.pilotBar}>
        <div>
          <strong>Replay pilot</strong>
          <span>Switch between two real saved Battle Logs.</span>
        </div>
        <div aria-label="Choose Battle Log" className={styles.pilotChoices} role="group">
          {replayPilots.map((pilot) => (
            <button
              aria-pressed={pilot.id === activePilot.id}
              key={pilot.id}
              onClick={() => selectPilot(pilot.id)}
              type="button"
            >
              {pilot.label}
            </button>
          ))}
        </div>
      </section>

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
            <h2>Match timeline</h2>
            <p>
              Saved today · {replaySource.format} · {replaySource.turns} turns ·{" "}
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

        <ol className={styles.timeline}>
          {replayEvents.map((event, index) => {
            const step = index + 1;
            const selected = step === actionIndex;
            return (
              <li key={`${event.turn}-${event.label}-${index}`}>
                <button
                  aria-current={selected ? "step" : undefined}
                  className={styles.timelineAction}
                  data-actor={event.actor}
                  data-selected={selected || undefined}
                  onClick={() => seek(step, true)}
                  type="button"
                >
                  <span>
                    {event.turn === 0 ? "Setup" : `Turn ${event.turn}`}
                  </span>
                  <strong>{event.label}</strong>
                  <p>{event.summary}</p>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div className={styles.replayStage} ref={stageRef}>
        <div className={styles.boardFrame} data-transaction={currentEvent?.transaction && currentEvent.label !== "Attack" && currentEvent.label !== "KO" ? true : undefined}>
          <div className={styles.board}>
            <PlayerBoard coinPhase={coinPhase} actor="opponent" currentEvent={currentEvent} onInspectDiscard={inspectDiscard} onPreview={previewCard} previousSide={previousState.opponent} side={state.opponent} stadium={state.stadium} />
            {currentEvent?.label === "Attack" ? <div aria-hidden="true" className={styles.attackAnnouncementAnchor}>
              <div key={`${pilotId}-${actionIndex}`} className={styles.attackAnnouncement}>
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
            <PlayerBoard coinPhase={coinPhase} actor="self" currentEvent={currentEvent} onInspectDiscard={inspectDiscard} onPreview={previewCard} previousSide={previousState.self} side={state.self} stadium={state.stadium} />
          </div>
          {currentEvent?.transaction && currentEvent.label !== "Attack" && currentEvent.label !== "KO" ? <TransactionOverlay onPreview={previewCard} previousState={previousState} state={state} transaction={currentEvent.transaction} /> : null}
        </div>

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



        <Sheet
          onOpenChange={(open) => {
            if (!open) setInspectedDiscard(null);
          }}
          open={inspectedDiscard !== null}
        >
          <SheetContent className={styles.discardSheet} side="bottom">
            <SheetHeader className={styles.discardSheetHeader}>
              <SheetTitle>
                {inspectedDiscard === "self" ? "Your" : "Opponent's"} discard
                pile
              </SheetTitle>
              <SheetDescription>
                {(inspectedDiscard ? state[inspectedDiscard].discard.length : 0)}{" "}
                cards · newest first
              </SheetDescription>
            </SheetHeader>
            <ol className={styles.discardList}>
              {(inspectedDiscard
                ? state[inspectedDiscard].discard
                : []
              ).map((discardedCard, index) => (
                <li key={discardedCard.id}>
                  <button aria-label={`Preview ${discardedCard.name}`} className={`${styles.discardCardImage} ${styles.cardPreviewTrigger}`} onClick={() => previewCard(discardedCard)} type="button">
                    {discardedCard.imageUrl ? (
                      <Image quality={95}
                        alt={`${discardedCard.name}, format-legal representative card artwork`}
                        fill
                        sizes="(max-width: 44rem) 76px, 88px"
                        src={discardedCard.imageUrl}
                      />
                    ) : (
                      <div aria-hidden="true" className={styles.cardBack} />
                    )}
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
          <AppDialogContent className={styles.cardPreviewDialog} size="compact">
            <DialogTitle className="sr-only">{previewedCard?.name}</DialogTitle>
            <DialogDescription className="sr-only">Enlarged card preview</DialogDescription>
            {previewedCard ? <div className={styles.cardPreviewStage}>
              <div className={styles.cardPreviewImage}>
                {previewedCard.imageUrl ? <Image quality={95} alt={`${previewedCard.name}, enlarged card preview`} fill sizes="340px" src={previewedCard.imageUrl} /> : <div aria-hidden="true" className={styles.cardBack} />}
                <ConditionMarkers conditions={previewedCard.conditions} />
                {previewedCard.damage ? <span aria-label={`${previewedCard.damage} damage`} className={styles.cardPreviewDamage}>{previewedCard.damage}</span> : null}
                {previewedCard.abilityUsed ? <AbilityUsedMarker className={styles.previewAbilityUsedMarker} /> : null}
                {previewedCard.tool ? <span className={styles.cardPreviewTool}>Tool · {previewedCard.tool}</span> : null}
                {previewedCard.energy?.length ? <EnergyOrbs energy={previewedCard.energy} className={styles.previewEnergyOrbs} /> : null}
              </div>
              {previewedCard.hp ? <div className={styles.cardPreviewHealth} data-tone={previewHealthTone}>
                <div aria-label={`${Math.max(0, previewedCard.hp - (previewedCard.damage ?? 0))} of ${previewedCard.hp} HP remaining`} aria-valuemax={previewedCard.hp} aria-valuemin={0} aria-valuenow={Math.max(0, previewedCard.hp - (previewedCard.damage ?? 0))} role="progressbar">
                  <span style={{ width: `${Math.max(0, ((previewedCard.hp - (previewedCard.damage ?? 0)) / previewedCard.hp) * 100)}%` }} />
                </div>
                <strong>{Math.max(0, previewedCard.hp - (previewedCard.damage ?? 0))} / {previewedCard.hp} HP</strong>
              </div> : null}
            </div> : null}
          </AppDialogContent>
        </Dialog>
      </div>
      </div>
    </div>
  );
}
