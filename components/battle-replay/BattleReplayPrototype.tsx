"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
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
  replayEvents,
  replayEnergyImages,
  replayFrames,
  replaySource,
  type ReplayActor,
  type ReplayCard,
  type ReplayState,
  type ReplaySide,
  type ReplayTransaction,
  type ReplayTransactionStage,
  type ReplayZoneCard,
} from "@/lib/battle-replay/prototype";
import {
  resolveBoardCardPreview,
  resolveTransactionActors,
  resolveTransactionStage,
  shouldShowTransactionEvolutionStack,
} from "@/lib/battle-replay/preview";
import styles from "./battle-replay.module.css";

type PreviewCard = ReplayZoneCard & {
  damage?: number;
  energy?: string[];
  hp?: number;
  underlying?: ReplayZoneCard[];
  tool?: string;
};

function CardFace({
  card,
  compact = false,
  motion,
  onPreview,
}: {
  card: ReplayCard;
  compact?: boolean;
  motion?: "bench" | "evolve" | "promote" | "retreat";
  onPreview: (card: PreviewCard) => void;
}) {
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
      className={styles.cardStack}
      data-compact={compact || undefined}
      data-motion={motion}
    >
      {card.energy.length > 0 ? (
        <div
          aria-label={`${card.energy.length} Energy attached to ${card.name}: ${card.energy.join(", ")}`}
          className={styles.attachedEnergyStack}
        >
          {card.energy.map((energy, index) => (
            <div
              className={styles.attachedEnergyCard}
              key={`${energy}-${index}`}
              style={{ top: `${8 + index * 18}%` }}
            >
              <Image
                alt=""
                fill
                sizes={compact ? "34px" : "54px"}
                src={replayEnergyImages[energy]}
              />
            </div>
          ))}
        </div>
      ) : null}
      <button
        aria-label={`Preview ${card.name}`}
        className={`${styles.cardFace} ${styles.cardPreviewTrigger}`}
        onClick={() => onPreview(card)}
        type="button"
      >
        <Image
          alt={`${card.name}, format-legal representative card artwork`}
          fill
          sizes={compact ? "68px" : "104px"}
          src={card.imageUrl}
        />
        {card.damage > 0 ? (
          <span
            aria-label={`${card.damage} damage`}
            className={styles.damageBadge}
          >
            {card.damage}
          </span>
        ) : null}
      </button>
      <div className={styles.healthStatus} data-tone={healthTone}>
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
    return <Image alt="" fill sizes="72px" src={card.imageUrl} />;
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
      <div className={styles.pileCards} data-empty={count === 0 || undefined} data-new-card={animate || undefined} key={topCard?.id ?? label}>
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
                  <Image alt={`${knownCard.name}, card in hand`} fill sizes="42px" src={knownCard.imageUrl} />
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
        <Image
          alt={`${stadium.name}, format-legal representative card artwork`}
          fill
          sizes="62px"
          src={stadium.imageUrl}
        />
        <strong>{stadium.name}</strong>
      </button>
    </div>
  );
}

function TransactionCards({ actor, onPreview, previousState, stage, state }: { actor: ReplayActor; onPreview: (card: PreviewCard) => void; previousState: ReplayState; stage: ReplayTransactionStage; state: ReplayState }) {
  const hiddenCardCount = Math.max(0, Math.floor(stage.hiddenCount ?? 0));
  return <div className={styles.transactionCards}>
    {stage.coinFace ? <div aria-label={`Coin flip result: ${stage.coinFace}`} className={styles.replayCoin} data-face={stage.coinFace}>
      <span>{stage.coinFace}</span>
    </div> : null}
    {stage.cards.map((card) => {
      const boardCard = resolveBoardCardPreview(card, stage, actor, state, previousState);
      const hasBoardState = boardCard.hp !== undefined;
      return <div className={styles.transactionCardState} data-stateful={hasBoardState || undefined} key={card.id}>
        {shouldShowTransactionEvolutionStack(stage, boardCard) ? <div aria-label={`Evolution stack: ${boardCard.underlying?.map((item) => item.name).join(", ")}`} className={styles.transactionEvolutionStack}>
          {(boardCard.underlying ?? []).map((item) => <span key={item.id}>
            <Image alt="" fill sizes="82px" src={item.imageUrl} />
          </span>)}
        </div> : null}
        <button aria-label={`Preview ${card.name}`} className={`${styles.transactionCard} ${styles.cardPreviewTrigger}`} onClick={() => onPreview(boardCard)} type="button">
          <Image alt={`${card.name}, format-legal representative card artwork`} fill sizes="112px" src={card.imageUrl} />
        </button>
        {boardCard.damage ? <span aria-label={`${boardCard.damage} damage`} className={styles.transactionDamageCounter}>{boardCard.damage}</span> : null}
        {boardCard.energy?.length ? <div aria-label={`${boardCard.energy.length} Energy attached: ${boardCard.energy.join(", ")}`} className={styles.transactionEnergyStack}>
          {boardCard.energy.map((energy, index) => replayEnergyImages[energy] ? <span key={`${energy}-${index}`}>
            <Image alt="" fill sizes="28px" src={replayEnergyImages[energy]} />
          </span> : null)}
        </div> : null}
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
          {stage.detail ? <small>{stage.detail}</small> : null}
        </div>
      </li>;
    })}</ol>
    <p>Source-evidenced movement · format-legal representative art</p>
  </section>;
}

