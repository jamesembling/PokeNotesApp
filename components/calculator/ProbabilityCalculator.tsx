"use client";

import Image from "next/image";
import Link from "next/link";
import { startTransition, useEffect, useMemo, useState } from "react";
import { Textarea } from "@/components/shadcn/textarea";
import { Button } from "@/components/shadcn/button";
import { ButtonGroup } from "@/components/shadcn/button-group";
import { AppDialogContent, AppDialogHeader } from "@/components/ui/AppDialog";
import { Dialog } from "@/components/shadcn/dialog";
import { Tabs } from "@/components/shadcn/tabs";
import { CopyDeckListButton } from "@/components/ui/CopyDeckListButton";
import { DeckListVisualGrid } from "@/components/ui/DeckListVisualGrid";
import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ItemTitle, SectionTitle } from "@/components/ui/Typography";
import { cn } from "@/lib/utils";
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
            title="Probability Calculator"
          />

          <section className="grid gap-5 border-b border-border pb-6">
            <section className="grid gap-3">
              <SectionTitle>Mulligan Stats</SectionTitle>
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
                <SectionTitle as="h3" size="sm">60-Card Graphic</SectionTitle>
                <CopyDeckListButton text={deckInput} />
              </div>

              <DeckListVisualGrid cards={deckVisualCards} variant="featured" />
            </section>
          </section>

          <section className="grid gap-4 border-b border-border pb-6">
            <div className="space-y-1">
              <SectionTitle>Mulligan Streak Calculator</SectionTitle>
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
            <SectionHeader
              actions={
              <Tabs
                className="w-auto"
                onValueChange={(value) => setActiveTab(value as TabId)}
                value={activeTab}
              >
                <SegmentedControl
                  ariaLabel="Calculator views"
                  options={[
                    { value: "setup", label: "Setup" },
                    { value: "prizing", label: "Prizing" }
                  ]}
                />
              </Tabs>
              }
              title="Card Probabilities"
            />

            {activeTab === "setup" ? (
              setupComparisonRows.length ? (
                <ProbabilityDetailTable
                  ariaLabel="Setup probabilities by card"
                  columns={[
                    { key: "only-starter", label: "Only Starter", mobileLabel: "Only Starter" },
                    { key: "starting-seven", label: "In Starting 7", mobileLabel: "Opening 7" }
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
              <ProbabilityDetailTable
                ariaLabel="Prize probabilities by card"
                columns={[
                  { key: "none-prized", label: "None Prized", mobileLabel: "None" },
                  { key: "one-prized", label: "1 Prized", mobileLabel: "1" },
                  { key: "two-prized", label: "2 Prized", mobileLabel: "2" },
                  { key: "three-plus-prized", label: "3+ Prized", mobileLabel: "3+" }
                ]}
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
      <AppDialogContent
        showCloseButton={!initialImport}
      >
        <AppDialogHeader
          description="Paste a Pokemon TCG deck list to open the probability calculator."
          title="Import Deck"
        />

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
      </AppDialogContent>
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

function ProbabilityDetailTable({
  ariaLabel,
  columns,
  pokemonOptions,
  rows
}: {
  ariaLabel: string;
  columns: Array<{ key: string; label: string; mobileLabel: string }>;
  pokemonOptions: PokemonOption[] | null;
  rows: Array<{ key: string; card: CalculatorCardGroup; metrics: ComparisonMetric[] }>;
}) {
  const dense = columns.length > 2;
  const firstColumnWidth = dense ? "w-[38%] sm:w-[48%]" : "w-[50%] sm:w-[58%]";

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-muted">
      <table aria-label={ariaLabel} className="w-full table-fixed">
        <colgroup>
          <col className={firstColumnWidth} />
          {columns.map((column) => (
            <col key={column.key} />
          ))}
        </colgroup>
        <thead className="border-b border-border bg-card">
          <tr>
            <th className="ui-eyebrow px-3 py-2.5 text-left sm:px-4" scope="col">
              Card
            </th>
            {columns.map((column) => (
              <th className="ui-eyebrow px-1 py-2.5 text-right sm:px-3" key={column.key} scope="col">
                <span className="sm:hidden">{column.mobileLabel}</span>
                <span className="hidden sm:inline">{column.label}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {rows.map((row) => (
            <ProbabilityDetailRow
              card={row.card}
              dense={dense}
              key={row.key}
              metrics={row.metrics}
              pokemonOptions={pokemonOptions}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProbabilityDetailRow({
  card,
  dense,
  metrics,
  pokemonOptions
}: {
  card: CalculatorCardGroup;
  dense: boolean;
  metrics: ComparisonMetric[];
  pokemonOptions: PokemonOption[] | null;
}) {
  return (
    <tr>
      <th className="px-3 py-2 text-left font-normal sm:px-4 sm:py-2.5" scope="row">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <span className={cn("shrink-0", dense && "hidden sm:inline-flex")}>
            {card.category === "Pokemon" ? (
              <CalculatorPokemonSprite compact name={card.name} pokemonOptions={pokemonOptions} />
            ) : (
              <span className="flex size-8 items-center justify-center rounded-full border border-border bg-card text-[0.68rem] font-semibold text-muted-foreground sm:size-10">
                {card.category.slice(0, 1)}
              </span>
            )}
          </span>
          <ItemTitle as="span" className="line-clamp-2" size="xs">
            {card.count}x {card.name}
          </ItemTitle>
        </div>
      </th>
      {metrics.map((metric, index) => (
        <td className="px-1 py-2 text-right sm:px-3 sm:py-2.5" key={`${card.name}-${metric.label}-${index}`}>
          <span
            className={cn(
              "whitespace-nowrap font-semibold text-card-foreground tabular-nums sm:text-base",
              dense ? "text-[0.7rem]" : "text-xs"
            )}
          >
            {metric.value}
          </span>
        </td>
      ))}
    </tr>
  );
}

function CalculatorPokemonSprite({
  compact = false,
  name,
  pokemonOptions
}: {
  compact?: boolean;
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
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full border border-border bg-card px-1 text-center text-[8px] font-semibold leading-tight text-muted-foreground",
          compact ? "size-8 sm:size-10" : "size-10"
        )}
      >
        {fallbackLabel}
      </div>
    );
  }

  return (
    <Image
      alt=""
      aria-hidden="true"
      className={cn("shrink-0 object-contain", compact ? "size-8 sm:size-10" : "size-10")}
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
