"use client";

import Image from "next/image";
import { startTransition, useEffect, useMemo, useState } from "react";
import { Textarea } from "@/components/shadcn/textarea";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CopyDeckListButton } from "@/components/ui/CopyDeckListButton";
import { DeckListVisualGrid } from "@/components/ui/DeckListVisualGrid";
import { StatCard } from "@/components/ui/StatCard";
import {
  analyzeDecklist,
  getPokemonSpriteUrl,
  pct,
  type CalculatorAnalysis,
  type CalculatorCardGroup
} from "@/lib/probability-calculator";
import { findPokemonOptionBySlug, prettifyPokemonSlug, resolvePokemonSpriteSlug } from "@/lib/pokemon/sprites";
import { usePokemonOptions } from "@/lib/pokemon/use-pokemon-options";
import type { PokemonOption } from "@/types/index";

type TabId = "setup" | "prizing";
type ComparisonMetric = {
  label: string;
  value: string;
};

const LEGACY_SAMPLE_DECKLIST = `Pokémon: 15
3 Munkidori ASC 99
2 Mega Absol ex MEG 86
2 Mega Kangaskhan ex MEG 104
2 Cornerstone Mask Ogerpon ex TWM 112
1 Bloodmoon Ursaluna ex TWM 141
1 Psyduck ASC 39
1 Fezandipiti ex ASC 142
1 Latias ex SSP 76
1 Pecharunt ex SFA 39
1 Yveltal MEG 88
Trainer: 35
4 Boss's Orders MEG 114
4 Arven OBF 186
3 Lillie's Determination MEG 119
3 Penny SVI 183
2 Iono PAL 185
2 Earthen Vessel PAR 163
2 Pokégear 3.0 SVI 186
2 Energy Switch MEG 115
2 Night Stretcher ASC 196
2 Nest Ball SVI 181
2 Counter Catcher PAR 160
1 Precious Trolley SSP 185
2 Bravery Charm PAL 173
2 Technical Machine: Turbo Energize PAR 179
2 Lively Stadium SSP 180
Energy: 10
6 Darkness Energy MEE 7
2 Fighting Energy MEE 6
2 Mist Energy TEF 161`;

