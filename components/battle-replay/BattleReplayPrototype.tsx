"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon
} from "lucide-react";
import { Button } from "@/components/shadcn/button";
import {
  replayEvents,
  replayFrames,
  type ReplayActor,
  type ReplayCard,
  type ReplaySide
} from "@/lib/battle-replay/prototype";
import styles from "./battle-replay.module.css";

function CardFace({ card, compact = false }: { card: ReplayCard; compact?: boolean }) {
  const remainingHp = Math.max(0, card.hp - card.damage);

  return (
    <div className={styles.cardFace} data-compact={compact || undefined}>
      <Image alt={`${card.name}, representative card artwork`} fill sizes={compact ? "68px" : "104px"} src={card.imageUrl} />
      <div className={styles.cardHealth}>
        <span>{card.name}</span>
        <strong>{remainingHp} HP</strong>
      </div>
      {card.energy.length > 0 ? (
        <span aria-label={`${card.energy.length} Energy attached`} className={styles.energyBadge}>
          {card.energy.length} EN
        </span>
      ) : null}
      {card.damage > 0 ? (
        <span aria-label={`${card.damage} damage`} className={styles.damageBadge}>
          {card.damage}
        </span>
      ) : null}
    </div>
  );
}

function Pile({ count, label, topImage }: { count: number; label: string; topImage?: string }) {
  return (
    <div className={styles.pile}>
      <div className={styles.pileCards}>
        {topImage ? (
          <Image alt="" fill sizes="54px" src={topImage} />
        ) : (
          <div aria-hidden="true" className={styles.cardBack} />
        )}
      </div>
      <span>{label}</span>
      <strong>{count}</strong>
    </div>
  );
}

function PrizeTrack({ remaining }: { remaining: number }) {
  return (
    <div aria-label={`${remaining} Prize cards remaining`} className={styles.prizes}>
      {Array.from({ length: 6 }).map((_, index) => (
        <span data-remaining={index < remaining || undefined} key={index} />
      ))}
    </div>
  );
}

function PlayerBoard({ actor, side }: { actor: ReplayActor; side: ReplaySide }) {
  return (
    <section className={styles.playerBoard} data-actor={actor}>
      <header className={styles.playerHeader}>
        <div>
          <span>{actor === "self" ? "You" : "Opponent"}</span>
          <strong>{side.name}</strong>
        </div>
        <PrizeTrack remaining={side.prizesRemaining} />
      </header>

      <div className={styles.playArea}>
        <div className={styles.zonePiles}>
          <Pile count={side.deckCount} label="Deck" />
          <Pile
            count={side.discard.length}
            label="Discard"
            topImage={side.discard[0]?.imageUrl}
          />
        </div>

        <div className={styles.field}>
          <div className={styles.bench} aria-label={`${side.name} Bench`}>
            {side.bench.length > 0 ? (
              side.bench.map((card) => <CardFace card={card} compact key={card.id} />)
            ) : (
              <span className={styles.emptyZone}>Bench</span>
            )}
          </div>
          <div className={styles.active} aria-label={`${side.name} Active Spot`}>
            {side.active ? <CardFace card={side.active} /> : <span className={styles.emptyZone}>Active</span>}
          </div>
        </div>

        <div className={styles.hand} aria-label={`${side.handCount} cards in hand`}>
          <div aria-hidden="true" className={styles.handFan}>
            {Array.from({ length: Math.min(side.handCount, 5) }).map((_, index) => (
              <span key={index} style={{ transform: `translateX(${index * 6}px) rotate(${(index - 2) * 3}deg)` }} />
            ))}
          </div>
          <span>Hand</span>
          <strong>{side.handCount}</strong>
        </div>
      </div>
    </section>
  );
}

