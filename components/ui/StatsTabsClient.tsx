"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import { Tabs, TabsContent } from "@/components/shadcn/tabs";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SectionTitle } from "@/components/ui/Typography";
import { PerformanceChart } from "@/components/ui/stats/PerformanceChart";
import { getRecentPerformance } from "@/lib/stats/performance";
import type { ArchetypeMatchupStats, LogDamageTimelinePoint, LogStatsOverview } from "@/lib/db/logs";
import styles from "@/components/ui/stats/stats.module.css";

const StatsMatchups = dynamic(
  () => import("@/components/ui/stats/StatsMatchups").then((module) => module.StatsMatchups),
  { loading: () => <MatchupsLoading /> }
);
const number = new Intl.NumberFormat("en-GB");
const decimal = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
const metric = (value: number) => number.format(value);
const rate = (wins: number, losses: number) => wins + losses > 0 ? Math.round(wins / (wins + losses) * 100) : null;

type Props = {
  damageTimeline: LogDamageTimelinePoint[];
  matchups?: ArchetypeMatchupStats[];
  overview: LogStatsOverview;
};

function MatchupsLoading() {
  return <div className={styles.loading} role="status">Loading your matchup record…</div>;
}

function PerformanceOverview({ damageTimeline, overview }: Pick<Props, "damageTimeline" | "overview">) {
  const recent = useMemo(() => getRecentPerformance(damageTimeline, overview.gamesPlayed), [damageTimeline, overview.gamesPlayed]);
  const winRate = rate(overview.gamesWon, overview.gamesLost);
  const unknownResults = Math.max(0, overview.gamesPlayed - overview.gamesWon - overview.gamesLost);
  const damageDifference = overview.attackDamage - overview.opponentAttackDamage;
  const opponentPrizesTaken = overview.trackedPrizes - overview.prizesTaken;
  const perGame = (value: number) => overview.gamesPlayed ? decimal.format(value / overview.gamesPlayed) : "—";
  const tossRate = rate(overview.coinFlipsWon, overview.coinFlipsLost);

  if (overview.gamesPlayed === 0) {
    return (
      <section className={styles.empty}>
        <SectionTitle size="lg">Your next game starts the story.</SectionTitle>
        <p>Import a Battle Log to see your results, recent form, and the matchups that shape your record.</p>
        <Button asChild><Link href="/logs" prefetch={false}>Go to Battle Logs <ArrowUpRight aria-hidden="true" className="size-4" /></Link></Button>
      </section>
    );
  }

  return (
    <>
      <section aria-label="Performance overview" className={styles.performance}>
        <div className={styles.record} data-wide-counts={overview.gamesPlayed >= 1000}>
          <SectionTitle className={styles.sectionHeading}>Your record</SectionTitle>
          <p className={styles.winRate} aria-label={winRate === null ? "No recorded results" : `${winRate}% win rate`}>
            {winRate ?? "—"}{winRate !== null && <span>%</span>}
          </p>
          <p className={styles.rateLabel}>All-time win rate</p>
          <dl className={styles.recordNumbers}>
            <div><dt>Won</dt><dd>{metric(overview.gamesWon)}</dd></div>
            <div><dt>Lost</dt><dd>{metric(overview.gamesLost)}</dd></div>
            <div><dt>Played</dt><dd>{metric(overview.gamesPlayed)}</dd></div>
          </dl>
          {unknownResults > 0 && <p className={styles.note}>{metric(unknownResults)} without a recorded result</p>}
          <Link className={styles.textLink} href="/logs" prefetch={false}>Review Battle Logs <ArrowUpRight aria-hidden="true" size={16} /></Link>
        </div>
        <PerformanceChart performance={recent} allTimeWinRate={winRate} />
        <div className={styles.recentStrip}>
          <div className={styles.recentLabel}><span>Latest results</span><span>Oldest to newest</span></div>
          {recent.recentResults.length ? (
            <ol className={styles.results} aria-label="Latest game results, oldest to newest">
              {recent.recentResults.map((game) => (
                <li key={game.gameNumber} data-result={game.result ?? "unknown"} title={`Game ${game.gameNumber}: ${game.result ?? "No result"}`}>
                  <span aria-hidden="true">{game.result === "Win" ? "W" : game.result === "Loss" ? "L" : "—"}</span>
                  <span className="sr-only">Game {game.gameNumber}: {game.result ?? "No result"}</span>
                </li>
              ))}
            </ol>
          ) : <p className={styles.note}>Recent game history is unavailable.</p>}
          <span className={styles.recentCount}>{recent.recentResults.length} games</span>
        </div>
      </section>

      <div className={styles.detailsHeading}>
        <SectionTitle size="lg">Inside the games</SectionTitle>
        <span>All-time totals & averages</span>
      </div>
      <div className={styles.details}>
        <section className={styles.detailSection} aria-labelledby="stats-damage">
          <SectionTitle as="h3" id="stats-damage" className={styles.sectionHeading}>Damage exchange</SectionTitle>
          <p className={styles.detailLead}>{damageDifference > 0 ? "+" : damageDifference < 0 ? "−" : ""}{metric(Math.abs(damageDifference))}</p>
          <p className={styles.detailCaption}>Attack damage differential</p>
          <dl className={styles.detailRows}>
            <div><dt>You dealt</dt><dd>{metric(overview.attackDamage)}</dd></div>
            <div><dt>Opponents dealt</dt><dd>{metric(overview.opponentAttackDamage)}</dd></div>
            <div><dt>You dealt per game</dt><dd>{perGame(overview.attackDamage)}</dd></div>
          </dl>
        </section>
        <section className={styles.detailSection} aria-labelledby="stats-prizes">
          <SectionTitle as="h3" id="stats-prizes" className={styles.sectionHeading}>Prize taking</SectionTitle>
          <p className={styles.detailLead}>{perGame(overview.prizesTaken)}</p>
          <p className={styles.detailCaption}>Your prizes per game</p>
          <dl className={styles.detailRows}>
            <div><dt>Your prizes taken</dt><dd>{metric(overview.prizesTaken)}</dd></div>
            <div><dt>Opponents’ prizes taken</dt><dd>{metric(opponentPrizesTaken)}</dd></div>
            <div><dt>Opponents’ prizes per game</dt><dd>{perGame(opponentPrizesTaken)}</dd></div>
          </dl>
        </section>
        <section className={styles.detailSection} aria-labelledby="stats-openings">
          <SectionTitle as="h3" id="stats-openings" className={styles.sectionHeading}>Opening hands</SectionTitle>
          <p className={styles.detailLead}>{tossRate ?? "—"}{tossRate !== null && <span>%</span>}</p>
          <p className={styles.detailCaption}>Opening coin tosses won</p>
          <dl className={styles.detailRows}>
            <div><dt>Coin tosses won / lost</dt><dd>{metric(overview.coinFlipsWon)} / {metric(overview.coinFlipsLost)}</dd></div>
            <div><dt>Your mulligans</dt><dd>{metric(overview.mulligansTaken)}</dd></div>
            <div><dt>Your mulligans per game</dt><dd>{perGame(overview.mulligansTaken)}</dd></div>
          </dl>
        </section>
      </div>
      <footer className={styles.methodology}>
        <details>
          <summary>How these numbers are calculated</summary>
          <p>Stats come from your saved Battle Logs across all Deck Strategies. Win rates use games with a recorded win or loss; unknown results are excluded. Recent form uses a moving window of up to 20 games, with at most the latest 50 points shown. Coin toss rates exclude unknown tosses. Per-game averages divide recorded totals by all saved games, including concessions and games with incomplete detail. Attack damage does not include damage counters.</p>
          {recent.isTruncated && <p>Recent history is limited to the latest {metric(recent.loadedGames)} of {metric(overview.gamesPlayed)} games. The all-time totals above still include your complete record.</p>}
        </details>
      </footer>
    </>
  );
}