function PlayerBoard({
  actor,
  currentEvent,
  onInspectDiscard,
  onPreview,
  previousSide,
  side,
  stadium,
}: {
  actor: ReplayActor;
  currentEvent: (typeof replayEvents)[number] | null;
  onInspectDiscard: (actor: ReplayActor) => void;
  onPreview: (card: PreviewCard) => void;
  previousSide: ReplaySide;
  side: ReplaySide;
  stadium: ReplayState["stadium"];
}) {
  const isCurrentActor = currentEvent?.actor === actor;
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
  const benchCapacity = Math.min(8, Math.max(5, side.bench.length));

  return (
    <section className={styles.playerBoard} data-actor={actor}>
      <header className={styles.playerHeader}>
        <div className={styles.playerIdentity}>
          <span>{actor === "self" ? "You" : "Opponent"}</span>
          <strong>{side.name}</strong>
        </div>
      </header>

      <div className={styles.playArea}>
        <PrizeTrack remaining={side.prizesRemaining} />

        <div className={styles.field}>
          <div className={styles.activeRow}>
            <div
              aria-label={`${side.name} Active Spot`}
              className={styles.active}
              data-populated={side.active ? true : undefined}
            >
              <span className={styles.zoneLabel}>Active</span>
              {side.active ? (
                <CardFace card={side.active} motion={activeMotion} onPreview={onPreview} />
              ) : (
                <span className={styles.emptyZone}>Active</span>
              )}
            </div>
            <StadiumSpot actor={actor} onPreview={onPreview} stadium={stadium} />
          </div>
          <div className={styles.bench} aria-label={`${side.name} Bench`} data-capacity={benchCapacity}>
            <span className={styles.zoneLabel}>Bench</span>
            {Array.from({ length: benchCapacity }).map((_, index) => {
              const benchCard = side.bench[index];
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
                  <CardFace card={benchCard} compact motion={motion} onPreview={onPreview} />
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

export function BattleReplayPrototype() {
  const [actionIndex, setActionIndex] = useState(0);
  const [previewedCard, setPreviewedCard] = useState<PreviewCard | null>(null);
  const [inspectedDiscard, setInspectedDiscard] =
    useState<ReplayActor | null>(null);
  const [playing, setPlaying] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const state = replayFrames[actionIndex];
  const previousState = replayFrames[Math.max(0, actionIndex - 1)];
  const currentEvent = actionIndex > 0 ? replayEvents[actionIndex - 1] : null;
  const autoplayDelay = currentEvent?.transaction && currentEvent.transaction.stages.length > 1 ? 1900 : 1100;
  const maxIndex = replayFrames.length - 1;
  const previewHealthPercent = previewedCard?.hp
    ? Math.max(0, ((previewedCard.hp - (previewedCard.damage ?? 0)) / previewedCard.hp) * 100)
    : 100;
  const previewHealthTone = previewHealthPercent <= 24
    ? "critical"
    : previewHealthPercent <= 75
      ? "warning"
      : "healthy";
  const turnStops = useMemo(
    () =>
      replayEvents.reduce<Array<{ turn: number; index: number }>>(
        (stops, event, index) => {
          if (stops.at(-1)?.turn !== event.turn)
            stops.push({ turn: event.turn, index: index + 1 });
          return stops;
        },
        [],
      ),
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

  return (
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
        <div className={styles.boardFrame} data-transaction={currentEvent?.transaction ? true : undefined}>
          <div className={styles.board}>
            <PlayerBoard actor="opponent" currentEvent={currentEvent} onInspectDiscard={setInspectedDiscard} onPreview={previewCard} previousSide={previousState.opponent} side={state.opponent} stadium={state.stadium} />
            <PlayerBoard actor="self" currentEvent={currentEvent} onInspectDiscard={setInspectedDiscard} onPreview={previewCard} previousSide={previousState.self} side={state.self} stadium={state.stadium} />
          </div>
          {currentEvent?.transaction ? <TransactionOverlay onPreview={previewCard} previousState={previousState} state={state} transaction={currentEvent.transaction} /> : null}
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
            {currentEvent?.summary ?? "Ready to replay the imported battle."}
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

        <p className={styles.artNote}>
          Actions and outcome come from saved Battle Log{" "}
          {replaySource.logId.slice(0, 8)}…. Player names are anonymised. Card
          candidates are restricted to prints legal in {replaySource.format};
          where the log cannot prove an exact printing, a legal representative
          is shown. Deck, hand and discard totals are reconstructed from the
          logged draws, searches, shuffles and card movements.
        </p>

        <Sheet
          onOpenChange={(open) => {
            if (!open) setInspectedDiscard(null);
          }}
          open={inspectedDiscard !== null}
        >
          <SheetContent className={styles.discardSheet} side="right">
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
                      <Image
                        alt={`${discardedCard.name}, format-legal representative card artwork`}
                        fill
                        sizes="74px"
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
                <Image alt={`${previewedCard.name}, enlarged card preview`} fill sizes="340px" src={previewedCard.imageUrl} />
                {previewedCard.damage ? <span aria-label={`${previewedCard.damage} damage`} className={styles.cardPreviewDamage}>{previewedCard.damage}</span> : null}
                {previewedCard.tool ? <span className={styles.cardPreviewTool}>Tool · {previewedCard.tool}</span> : null}
              </div>
              {previewedCard.energy?.length ? <div aria-label={`${previewedCard.energy.length} Energy attached: ${previewedCard.energy.join(", ")}`} className={styles.cardPreviewEnergy}>
                {previewedCard.energy.map((energy, index) => replayEnergyImages[energy] ? <span key={`${energy}-${index}`}>
                  <Image alt="" fill sizes="58px" src={replayEnergyImages[energy]} />
                </span> : null)}
              </div> : null}
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
  );
}