export function ProbabilityCalculator() {
  const [deckInput, setDeckInput] = useState("");
  const [analysis, setAnalysis] = useState<CalculatorAnalysis | null>(null);
  const [deckVisualCards, setDeckVisualCards] = useState<CalculatorAnalysis["cards"]>([]);
  const pokemonOptions = usePokemonOptions(Boolean(analysis));
  const [activeTab, setActiveTab] = useState<TabId>("setup");
  const [statusMessage, setStatusMessage] = useState("");
  const [statusTone, setStatusTone] = useState<"info" | "warn">("info");

  const showStatus = Boolean(statusMessage) || Boolean(analysis?.warnings.length) || Boolean(analysis);
  const statusClassName = [
    "h-[9.5rem] overflow-y-auto rounded-xl border p-4",
    analysis?.warnings.length || statusTone === "warn"
      ? "border-[var(--color-loss-border)] bg-[var(--color-loss-bg)]"
      : "border-primary/15 bg-primary/5"
  ].join(" ");

  const setupCards = analysis?.setupRows ?? [];
  const prizingCards = analysis?.prizingRows ?? [];
  const cardOrder = useMemo(() => {
    return new Map(deckVisualCards.map((card, index) => [`${card.name}-${card.category}`, index]));
  }, [deckVisualCards]);
  const setupComparisonRows = useMemo(
    () =>
      [...setupCards].sort((left, right) => {
        const leftOrder = cardOrder.get(`${left.card.name}-${left.card.category}`) ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = cardOrder.get(`${right.card.name}-${right.card.category}`) ?? Number.MAX_SAFE_INTEGER;

        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }

        return left.card.name.localeCompare(right.card.name);
      }),
    [cardOrder, setupCards]
  );
  const prizingComparisonRows = useMemo(
    () =>
      [...prizingCards].sort((left, right) => {
        const leftOrder = cardOrder.get(`${left.card.name}-${left.card.category}`) ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = cardOrder.get(`${right.card.name}-${right.card.category}`) ?? Number.MAX_SAFE_INTEGER;

        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }

        return left.card.name.localeCompare(right.card.name);
      }),
    [cardOrder, prizingCards]
  );
  const summary = useMemo(() => {
    if (!analysis) {
      return {
        mulligan: "--",
        oneBasic: "--",
        twoBasics: "--"
      };
    }

    return {
      mulligan: pct(analysis.mulliganProbability),
      oneBasic: pct(analysis.exactlyOneBasicProbability),
      twoBasics: pct(analysis.twoOrMoreBasicsProbability)
    };
  }, [analysis]);

  useEffect(() => {
    let cancelled = false;

    async function resolveDeckVisualCards() {
      if (!analysis?.cards.length) {
        setDeckVisualCards([]);
        return;
      }

      try {
        const { sortDeckListCards } = await import("@/lib/deck-lists/sort");
        const sortedCards = await sortDeckListCards(analysis.cards);
        if (!cancelled) {
          startTransition(() => {
            setDeckVisualCards(sortedCards as CalculatorAnalysis["cards"]);
          });
        }
      } catch {
        if (!cancelled) {
          setDeckVisualCards(analysis.cards);
        }
      }
    }

    void resolveDeckVisualCards();

    return () => {
      cancelled = true;
    };
  }, [analysis]);

  function runCalculation(input: string) {
    const result = analyzeDecklist(input);
    setAnalysis(result);
    setDeckVisualCards(result.cards);
    setActiveTab("setup");
    setStatusMessage("");
    setStatusTone("info");
  }

  function handleSampleDeck() {
    setDeckInput(LEGACY_SAMPLE_DECKLIST);
    runCalculation(LEGACY_SAMPLE_DECKLIST);
  }

  function handleClear() {
    setDeckInput("");
    setAnalysis(null);
    setDeckVisualCards([]);
    setActiveTab("setup");
    setStatusMessage("");
    setStatusTone("info");
  }

  return (
    <section className="grid gap-6">
      <Card>
        <div className="grid gap-6 xl:items-start xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <div className="grid content-start gap-4">
            <div className="space-y-2">
              <p className="ui-eyebrow">Deck Input</p>
              <div className="space-y-1">
                <h2 className="ui-section-title">Paste a deck list</h2>
                <p className="text-sm text-muted-foreground">
                  Paste a Limitless-format list to calculate opening-hand and prizing probabilities.
                </p>
              </div>
            </div>

            <div className="grid gap-2">
              <label
                className="ui-eyebrow"
                htmlFor="calculator-deck-input"
              >
                Deck List
              </label>
              <Textarea
                className="h-[320px] w-full resize-none rounded-xl border border-border bg-muted px-4 py-3 text-sm leading-6 text-card-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                id="calculator-deck-input"
                onChange={(event) => setDeckInput(event.target.value)}
                placeholder="Paste your deck list here"
                spellCheck={false}
                value={deckInput}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <Button onClick={() => runCalculation(deckInput)}>Calculate</Button>
              <Button onClick={handleSampleDeck} variant="secondary">
                Load Sample Deck
              </Button>
              <Button onClick={handleClear} variant="secondary">
                Clear
              </Button>
            </div>

            <section className={statusClassName}>
              {showStatus ? (
                <>
                {analysis ? (
                  <p className="text-sm leading-6 text-card-foreground">
                    Parsed {analysis.cards.length} unique cards: {analysis.totals.Pokemon} Pokemon,{" "}
                    {analysis.totals.Trainer} Trainer, {analysis.totals.Energy} Energy,{" "}
                    {analysis.totals.deck} cards total.
                  </p>
                ) : null}

                {statusMessage ? (
                  <p className="mt-2 text-sm font-medium leading-6 text-card-foreground">
                    {statusMessage}
                  </p>
                ) : null}

                {analysis?.warnings.length ? (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-[var(--color-loss)]">
                    {analysis.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
                </>
              ) : (
                <p className="text-sm leading-6 text-muted-foreground">
                  Paste a deck list and click Calculate to review parsed counts, warnings, and setup stats.
                </p>
              )}
            </section>
          </div>

          <div className="grid gap-5 xl:border-l xl:border-border xl:pl-6">
            <section className="grid gap-4">
              <div className="space-y-1">
                <p className="ui-eyebrow">Opening Hand Risk</p>
                <h2 className="ui-section-title">Mulligan Stats and Deck Visual</h2>
                <p className="text-sm text-muted-foreground">
                  Review your opening-hand probabilities first, then scan the sorted 60-card visual below.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard
                  detail="Chance your opening hand has no Basic Pokemon."
                  label="Mulligan Rate"
                  value={summary.mulligan}
                />
                <StatCard
                  detail="Chance your opening hand starts with exactly one Basic."
                  label="Starting With 1 Basic"
                  value={summary.oneBasic}
                />
                <StatCard
                  detail="Chance your opening hand starts with two or more Basics."
                  label="Starting With 2+ Basics"
                  value={summary.twoBasics}
                />
              </div>

              <div className="rounded-[24px] border border-border bg-muted p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="ui-eyebrow">Deck Visual</p>
                    <h3 className="font-display text-[1.25rem] font-semibold tracking-[-0.03em] text-card-foreground">
                      60-Card Graphic
                    </h3>
                  </div>
                  <CopyDeckListButton text={deckInput} />
                </div>

                <div className="mt-4">
                  {analysis ? (
                    <DeckListVisualGrid cards={deckVisualCards} variant="featured" />
                  ) : (
                    <p className="text-sm leading-6 text-muted-foreground">
                      Card images will appear here after calculation.
                    </p>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      </Card>

      <Card>
        <div className="grid gap-4">
            <div className="space-y-1">
              <p className="ui-eyebrow">Opening Hand Risk</p>
              <h2 className="ui-section-title">Mulligan Streak Calculator</h2>
              <p className="text-sm text-muted-foreground">
                {analysis
                  ? "Odds of repeated no-Basic opening hands."
                  : "Odds of repeated no-Basic opening hands will appear here after calculation."}
              </p>
            </div>

            {analysis ? (
              <>
                <p className="text-sm text-foreground">
                  Basics in deck: <strong>{analysis.basicPokemonCount}</strong> out of <strong>60</strong>{" "}
                  cards.
                </p>
                <div className="overflow-hidden rounded-xl border border-border bg-muted">
                  <div className="ui-eyebrow grid grid-cols-3 gap-4 border-b border-border px-4 py-3">
                    <span>Streak</span>
                    <span>Exact</span>
                    <span>At Least</span>
                  </div>
                  <div className="divide-y divide-[var(--border)]">
                    {analysis.mulliganRows.map((row) => (
                      <div
                        className="grid grid-cols-3 gap-4 px-4 py-3 text-sm text-foreground"
                        key={row.streak}
                      >
                        <span className="font-semibold text-card-foreground">{row.streak}x</span>
                        <span>{pct(row.exactThenPlayable)}</span>
                        <span>{pct(row.atLeast)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Exact means that many mulligans, then your next hand is playable.
                </p>
              </>
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">
                Calculate a deck list to populate mulligan streak probabilities.
              </p>
            )}
        </div>
      </Card>

      <Card>
        <div className="grid gap-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="ui-eyebrow">Card Odds</p>
              <h2 className="ui-section-title">Setup and Prizing Detail</h2>
            </div>

            <div
              aria-label="Calculator views"
              className="inline-grid grid-cols-2 gap-1 rounded-full bg-muted p-1"
              role="tablist"
            >
              <button
                aria-selected={activeTab === "setup"}
                className={[
                  "ui-control-text rounded-full px-4 py-2 transition",
                  activeTab === "setup"
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-card"
                ].join(" ")}
                onClick={() => setActiveTab("setup")}
                role="tab"
                type="button"
              >
                Setup
              </button>
              <button
                aria-selected={activeTab === "prizing"}
                className={[
                  "ui-control-text rounded-full px-4 py-2 transition",
                  activeTab === "prizing"
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-card"
                ].join(" ")}
                onClick={() => setActiveTab("prizing")}
                role="tab"
                type="button"
              >
                Prizing
              </button>
            </div>
          </div>

          {activeTab === "setup" ? (
            setupComparisonRows.length ? (
              <ProbabilityComparisonTable
                columns={[
                  { key: "primary", label: "Only Starter" },
                  { key: "secondary", label: "In Starting 7" }
                ]}
                pokemonOptions={pokemonOptions}
                rows={setupComparisonRows.map((row) => ({
                  card: row.card,
                  key: `${row.card.name}-${row.card.category}`,
                  metrics: [
                    { label: "Only Starter", value: pct(row.onlyStarter) },
                    { label: "In Starting 7", value: pct(row.inStartingSeven) }
                  ]
                }))}
              />
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">
                No Pokemon cards were parsed for setup probabilities.
              </p>
            )
          ) : prizingComparisonRows.length ? (
            <ProbabilityCompactGrid
              pokemonOptions={pokemonOptions}
              rows={prizingComparisonRows.map((row) => ({
                card: row.card,
                key: `${row.card.name}-${row.card.category}`,
                metrics: [
                  { label: "None Prized", value: pct(row.nonePrized) },
                  { label: "1 Prized", value: pct(row.onePrized) },
                  { label: "2 Prized", value: pct(row.twoPrized) },
                  { label: "3+ Prized", value: pct(row.threePlusPrized) }
                ]
              }))}
            />
          ) : (
            <p className="text-sm leading-6 text-muted-foreground">
              No cards were parsed for prizing probabilities.
            </p>
          )}
        </div>
      </Card>
    </section>
  );
}

function ProbabilityComparisonTable({
  columns,
  pokemonOptions,
  rows
}: {
  columns: Array<{ key: string; label: string }>;
  pokemonOptions: PokemonOption[] | null;
  rows: Array<{ key: string; card: CalculatorCardGroup; metrics: ComparisonMetric[] }>;
}) {
  return (
    <div className="overflow-hidden rounded-[24px] border border-border bg-muted">
      <div
        className="hidden border-b border-border bg-card px-5 py-3 lg:grid lg:items-center lg:gap-4"
        style={{ gridTemplateColumns: `minmax(17rem, 1.6fr) repeat(${columns.length}, minmax(0, 1fr))` }}
      >
        <div className="ui-eyebrow">Card</div>
        {columns.map((column) => (
          <div className="ui-eyebrow text-right" key={column.key}>
            {column.label}
          </div>
        ))}
      </div>

      <div className="divide-y divide-[var(--border)]">
        {rows.map((row) => (
          <ProbabilityComparisonRow
            card={row.card}
            columns={columns}
            key={row.key}
            metrics={row.metrics}
            pokemonOptions={pokemonOptions}
          />
        ))}
      </div>
    </div>
  );
}

function ProbabilityComparisonRow({
  card,
  columns,
  metrics,
  pokemonOptions
}: {
  card: CalculatorCardGroup;
  columns: Array<{ key: string; label: string }>;
  metrics: ComparisonMetric[];
  pokemonOptions: PokemonOption[] | null;
}) {
  return (
    <article className="px-4 py-4 sm:px-5">
      <div
        className="grid gap-4 lg:items-center"
        style={{ gridTemplateColumns: `minmax(0, 1fr)` }}
      >
        <div
          className="hidden lg:grid lg:items-center lg:gap-4"
          style={{ gridTemplateColumns: `minmax(17rem, 1.6fr) repeat(${columns.length}, minmax(0, 1fr))` }}
        >
          <div className="flex min-w-0 items-center gap-3">
            {card.category === "Pokemon" ? (
              <CalculatorPokemonSprite name={card.name} pokemonOptions={pokemonOptions} />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-[0.72rem] font-semibold text-muted-foreground">
                {card.category.slice(0, 1)}
              </div>
            )}

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-display text-[1.05rem] font-semibold tracking-[-0.025em] text-card-foreground">
                  {card.count}x {card.name}
                </h4>
                <span className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-1 text-[0.72rem] font-semibold text-foreground">
                  {card.category === "Pokemon" && card.stage ? card.stage : card.category}
                </span>
              </div>
            </div>
          </div>

          {metrics.map((metric, index) => (
            <div className="text-right" key={`${card.name}-${metric.label}-${index}`}>
              <p className="font-display text-[1.08rem] font-semibold tracking-[-0.025em] text-card-foreground">
                {metric.value}
              </p>
            </div>
          ))}
        </div>

        <div className="grid gap-3 lg:hidden">
          <div className="flex min-w-0 items-center gap-3">
            {card.category === "Pokemon" ? (
              <CalculatorPokemonSprite name={card.name} pokemonOptions={pokemonOptions} />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-[0.72rem] font-semibold text-muted-foreground">
                {card.category.slice(0, 1)}
              </div>
            )}

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-display text-[1.05rem] font-semibold tracking-[-0.025em] text-card-foreground">
                  {card.count}x {card.name}
                </h4>
                <span className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-1 text-[0.72rem] font-semibold text-foreground">
                  {card.category === "Pokemon" && card.stage ? card.stage : card.category}
                </span>
              </div>
            </div>
          </div>

          <dl className={`grid gap-3 ${metrics.length > 2 ? "grid-cols-2" : "grid-cols-2"}`}>
            {metrics.map((metric, index) => (
              <div className="rounded-[16px] border border-border bg-card px-3 py-2.5" key={`${card.name}-${metric.label}-${index}`}>
                <dt className="ui-eyebrow">{metric.label}</dt>
                <dd className="mt-1 font-display text-[1.02rem] font-semibold tracking-[-0.025em] text-card-foreground">
                  {metric.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </article>
  );
}

function ProbabilityCompactGrid({
  pokemonOptions,
  rows
}: {
  pokemonOptions: PokemonOption[] | null;
  rows: Array<{ key: string; card: CalculatorCardGroup; metrics: ComparisonMetric[] }>;
}) {
  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {rows.map((row) => (
        <article
          className="rounded-[20px] border border-border bg-muted px-4 py-4"
          key={row.key}
        >
          <div className="flex min-w-0 items-center gap-3">
            {row.card.category === "Pokemon" ? (
              <CalculatorPokemonSprite name={row.card.name} pokemonOptions={pokemonOptions} />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-[0.72rem] font-semibold text-muted-foreground">
                {row.card.category.slice(0, 1)}
              </div>
            )}

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-display text-[1rem] font-semibold tracking-[-0.025em] text-card-foreground">
                  {row.card.count}x {row.card.name}
                </h4>
                <span className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-1 text-[0.72rem] font-semibold text-foreground">
                  {row.card.category === "Pokemon" && row.card.stage ? row.card.stage : row.card.category}
                </span>
              </div>
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-4 gap-2">
            {row.metrics.map((metric, index) => (
              <div
                className="rounded-[14px] border border-border bg-card px-2 py-2 text-center"
                key={`${row.card.name}-${metric.label}-${index}`}
              >
                <dt className="ui-eyebrow">{metric.label}</dt>
                <dd className="mt-1 font-display text-[0.94rem] font-semibold tracking-[-0.02em] text-card-foreground">
                  {metric.value}
                </dd>
              </div>
            ))}
          </dl>
        </article>
      ))}
    </div>
  );
}

function CalculatorPokemonSprite({
  name,
  pokemonOptions
}: {
  name: string;
  pokemonOptions: PokemonOption[] | null;
}) {
  const [hasError, setHasError] = useState(false);
  const slug = resolvePokemonSpriteSlug(name, pokemonOptions ?? undefined);
  const matchedOption = findPokemonOptionBySlug(slug, pokemonOptions ?? undefined);
  const src = matchedOption?.spriteUrl || getPokemonSpriteUrl(name, pokemonOptions ?? undefined);
  const fallbackLabel = prettifyPokemonSlug(slug || name);

  if (hasError || !src) {
    return (
      <div
        aria-label={fallbackLabel}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card px-1 text-center text-[8px] font-semibold leading-tight text-muted-foreground"
      >
        {fallbackLabel}
      </div>
    );
  }

  return (
    <Image
      alt=""
      aria-hidden="true"
      className="h-10 w-10 shrink-0 object-contain"
      height={40}
      onError={() => {
        setHasError(true);
      }}
      sizes="40px"
      src={src}
      unoptimized
      width={40}
    />
  );
}
