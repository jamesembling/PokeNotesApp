"use client";

import Image from "next/image";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { Textarea } from "@/components/shadcn/textarea";
import { Button } from "@/components/shadcn/button";
import { Tabs, TabsContent } from "@/components/shadcn/tabs";
import { CopyDeckListButton } from "@/components/ui/CopyDeckListButton";
import { DeckListVisualGrid } from "@/components/ui/DeckListVisualGrid";
import { PageActions } from "@/components/ui/PageActions";
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
import { findPokemonOptionBySlug, resolvePokemonSpriteSlug } from "@/lib/pokemon/sprites";
import { usePokemonOptions } from "@/lib/pokemon/use-pokemon-options";
import type { PokemonOption } from "@/types/index";
import styles from "./calculator.module.css";

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
  const [editorOpen, setEditorOpen] = useState(true);
  const [focusEditorOnMount, setFocusEditorOnMount] = useState(false);
  const [analyzedInput, setAnalyzedInput] = useState("");
  const [cardsVisible, setCardsVisible] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const cardOrder = useMemo(() => {
    return new Map(deckVisualCards.map((card, index) => [`${card.name}-${card.category}`, index]));
  }, [deckVisualCards]);
  const setupComparisonRows = useMemo(() => {
    const setupCards = analysis?.setupRows ?? [];

    return setupCards.toSorted((left, right) => {
      const leftOrder =
        cardOrder.get(`${left.card.name}-${left.card.category}`) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder =
        cardOrder.get(`${right.card.name}-${right.card.category}`) ?? Number.MAX_SAFE_INTEGER;

      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return left.card.name.localeCompare(right.card.name);
    });
  }, [analysis, cardOrder]);
  const prizingComparisonRows = useMemo(() => {
    const prizingCards = analysis?.prizingRows ?? [];

    return prizingCards.toSorted((left, right) => {
      const leftOrder =
        cardOrder.get(`${left.card.name}-${left.card.category}`) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder =
        cardOrder.get(`${right.card.name}-${right.card.category}`) ?? Number.MAX_SAFE_INTEGER;

      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return left.card.name.localeCompare(right.card.name);
    });
  }, [analysis, cardOrder]);
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

  useEffect(() => {
    if (!editorOpen && analysis) {
      resultsRef.current?.focus();
    }
  }, [analysis, editorOpen]);

  function runCalculation(input: string) {
    if (!input.trim()) {
      setStatusMessage("Paste a Deck List before calculating.");
      inputRef.current?.focus();
      return;
    }

    const result = analyzeDecklist(input);
    if (!result.cards.length) {
      setStatusMessage(result.warnings[0] ?? "No cards recognised. Include each card’s quantity, name, set and number.");
      inputRef.current?.focus();
      return;
    }

    setAnalysis(result);
    setAnalyzedInput(input);
    setDeckVisualCards(result.cards);
    setActiveTab("setup");
    setStatusMessage("");
    setEditorOpen(false);
    setCardsVisible(false);
  }

  function handleSampleDeck() {
    setDeckInput(LEGACY_SAMPLE_DECKLIST);
    runCalculation(LEGACY_SAMPLE_DECKLIST);
  }

  function handleClear() {
    setFocusEditorOnMount(true);
    setDeckInput("");
    setAnalyzedInput("");
    setAnalysis(null);
    setDeckVisualCards([]);
    setActiveTab("setup");
    setStatusMessage("");
    setEditorOpen(true);
    setCardsVisible(false);
  }

  return (
    <div className={styles.root}>
      <PageHeader
        action={analysis && !editorOpen ? (
          <PageActions>
            <Button onClick={() => {
              setDeckInput(analyzedInput);
              setStatusMessage("");
              setEditorOpen(true);
            }} variant="outline">Edit Deck List</Button>
            <Button onClick={handleClear} variant="outline">Clear</Button>
          </PageActions>
        ) : undefined}
        breadcrumb={[
          { label: "Poke Notes", href: "/" },
          { label: "Probability Calculator" }
        ]}
        title="Probability Calculator"
      />

      {editorOpen ? (
        <div className={styles.importLayout}>
          <form className={styles.importForm} onSubmit={(event) => {
            event.preventDefault();
            runCalculation(deckInput);
          }}>
            <SectionTitle as="h2">{analysis ? "Edit your Deck List" : "Start with your Deck List"}</SectionTitle>
            <p className={styles.description}>Paste an exported list to calculate your opening hands and prize odds.</p>
            <label className={styles.inputLabel} htmlFor="calculator-deck-input">Deck List</label>
            <Textarea
              aria-describedby={statusMessage ? "calculator-input-help calculator-input-error" : "calculator-input-help"}
              aria-invalid={Boolean(statusMessage)}
              autoFocus={focusEditorOnMount || Boolean(analysis)}
              className={styles.deckInput}
              id="calculator-deck-input"
              onChange={(event) => {
                setDeckInput(event.target.value);
                if (statusMessage) setStatusMessage("");
              }}
              placeholder={"Pokémon: 12\n4 Dreepy TWM 128\n…\n\nTrainer: 40\n…\n\nEnergy: 8\n…"}
              ref={inputRef}
              spellCheck={false}
              value={deckInput}
            />
            <p className={styles.inputHelp} id="calculator-input-help">Include quantities, card names, set codes and card numbers.</p>
            {statusMessage ? <p className={styles.error} id="calculator-input-error" role="alert">{statusMessage}</p> : null}
            <PageActions>
              <Button type="submit">Calculate probabilities</Button>
              <Button onClick={handleSampleDeck} type="button" variant="outline">Use sample list</Button>
              {analysis ? <Button onClick={() => {
                setDeckInput(analyzedInput);
                setStatusMessage("");
                setEditorOpen(false);
              }} type="button" variant="outline">Cancel</Button> : null}
            </PageActions>
          </form>
          <aside className={styles.importGuide} aria-label="About the calculator">
            <SectionTitle size="sm">Know your odds</SectionTitle>
            <dl className={styles.guideList}>
              <div><dt>Opening hands</dt><dd>How often you mulligan, and how many Basic Pokémon you start with.</dd></div>
              <div><dt>Setup</dt><dd>Which Pokémon appear in a playable opening hand, or are your only available starter.</dd></div>
              <div><dt>Prizing</dt><dd>The chance of each card landing in your six Prize cards.</dd></div>
            </dl>
            <p className={styles.methodNote}>Based on a 60-card deck, a seven-card opening hand and six Prize cards. Your list is used for this calculation only; it isn’t saved.</p>
          </aside>
        </div>
      ) : analysis ? (
        <div aria-label="Calculated probabilities" className={styles.results} ref={resultsRef} role="region" tabIndex={-1}>
          <dl className={styles.deckContext} aria-label="Deck composition">
            <div><dt>Cards</dt><dd>{analysis.totals.deck}</dd></div>
            <div><dt>Basic Pokémon</dt><dd>{analysis.basicPokemonCount}</dd></div>
            <div><dt>Pokémon</dt><dd>{analysis.totals.Pokemon}</dd></div>
            <div><dt>Trainers</dt><dd>{analysis.totals.Trainer}</dd></div>
            <div><dt>Energy</dt><dd>{analysis.totals.Energy}</dd></div>
          </dl>
          {analysis.warnings.length ? (
            <div className={styles.warning} role="alert">
              <p>Check your Deck List</p>
              <ul>{analysis.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </div>
          ) : null}

          <div className={styles.overview}>
            <section className={styles.openingSection} aria-labelledby="opening-heading">
              <SectionTitle id="opening-heading">Opening hands</SectionTitle>
              <p className={styles.description}>Your first seven cards, before the game begins.</p>
              <dl className={styles.summary}>
                <ProbabilitySummaryMetric label="Mulligan" value={summary.mulligan} note="No Basic Pokémon" />
                <ProbabilitySummaryMetric label="Exactly 1 Basic" value={summary.oneBasic} note="Of playable hands" />
                <ProbabilitySummaryMetric label="2+ Basics" value={summary.twoBasics} note="Of playable hands" />
              </dl>
              <p className={styles.methodNote}>A playable hand contains at least one Basic Pokémon. Setup odds exclude mulligans.</p>
            </section>
            <section className={styles.streakSection} aria-labelledby="streak-heading">
              <SectionTitle id="streak-heading" size="sm">Mulligan streaks</SectionTitle>
              <table className={styles.streakTable}>
                <caption className="sr-only">Consecutive mulligan probabilities</caption>
                <thead><tr><th scope="col">In a row</th><th scope="col">Exactly</th><th scope="col">At least</th></tr></thead>
                <tbody>{analysis.mulliganRows.map((row) => (
                  <tr key={row.streak}><th scope="row">{row.streak}</th><td>{pct(row.exactThenPlayable)}</td><td>{pct(row.atLeast)}</td></tr>
                ))}</tbody>
              </table>
              <p className={styles.inputHelp}>“Exactly” ends with a playable hand.</p>
            </section>
          </div>

          <section className={styles.cardSection} aria-labelledby="card-probabilities-heading">
            <Tabs onValueChange={(value) => setActiveTab(value as TabId)} value={activeTab}>
              <SectionHeader
                actions={<SegmentedControl appearance="line" ariaLabel="Calculator views" options={[
                  { value: "setup", label: "Setup" },
                  { value: "prizing", label: "Prizing" }
                ]} />}
                title="Card probabilities"
                titleId="card-probabilities-heading"
              />
              <TabsContent className={styles.tabPanel} value="setup">
                <p className={styles.tableDescription}>In a playable opening hand. “Only starter” means this is the only Basic Pokémon name available, including multiple copies.</p>
                {setupComparisonRows.length ? (
                  <ProbabilityDetailTable
                    ariaLabel="Setup probabilities by card"
                    columns={[{ key: "only-starter", label: "Only starter" }, { key: "starting-seven", label: "In opening 7" }]}
                    pokemonOptions={pokemonOptions}
                    rows={setupComparisonRows.map((row) => ({
                      card: row.card,
                      key: `${row.card.name}-${row.card.category}`,
                      metrics: [{ label: "Only starter", value: pct(row.onlyStarter) }, { label: "In opening 7", value: pct(row.inStartingSeven) }]
                    }))}
                  />
                ) : <p className={styles.emptyState}>No Pokémon found in this list. Edit your Deck List to calculate setup odds.</p>}
              </TabsContent>
              <TabsContent className={styles.tabPanel} value="prizing">
                <p className={styles.tableDescription}>Copies in your six Prize cards, drawn from a 60-card deck. These odds are not adjusted for your opening hand.</p>
                <ProbabilityDetailTable
                  ariaLabel="Prize probabilities by card"
                  columns={[
                    { key: "none-prized", label: "None prized" }, { key: "one-prized", label: "1 prized" },
                    { key: "two-prized", label: "2 prized" }, { key: "three-plus-prized", label: "3+ prized" }
                  ]}
                  pokemonOptions={pokemonOptions}
                  rows={prizingComparisonRows.map((row) => ({
                    card: row.card,
                    key: `${row.card.name}-${row.card.category}`,
                    metrics: [
                      { label: "None prized", value: pct(row.nonePrized) }, { label: "1 prized", value: pct(row.onePrized) },
                      { label: "2 prized", value: pct(row.twoPrized) }, { label: "3+ prized", value: pct(row.threePlusPrized) }
                    ]
                  }))}
                />
              </TabsContent>
            </Tabs>
          </section>

          <section className={styles.deckSection}>
            <SectionHeader title="Deck List" actions={
              <PageActions>
                <CopyDeckListButton text={analyzedInput} />
                <Button aria-controls="calculator-card-graphic" aria-expanded={cardsVisible} onClick={() => setCardsVisible((visible) => !visible)} variant="outline">
                  {cardsVisible ? "Hide cards" : "Show cards"}
                </Button>
              </PageActions>
            } />
            <div hidden={!cardsVisible} id="calculator-card-graphic">
              {cardsVisible ? <DeckListVisualGrid cards={deckVisualCards} variant="featured" /> : null}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function ProbabilitySummaryMetric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className={styles.summaryMetric}><dt>{label}</dt><dd>{value}<span>{note}</span></dd></div>;
}

function ProbabilityDetailTable({ ariaLabel, columns, pokemonOptions, rows }: {
  ariaLabel: string;
  columns: Array<{ key: string; label: string }>;
  pokemonOptions: PokemonOption[] | null;
  rows: Array<{ key: string; card: CalculatorCardGroup; metrics: ComparisonMetric[] }>;
}) {
  return (
    <table aria-label={ariaLabel} className={cn(styles.probabilityTable, columns.length > 2 && styles.prizingTable)} role="table">
      <thead role="rowgroup"><tr role="row">
        <th role="columnheader" scope="col">Card</th>
        {columns.map((column) => <th key={column.key} role="columnheader" scope="col">{column.label}</th>)}
      </tr></thead>
      <tbody role="rowgroup">{rows.map((row) => (
        <tr key={row.key} role="row">
          <th role="rowheader" scope="row">
            <div className={styles.cardIdentity}>
              <span aria-hidden="true" className={styles.cardSprite}>
                {row.card.category === "Pokemon" ? <CalculatorPokemonSprite compact name={row.card.name} pokemonOptions={pokemonOptions} /> : <span className={styles.cardCategory}>{row.card.category.slice(0, 1)}</span>}
              </span>
              <span className={styles.cardCount}>{row.card.count}<span aria-hidden="true">×</span><span className="sr-only"> {row.card.count === 1 ? "copy" : "copies"}</span></span>
              <ItemTitle as="span" className={styles.cardName} size="xs">{row.card.name}</ItemTitle>
            </div>
          </th>
          {row.metrics.map((metric) => <td key={metric.label} role="cell"><span aria-hidden="true" className={styles.mobileMetricLabel}>{metric.label}</span><span>{metric.value}</span></td>)}
        </tr>
      ))}</tbody>
    </table>
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

  if (hasError || !src) {
    return (
      <span
        aria-hidden="true"
        className={cn("block shrink-0", compact ? "size-8 sm:size-10" : "size-10")}
      />
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