export function StatsTabsClient({ damageTimeline, matchups: initialMatchups, overview }: Props) {
  const [activeTab, setActiveTab] = useState("overview");
  const [matchups, setMatchups] = useState(initialMatchups ?? null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (activeTab !== "matchups" || matchups !== null) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/stats-matchups", { cache: "no-store", credentials: "same-origin", signal: controller.signal });
        const payload = await response.json();
        if (!response.ok || !Array.isArray(payload.matchups)) throw new Error("Could not load your matchup record.");
        if (!controller.signal.aborted) setMatchups(payload.matchups);
      } catch {
        if (!controller.signal.aborted) setError("Your matchup record couldn’t be loaded. Please try again.");
      }
    }
    void load();
    return () => controller.abort();
  }, [activeTab, matchups, attempt]);

  return (
    <Tabs className={styles.root} onValueChange={(value) => { setError(""); setActiveTab(value); }} value={activeTab}>
      <div className={styles.navigation}>
        <SegmentedControl appearance="line" ariaLabel="Stats sections" options={[{ value: "overview", label: "Overview" }, { value: "matchups", label: "Matchups" }]} />
      </div>
      <TabsContent className={styles.tabContent} value="overview"><PerformanceOverview damageTimeline={damageTimeline} overview={overview} /></TabsContent>
      <TabsContent className={styles.tabContent} value="matchups">
        {error ? <div className={styles.loading} role="alert"><p>{error}</p><Button onClick={() => { setError(""); setAttempt((value) => value + 1); }} variant="outline">Try again</Button></div>
          : matchups === null ? <MatchupsLoading /> : <StatsMatchups matchups={matchups} />}
      </TabsContent>
    </Tabs>
  );
}
