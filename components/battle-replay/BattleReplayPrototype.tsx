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
  type ReplayZoneCard,
} from "@/lib/battle-replay/prototype";
import styles from "./battle-replay.module.css";

function CardFace({
  card,
  compact = false,
}: {
  card: ReplayCard;
  compact?: boolean;
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
      <div className={styles.cardFace}>
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
      </div>
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
    return <Image alt="" fill sizes="54px" src={card.imageUrl} />;
  }

  if (hidden) return <div aria-hidden="true" className={styles.cardBack} />;

  return (
    <div className={styles.emptyPile}>
      {card ? <span>{card.name}</span> : null}
    </div>
  );
}

function Pile({
  count,
  label,
  onInspect,
  topCard,
}: {
  count: number;
  label: string;
  onInspect?: () => void;
  topCard?: ReplayZoneCard;
}) {
  const pileContents = (
    <>
      <div className={styles.pileCards} data-empty={count === 0 || undefined}>
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

function HandFan({ actor, side }: { actor: ReplayActor; side: ReplaySide }) {
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
                <Image
                  alt={`${knownCard.name}, card in hand`}
                  fill
                  sizes="42px"
                  src={knownCard.imageUrl}
                />
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
  stadium,
}: {
  actor: ReplayActor;
  stadium: ReplayState["stadium"];
}) {
  if (!stadium || stadium.actor !== actor) return null;

  return (
    <div className={styles.stadiumSpot}>
      <span>Stadium</span>
      <div className={styles.stadium}>
        <Image
          alt={`${stadium.name}, format-legal representative card artwork`}
          fill
          sizes="62px"
          src={stadium.imageUrl}
        />
        <strong>{stadium.name}</strong>
      </div>
    </div>
  );
}

function ResolvingCardSpot({
  actor,
  resolvingCard,
}: {
  actor: ReplayActor;
  resolvingCard: ReplayState["resolvingCard"];
}) {
  if (!resolvingCard || resolvingCard.actor !== actor) return null;

  return (
    <div
      aria-label={`${resolvingCard.card.name} was played`}
      className={styles.resolvingCardSpot}
    >
      <span>Played</span>
      <div className={styles.resolvingCard}>
        <Image
          alt={`${resolvingCard.card.name}, card played for this action`}
          fill
          sizes="54px"
          src={resolvingCard.card.imageUrl}
        />
      </div>
    </div>
  );
}

function PlayerBoard({
  actor,
  onInspectDiscard,
  resolvingCard,
  side,
  stadium,
}: {
  actor: ReplayActor;
  onInspectDiscard: (actor: ReplayActor) => void;
  resolvingCard: ReplayState["resolvingCard"];
  side: ReplaySide;
  stadium: ReplayState["stadium"];
}) {
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
            <ResolvingCardSpot actor={actor} resolvingCard={resolvingCard} />
            <div
              className={styles.active}
              aria-label={`${side.name} Active Spot`}
            >
              <span className={styles.zoneLabel}>Active</span>
              {side.active ? (
                <CardFace card={side.active} />
              ) : (
                <span className={styles.emptyZone}>Active</span>
              )}
            </div>
            <StadiumSpot actor={actor} stadium={stadium} />
          </div>
          <div className={styles.bench} aria-label={`${side.name} Bench`}>
            <span className={styles.zoneLabel}>Bench</span>
            {Array.from({ length: 5 }).map((_, index) => (
              <div className={styles.benchSlot} key={index}>
                {side.bench[index] ? (
                  <CardFace card={side.bench[index]} compact />
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className={styles.zonePiles}>
          <Pile count={side.deckCount} label="Deck" />
          <Pile
            count={side.discard.length}
            label="Discard"
            onInspect={() => onInspectDiscard(actor)}
            topCard={side.discard[0]}
          />
        </div>
      </div>
      <HandFan actor={actor} side={side} />
    </section>
  );
}

export function BattleReplayPrototype() {
  const [actionIndex, setActionIndex] = useState(0);
  const [inspectedDiscard, setInspectedDiscard] =
    useState<ReplayActor | null>(null);
  const [playing, setPlaying] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const state = replayFrames[actionIndex];
  const currentEvent = actionIndex > 0 ? replayEvents[actionIndex - 1] : null;
  const maxIndex = replayFrames.length - 1;
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
      1100,
    );
    return () => window.clearTimeout(timer);
  }, [actionIndex, maxIndex, playing]);

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
        <div className={styles.board}>
          <PlayerBoard
            actor="opponent"
            onInspectDiscard={setInspectedDiscard}
            resolvingCard={state.resolvingCard}
            side={state.opponent}
            stadium={state.stadium}
          />
          <PlayerBoard
            actor="self"
            onInspectDiscard={setInspectedDiscard}
            resolvingCard={state.resolvingCard}
            side={state.self}
            stadium={state.stadium}
          />
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
                  <div className={styles.discardCardImage}>
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
                  </div>
                  <div>
                    <strong>{discardedCard.name}</strong>
                    <span>{index === 0 ? "Newest discard" : `#${index + 1}`}</span>
                  </div>
                </li>
              ))}
            </ol>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
