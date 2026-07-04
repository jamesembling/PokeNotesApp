"use client";

import Image from "next/image";
import Link from "next/link";
import { startTransition, useEffect, useMemo, useState } from "react";
import { Textarea } from "@/components/shadcn/textarea";
import { Button } from "@/components/shadcn/button";
import { ButtonGroup } from "@/components/shadcn/button-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from "@/components/shadcn/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/shadcn/tabs";
import { CopyDeckListButton } from "@/components/ui/CopyDeckListButton";
import { DeckListVisualGrid } from "@/components/ui/DeckListVisualGrid";
import { PageHeader } from "@/components/ui/PageHeader";
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
  const [importDialogOpen, setImportDialogOpen] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusTone, setStatusTone] = useState<"info" | "warn">("info");

  const showStatus = Boolean(statusMessage) || Boolean(analysis?.warnings.length);
  const statusClassName = [
    "rounded-[16px] border px-4 py-3",
    analysis?.warnings.length || statusTone === "warn"
      ? "border-loss-border bg-loss-bg text-loss"
      : "border-border bg-muted text-muted-foreground"
  ].join(" ");

  const setupCards = analysis?.setupRows ?? [];
  const prizingCards = analysis?.prizingRows ?? [];
  const cardOrder = useMemo(() => {
    return new Map(deckVisualCards.map((card, index) => [`${card.name}-${card.category}`, index]));
  }, [deckVisualCards]);
  const setupComparisonRows = useMemo(
    () =>
      setupCards.toSorted((left, right) => {
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
      prizingCards.toSorted((left, right) => {
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
    if (!input.trim()) {
      setAnalysis(null);
      setDeckVisualCards([]);
      setActiveTab("setup");
      setStatusMessage("Paste a deck list before calculating.");
      setStatusTone("warn");
      return;
    }

    const result = analyzeDecklist(input);

    if (!result.cards.length) {
      setAnalysis(null);
      setDeckVisualCards([]);
      setActiveTab("setup");
      setStatusMessage(result.warnings[0] ?? "No parseable cards found.");
      setStatusTone("warn");
      return;
    }

    setAnalysis(result);
    setDeckVisualCards(result.cards);
    setActiveTab("setup");
    setStatusMessage("");
    setStatusTone("info");
    setImportDialogOpen(false);
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
    setImportDialogOpen(true);
  }

  return (
    <>
      <DeckImportDialog
        deckInput={deckInput}
        initialImport={!analysis}
        onDeckInputChange={setDeckInput}
        onLoadSampleDeck={handleSampleDeck}
        onOpenChange={setImportDialogOpen}
        onSubmit={() => runCalculation(deckInput)}
        open={importDialogOpen}
        showStatus={!analysis && showStatus}
        statusClassName={statusClassName}
        statusMessage={statusMessage}
      />

      {analysis ? (
        <section className="grid gap-6">
          <PageHeader
            action={
              <ButtonGroup className="w-full [&>[data-slot=button]]:flex-1 sm:w-auto sm:[&>[data-slot=button]]:flex-none">
                <Button onClick={() => setImportDialogOpen(true)}>
                  Import Deck
                </Button>
                <Button onClick={handleClear}>
                  Clear Deck
                </Button>
              </ButtonGroup>
            }
            breadcrumb={[
              { label: "Poke Notes", href: "/" },
              { label: "Probability Calculator" }
            ]}
            showDivider={false}
            title="Probability Calculator"
          />

          <section className="grid gap-5 border-b border-border pb-6">
            <section className="grid gap-3">
              <h2 className="ui-section-title">Mulligan Stats</h2>
              <div className="grid grid-cols-3 gap-3">
                <ProbabilitySummaryMetric
                  label="Mulligan Rate"
                  value={summary.mulligan}
                />
                <ProbabilitySummaryMetric
                  label="Starting With 1 Basic"
                  value={summary.oneBasic}
                />
                <ProbabilitySummaryMetric
                  label="Starting With 2+ Basics"
                  value={summary.twoBasics}
                />
              </div>
            </section>

            {showStatus ? (
              <section className={statusClassName}>
                {statusMessage ? (
                  <p className="text-sm font-medium leading-6 text-card-foreground">
                    {statusMessage}
                  </p>
                ) : null}

                {analysis.warnings.length ? (
                  <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-loss">
                    {analysis.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ) : null}

            <section className="grid gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="font-display text-[1.25rem] font-semibold tracking-[-0.03em] text-card-foreground">
                  60-Card Graphic
                </h3>
                <CopyDeckListButton text={deckInput} />
              </div>

              <DeckListVisualGrid cards={deckVisualCards} variant="featured" />
            </section>
          </section>

          <section className="grid gap-4 border-b border-border pb-6">
            <div className="space-y-1">
              <h2 className="ui-section-title">Mulligan Streak Calculator</h2>
            </div>

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
          </section>

          <section className="grid gap-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="ui-eyebrow">Card Odds</p>
                <h2 className="ui-section-title">Setup and Prizing Detail</h2>
              </div>

              <Tabs
                className="w-auto"
                onValueChange={(value) => setActiveTab(value as TabId)}
                value={activeTab}
              >
                <TabsList aria-label="Calculator views" className="rounded-full bg-muted p-1">
                  <TabsTrigger className="rounded-full px-4" value="setup">
                    Setup
                  </TabsTrigger>
                  <TabsTrigger className="rounded-full px-4" value="prizing">
                    Prizing
                  </TabsTrigger>
                </TabsList>
              </Tabs>
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
                null
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
              null
            )}
          </section>
        </section>
      ) : null}
    </>
  );
}

function DeckImportDialog({
  deckInput,
  initialImport,
  onDeckInputChange,
  onLoadSampleDeck,
  onOpenChange,
  onSubmit,
  open,
  showStatus,
  statusClassName,
  statusMessage
}: {
  deckInput: string;
  initialImport: boolean;
  onDeckInputChange: (value: string) => void;
  onLoadSampleDeck: () => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
  open: boolean;
  showStatus: boolean;
  statusClassName: string;
  statusMessage: string;
}) {
  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (initialImport && !nextOpen) {
          return;
        }

        onOpenChange(nextOpen);
      }}
      open={open}
    >
      <DialogContent
        className="flex max-h-[calc(100dvh-1rem)] max-w-3xl min-w-0 flex-col overflow-hidden rounded-[24px] border border-border bg-card p-0 shadow-[var(--shadow-lg)] sm:max-h-[calc(100dvh-2rem)] sm:max-w-3xl sm:rounded-[28px]"
        showCloseButton={!initialImport}
      >
        <div className="shrink-0 border-b border-border p-4 pr-14 sm:px-6 sm:pr-14 lg:px-8 lg:pr-14">
          <DialogTitle className="text-[1.55rem] font-bold tracking-[-0.05em] text-card-foreground sm:text-[1.9rem]">
            Import Deck
          </DialogTitle>
          <DialogDescription className="sr-only">
            Paste a Pokemon TCG deck list to open the probability calculator.
          </DialogDescription>
        </div>

        <form
          className="grid min-h-0 gap-4 overflow-y-auto p-4 pr-5 sm:px-6 sm:py-5 sm:pr-7 lg:px-8 lg:py-6 lg:pr-9"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <label className="sr-only" htmlFor="calculator-deck-input">
            Deck List
          </label>
          <Textarea
            autoFocus
            className="h-[360px] w-full resize-none rounded-xl border border-border bg-muted px-4 py-3 text-sm leading-6 text-card-foreground outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/50"
            id="calculator-deck-input"
            onChange={(event) => onDeckInputChange(event.target.value)}
            placeholder="Paste your deck list here"
            spellCheck={false}
            value={deckInput}
          />

          {showStatus ? (
            <section className={statusClassName}>
              <p className="text-sm font-medium leading-6 text-card-foreground">
                {statusMessage}
              </p>
            </section>
          ) : null}

          <ButtonGroup className="w-full" orientation="vertical">
            <Button type="submit">Import Deck</Button>
            <Button onClick={onLoadSampleDeck} variant="outline">
              Load Sample Deck
            </Button>
            <Button asChild variant="outline">
              <Link href="/logs" prefetch={false}>
                Back to Site
              </Link>
            </Button>
          </ButtonGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProbabilitySummaryMetric({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex h-full min-w-0 flex-col gap-2 py-2">
      <p className="text-[0.65rem] font-medium uppercase leading-tight tracking-wide text-muted-foreground sm:text-xs">
        {label}
      </p>
      <p className="text-xl font-semibold leading-none tracking-[-0.02em] text-card-foreground [font-variant-numeric:tabular-nums] sm:text-3xl">
        {value}
      </p>
    </div>
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
    <article className="p-4 sm:px-5">
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
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-[0.72rem] font-semibold text-muted-foreground">
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
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-[0.72rem] font-semibold text-muted-foreground">
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
          className="rounded-[20px] border border-border bg-muted p-4"
          key={row.key}
        >
          <div className="flex min-w-0 items-center gap-3">
            {row.card.category === "Pokemon" ? (
              <CalculatorPokemonSprite name={row.card.name} pokemonOptions={pokemonOptions} />
            ) : (
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-[0.72rem] font-semibold text-muted-foreground">
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
                className="rounded-[14px] border border-border bg-card p-2 text-center"
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
        className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card px-1 text-center text-[8px] font-semibold leading-tight text-muted-foreground"
      >
        {fallbackLabel}
      </div>
    );
  }

  return (
    <Image
      alt=""
      aria-hidden="true"
      className="size-10 shrink-0 object-contain"
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
