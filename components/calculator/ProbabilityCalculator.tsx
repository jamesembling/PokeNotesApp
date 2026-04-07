"use client";

import { useMemo, useState } from "react";
import styles from "@/components/calculator/ProbabilityCalculator.module.css";
import { DeckListVisualGrid } from "@/components/ui/DeckListVisualGrid";
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
    styles.status,
    analysis?.warnings.length || statusTone === "warn" ? styles.statusWarn : styles.statusInfo
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
    <section className={styles.calculatorShell}>
      <div className={styles.sectionCard}>
        <div className={styles.layout}>
          <div className={styles.sidebar}>
            <label className={styles.deckLabel} htmlFor="calculator-deck-input">
              Deck List
            </label>
            <textarea
              className={styles.textarea}
              id="calculator-deck-input"
              onChange={(event) => setDeckInput(event.target.value)}
              placeholder="paste your deck list here"
              spellCheck={false}
              value={deckInput}
            />

            <div className={styles.actions}>
              <button className={styles.button} onClick={() => runCalculation(deckInput)} type="button">
                Calculate
              </button>
              <button className={styles.button} onClick={handleSampleDeck} type="button">
                Load Sample Deck
              </button>
              <button className={styles.button} onClick={handleClear} type="button">
                Clear
              </button>
              <button
                className={styles.button}
                disabled={!analysis || isExporting}
                onClick={handleExport}
                type="button"
              >
                {isExporting ? "Generating..." : "Share PNG"}
              </button>
            </div>

            <div className={styles.statusWrap}>
              {showStatus ? (
                <section className={statusClassName}>
                  {analysis ? (
                    <p className={styles.statusSummary}>
                      Parsed {analysis.cards.length} unique cards: {analysis.totals.Pokemon} Pokemon,{" "}
                      {analysis.totals.Trainer} Trainer, {analysis.totals.Energy} Energy,{" "}
                      {analysis.totals.deck} cards total.
                    </p>
                  ) : null}

                  {statusMessage ? <p className={styles.statusMessage}>{statusMessage}</p> : null}

                  {analysis?.warnings.length ? (
                    <ul className={styles.statusList}>
                      {analysis.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              ) : (
                <div className={styles.statusSpacer} />
              )}
            </div>
          </div>

          <div className={styles.content}>
            <section className={styles.inlineSection}>
              <p className={styles.sectionEyebrow}>Deck Visual</p>
              <h3 className={styles.sectionTitle}>60-Card Graphic</h3>
              <div className={styles.sectionBody}>
                {analysis ? (
                  <DeckListVisualGrid cards={analysis.cards} />
                ) : (
                  <p className={styles.emptyCopy}>
                    Card images will appear here after calculation.
                  </p>
                )}
              </div>
            </section>

            <section className={styles.inlineSection}>
              <p className={styles.sectionEyebrow}>Opening Hand Risk</p>
              <h3 className={styles.sectionTitle}>Mulligan Stats</h3>
              <div className={styles.summaryGrid}>
                <SummaryMetric label="Mulligan Rate" value={summary.mulligan} />
                <SummaryMetric label="Starting With 1 Basic" value={summary.oneBasic} />
                <SummaryMetric label="Starting With 2+ Basic" value={summary.twoBasics} />
              </div>
            </section>

            <section className={styles.inlineSection}>
              <div className={styles.streakHeader}>
                <div>
                  <p className={styles.sectionEyebrow}>Opening Hand Risk</p>
                  <h3 className={styles.sectionTitle}>Mulligan Streak Calculator</h3>
                  <p className={styles.sectionDescription}>
                    {analysis
                      ? "Odds of repeated no-Basic opening hands."
                      : "Odds of repeated no-Basic opening hands will appear here after calculation."}
                  </p>
                </div>
                <div className={styles.streakRisk}>
                  <p className={styles.sectionEyebrow}>Single-Hand Risk</p>
                  <p className={styles.riskValue}>{summary.singleHandRisk}</p>
                </div>
              </div>

              {analysis ? (
                <>
                  <p className={styles.metaLine}>
                    Basics in deck: <strong>{analysis.basicPokemonCount}</strong> out of <strong>60</strong>{" "}
                    cards.
                  </p>
                  <div className={styles.table}>
                    <div className={styles.tableHeader}>
                      <span>Streak</span>
                      <span>Exact</span>
                      <span>At Least</span>
                    </div>
                    {analysis.mulliganRows.map((row) => (
                      <div className={styles.tableRow} key={row.streak}>
                        <span className={styles.tableLead}>{row.streak}x</span>
                        <span>{pct(row.exactThenPlayable)}</span>
                        <span>{pct(row.atLeast)}</span>
                      </div>
                    ))}
                  </div>
                  <p className={styles.metaLine}>
                    Exact means that many mulligans, then your next hand is playable.
                  </p>
                </>
              ) : null}
            </section>
          </div>
        </div>

        <div className={styles.bottomPanel}>
          <div className={styles.tabs} role="tablist" aria-label="Calculator views">
            <button
              aria-selected={activeTab === "setup"}
              className={[styles.tabButton, activeTab === "setup" ? styles.tabButtonActive : ""]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setActiveTab("setup")}
              role="tab"
              type="button"
            >
              Setup
            </button>
            <button
              aria-selected={activeTab === "prizing"}
              className={[styles.tabButton, activeTab === "prizing" ? styles.tabButtonActive : ""]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setActiveTab("prizing")}
              role="tab"
              type="button"
            >
              Prizing
            </button>
          </div>

          {activeTab === "setup" ? (
            setupCards.length ? (
              <div className={styles.cardGrid}>
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
              <p className={styles.emptyCopy}>No Pokemon cards were parsed for setup probabilities.</p>
            )
          ) : prizingCards.length ? (
            <div className={styles.cardGrid}>
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
            <p className={styles.emptyCopy}>No cards were parsed for prizing probabilities.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.summaryMetric}>
      <p className={styles.metricLabel}>{label}</p>
      <p className={styles.metricValue}>{value}</p>
    </div>
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
    <article className={styles.probabilityCard}>
      <div className={styles.cardIdentity}>
        {card.category === "Pokemon" ? (
          <img
            alt=""
            className={styles.sprite}
            loading="lazy"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
            src={getPokemonSpriteUrl(card.name)}
          />
        ) : null}

        <div className={styles.cardText}>
          <div className={styles.cardHeading}>
            <h4 className={styles.cardName}>
              {card.count}x {card.name}
            </h4>
            {card.category === "Pokemon" && card.stage ? (
              <span
                className={[
                  styles.tag,
                  card.stage === "Basic"
                    ? styles.tagBasic
                    : card.stage === "Stage 1"
                      ? styles.tagStageOne
                      : styles.tagStageTwo
                ].join(" ")}
              >
                {card.stage}
              </span>
            ) : (
              <span className={styles.categoryTag}>{card.category}</span>
            )}
          </div>
        </div>
      </div>

      <dl className={stats.length > 2 ? styles.detailGridWide : styles.detailGrid}>
        {stats.map((stat) => (
          <div className={styles.detailItem} key={stat.label}>
            <dt className={styles.detailLabel}>{stat.label}</dt>
            <dd className={styles.detailValue}>{stat.value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
