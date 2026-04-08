"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DeckListVisualGrid } from "@/components/ui/DeckListVisualGrid";
import { StatCard } from "@/components/ui/StatCard";
import {
  analyzeDecklist,
  buildReportPngBlob,
  downloadBlob,
  getPokemonSpriteUrl,
  pct,
  reportTimestamp,
  type CalculatorAnalysis,
  type CalculatorCardGroup
} from "@/lib/probability-calculator";

type TabId = "setup" | "prizing";

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
  const [activeTab, setActiveTab] = useState<TabId>("setup");
  const [statusMessage, setStatusMessage] = useState("");
  const [statusTone, setStatusTone] = useState<"info" | "warn">("info");
  const [isExporting, setIsExporting] = useState(false);

  const showStatus = Boolean(statusMessage) || Boolean(analysis?.warnings.length) || Boolean(analysis);
  const statusClassName = [
    "rounded-xl border p-4",
    analysis?.warnings.length || statusTone === "warn"
      ? "border-[var(--color-loss-border)] bg-[var(--color-loss-bg)]"
      : "border-[var(--color-brand)]/15 bg-[var(--color-brand)]/5"
  ].join(" ");

  const setupCards = analysis?.setupRows ?? [];
  const prizingCards = analysis?.prizingRows ?? [];
  const summary = useMemo(() => {
    if (!analysis) {
      return {
        mulligan: "--",
        oneBasic: "--",
        twoBasics: "--",
        singleHandRisk: "--"
      };
    }

    return {
      mulligan: pct(analysis.mulliganProbability),
      oneBasic: pct(analysis.exactlyOneBasicProbability),
      twoBasics: pct(analysis.twoOrMoreBasicsProbability),
      singleHandRisk: pct(analysis.mulliganProbability)
    };
  }, [analysis]);

  function runCalculation(input: string) {
    const result = analyzeDecklist(input);
    setAnalysis(result);
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
    setActiveTab("setup");
    setStatusMessage("");
    setStatusTone("info");
  }

  async function handleExport() {
    if (!analysis || analysis.cards.length === 0) {
      setStatusTone("warn");
      setStatusMessage("Run Calculate first, then use Share PNG.");
      return;
    }

    const filename = `deckprep-probability-report-${reportTimestamp(new Date())}.png`;
    setIsExporting(true);
    setStatusMessage("");
    setStatusTone("info");

    try {
      const blob = await buildReportPngBlob(analysis);
      const file = new File([blob], filename, { type: "image/png" });
      const canNativeShareFile =
        typeof navigator.share === "function" &&
        (typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] }));

      if (canNativeShareFile) {
        await navigator.share({
          files: [file],
          title: "Poke Notes Probability Report"
        });
      } else {
        downloadBlob(blob, filename);
      }

      setStatusTone("info");
      setStatusMessage(`Exported ${filename}.`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      setStatusTone("warn");
      setStatusMessage(message);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <section className="grid gap-6">
      <Card>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <div className="grid gap-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-kicker)]">
                Deck Input
              </p>
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-[var(--text-primary)]">Paste a deck list</h2>
                <p className="text-sm text-[var(--text-muted)]">
                  Paste a Limitless-format list to calculate opening-hand and prizing probabilities.
                </p>
              </div>
            </div>

            <div className="grid gap-2">
              <label
                className="text-xs font-semibold uppercase tracking-widest text-[var(--text-kicker)]"
                htmlFor="calculator-deck-input"
              >
                Deck List
              </label>
              <textarea
                className="min-h-[320px] w-full rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3 text-sm leading-6 text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
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
              <Button disabled={!analysis || isExporting} onClick={handleExport} variant="secondary">
                {isExporting ? "Generating..." : "Share PNG"}
              </Button>
            </div>

            {showStatus ? (
              <section className={statusClassName}>
                {analysis ? (
                  <p className="text-sm leading-6 text-[var(--text-primary)]">
                    Parsed {analysis.cards.length} unique cards: {analysis.totals.Pokemon} Pokemon,{" "}
                    {analysis.totals.Trainer} Trainer, {analysis.totals.Energy} Energy,{" "}
                    {analysis.totals.deck} cards total.
                  </p>
                ) : null}

                {statusMessage ? (
                  <p className="mt-2 text-sm font-medium leading-6 text-[var(--text-primary)]">
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
              </section>
            ) : null}
          </div>

          <div className="grid gap-6 xl:border-l xl:border-[var(--border)] xl:pl-6">
            <section className="grid gap-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-kicker)]">
                  Deck Visual
                </p>
                <h2 className="text-xl font-bold text-[var(--text-primary)]">60-Card Graphic</h2>
              </div>
              {analysis ? (
                <DeckListVisualGrid cards={analysis.cards} />
              ) : (
                <p className="text-sm leading-6 text-[var(--text-muted)]">
                  Card images will appear here after calculation.
                </p>
              )}
            </section>

            <section className="grid gap-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-kicker)]">
                  Opening Hand Risk
                </p>
                <h2 className="text-xl font-bold text-[var(--text-primary)]">Mulligan Stats</h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
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
            </section>
          </div>
        </div>
      </Card>

      <Card>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="grid gap-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-kicker)]">
                Opening Hand Risk
              </p>
              <h2 className="text-xl font-bold text-[var(--text-primary)]">Mulligan Streak Calculator</h2>
              <p className="text-sm text-[var(--text-muted)]">
                {analysis
                  ? "Odds of repeated no-Basic opening hands."
                  : "Odds of repeated no-Basic opening hands will appear here after calculation."}
              </p>
            </div>

            {analysis ? (
              <>
                <p className="text-sm text-[var(--text-secondary)]">
                  Basics in deck: <strong>{analysis.basicPokemonCount}</strong> out of <strong>60</strong>{" "}
                  cards.
                </p>
                <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)]">
                  <div className="grid grid-cols-3 gap-4 border-b border-[var(--border)] px-4 py-3 text-xs font-semibold uppercase tracking-widest text-[var(--text-kicker)]">
                    <span>Streak</span>
                    <span>Exact</span>
                    <span>At Least</span>
                  </div>
                  <div className="divide-y divide-[var(--border)]">
                    {analysis.mulliganRows.map((row) => (
                      <div
                        className="grid grid-cols-3 gap-4 px-4 py-3 text-sm text-[var(--text-secondary)]"
                        key={row.streak}
                      >
                        <span className="font-semibold text-[var(--text-primary)]">{row.streak}x</span>
                        <span>{pct(row.exactThenPlayable)}</span>
                        <span>{pct(row.atLeast)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  Exact means that many mulligans, then your next hand is playable.
                </p>
              </>
            ) : (
              <p className="text-sm leading-6 text-[var(--text-muted)]">
                Calculate a deck list to populate mulligan streak probabilities.
              </p>
            )}
          </div>

          <StatCard
            detail="Single-hand chance of opening without a Basic Pokemon."
            label="Single-Hand Risk"
            value={summary.singleHandRisk}
          />
        </div>
      </Card>

      <Card>
        <div className="grid gap-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-kicker)]">
                Card Odds
              </p>
              <h2 className="text-xl font-bold text-[var(--text-primary)]">Setup and Prizing Detail</h2>
            </div>

            <div
              aria-label="Calculator views"
              className="inline-grid grid-cols-2 gap-1 rounded-full bg-[var(--bg-surface-alt)] p-1"
              role="tablist"
            >
              <button
                aria-selected={activeTab === "setup"}
                className={[
                  "rounded-full px-4 py-2 text-sm font-medium transition",
                  activeTab === "setup"
                    ? "bg-[var(--color-brand)] text-[var(--text-inverse)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]"
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
                  "rounded-full px-4 py-2 text-sm font-medium transition",
                  activeTab === "prizing"
                    ? "bg-[var(--color-brand)] text-[var(--text-inverse)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]"
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
            setupCards.length ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {setupCards.map((row) => (
                  <ProbabilityCard
                    card={row.card}
                    key={`${row.card.name}-${row.card.category}`}
                    stats={[
                      { label: "In Starting 7", value: pct(row.inStartingSeven) },
                      { label: "Only Starter", value: pct(row.onlyStarter) }
                    ]}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm leading-6 text-[var(--text-muted)]">
                No Pokemon cards were parsed for setup probabilities.
              </p>
            )
          ) : prizingCards.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {prizingCards.map((row) => (
                <ProbabilityCard
                  card={row.card}
                  key={`${row.card.name}-${row.card.category}`}
                  stats={[
                    { label: "None Prized", value: pct(row.nonePrized) },
                    { label: "1 Prized", value: pct(row.onePrized) },
                    { label: "2 Prized", value: pct(row.twoPrized) },
                    { label: "3+ Prized", value: pct(row.threePlusPrized) }
                  ]}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm leading-6 text-[var(--text-muted)]">
              No cards were parsed for prizing probabilities.
            </p>
          )}
        </div>
      </Card>
    </section>
  );
}

function ProbabilityCard({
  card,
  stats
}: {
  card: CalculatorCardGroup;
  stats: Array<{ label: string; value: string }>;
}) {
  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] p-4">
      <div className="flex gap-3">
        {card.category === "Pokemon" ? (
          <img
            alt=""
            className="h-10 w-10 shrink-0 object-contain"
            loading="lazy"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
            src={getPokemonSpriteUrl(card.name)}
          />
        ) : null}

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-base font-semibold text-[var(--text-primary)]">
              {card.count}x {card.name}
            </h4>
            <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
              {card.category === "Pokemon" && card.stage ? card.stage : card.category}
            </span>
          </div>
        </div>
      </div>

      <dl
        className={[
          "mt-4 grid gap-4",
          stats.length > 2 ? "grid-cols-2 xl:grid-cols-4" : "grid-cols-2"
        ].join(" ")}
      >
        {stats.map((stat) => (
          <div className="grid gap-1" key={stat.label}>
            <dt className="text-xs font-semibold uppercase tracking-widest text-[var(--text-kicker)]">
              {stat.label}
            </dt>
            <dd className="m-0 text-base font-semibold text-[var(--text-primary)]">{stat.value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