export function BattleReplayPrototype() {
  const [actionIndex, setActionIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const state = replayFrames[actionIndex];
  const currentEvent = actionIndex > 0 ? replayEvents[actionIndex - 1] : null;
  const maxIndex = replayFrames.length - 1;
  const turnStops = useMemo(() => replayEvents.reduce<Array<{ turn: number; index: number }>>(
    (stops, event, index) => {
      if (stops.at(-1)?.turn !== event.turn) stops.push({ turn: event.turn, index: index + 1 });
      return stops;
    },
    []
  ), []);
  const previousTurnIndex = turnStops.map((stop) => stop.index).filter((index) => index < actionIndex).at(-1);
  const nextTurnIndex = turnStops.find((stop) => stop.index > actionIndex)?.index;

  useEffect(() => {
    if (!playing) return;
    if (actionIndex >= maxIndex) {
      setPlaying(false);
      return;
    }

    const timer = window.setTimeout(() => setActionIndex((value) => Math.min(maxIndex, value + 1)), 1100);
    return () => window.clearTimeout(timer);
  }, [actionIndex, maxIndex, playing]);

  function seek(nextIndex: number, revealBoard = false) {
    setPlaying(false);
    setActionIndex(Math.max(0, Math.min(maxIndex, nextIndex)));
    if (revealBoard && window.matchMedia("(max-width: 68rem)").matches) {
      window.requestAnimationFrame(() => stageRef.current?.scrollIntoView({ block: "start" }));
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
            <p>Synthetic prototype · 3 turns · {replayEvents.length} actions</p>
          </div>
          <Button aria-label="Restart replay" className={styles.iconControl} onClick={() => seek(0)} size="icon-sm" variant="ghost">
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
                  <span>{event.turn === 0 ? "Setup" : `Turn ${event.turn}`}</span>
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
          <PlayerBoard actor="opponent" side={state.opponent} />
          <div className={styles.boardMiddle}>
            <span>Stadium</span>
            {state.stadium ? (
              <div className={styles.stadium}>
                <Image alt="Jamming Tower, representative card artwork" fill sizes="62px" src={state.stadium.imageUrl} />
                <strong>{state.stadium.name}</strong>
              </div>
            ) : (
              <span className={styles.emptyStadium}>No Stadium in play</span>
            )}
          </div>
          <PlayerBoard actor="self" side={state.self} />
        </div>

        <div className={styles.currentAction} aria-live="polite">
          <span>{currentEvent ? (currentEvent.turn === 0 ? "Setup" : `Turn ${currentEvent.turn}`) : "Before setup"}</span>
          <strong>{currentEvent?.summary ?? "Ready to replay the imported battle."}</strong>
        </div>

        <div className={styles.scrubber}>
          <label htmlFor="replay-position">
            <span>Replay position</span>
            <strong>{actionIndex} / {maxIndex}</strong>
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
          <div aria-label="Action controls" className={styles.controlGroup} role="group">
            <Button aria-label="Previous action" className={styles.iconControl} disabled={actionIndex === 0} onClick={() => seek(actionIndex - 1)} size="icon" variant="outline">
              <ChevronLeftIcon />
            </Button>
            <span>Action</span>
            <Button aria-label="Next action" className={styles.iconControl} disabled={actionIndex === maxIndex} onClick={() => seek(actionIndex + 1)} size="icon" variant="outline">
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
          <div aria-label="Turn controls" className={styles.controlGroup} role="group">
            <Button aria-label="Previous turn" className={styles.iconControl} disabled={previousTurnIndex === undefined} onClick={() => seekTurn(-1)} size="icon" variant="outline">
              <ChevronLeftIcon />
            </Button>
            <span>Turn</span>
            <Button aria-label="Next turn" className={styles.iconControl} disabled={nextTurnIndex === undefined} onClick={() => seekTurn(1)} size="icon" variant="outline">
              <ChevronRightIcon />
            </Button>
          </div>
        </div>

        <p className={styles.artNote}>
          Card artwork is representative for this prototype. A production replay would use the linked Deck List for exact self-side prints and mark opponent art as representative.
        </p>
      </div>
    </div>
  );
}
