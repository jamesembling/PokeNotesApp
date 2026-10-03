import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageWidth } from "@/components/ui/PageWidth";
import { ItemTitle } from "@/components/ui/Typography";
import { requireUser } from "@/lib/auth";
import { getBattleLogOpponentDisplayName } from "@/lib/battle-log/display";
import { formatAppCalendarDate } from "@/lib/date-time";
import { getLogsWindow } from "@/lib/db/logs";
import styles from "./replays.module.css";

export const metadata: Metadata = { title: "Battle Replay (Beta) | Poke Notes" };

export default async function ReplaysPage({ searchParams }: {
  searchParams: Promise<{ cursor?: string | string[] }>;
}) {
  const [user, query] = await Promise.all([requireUser(), searchParams]);
  const requestedCursor = Array.isArray(query.cursor) ? query.cursor[0] : query.cursor;
  const cursor = requestedCursor && requestedCursor.length <= 512 ? requestedCursor : undefined;
  const window = await getLogsWindow(user.id, { cursor, limit: 30 });

  return <PageWidth size="standard">
    <PageHeader
      action={<Button asChild variant="outline"><Link href="/logs" prefetch={false}>Battle Logs</Link></Button>}
      breadcrumb={[{ label: "Poke Notes", href: "/dashboard" }, { label: "Battle Replay" }]}
      subtitle="Choose one of your saved Battle Logs to replay. This beta shows recorded actions and marks anything it cannot reconstruct."
      title="Battle Replay"
      variant="collection"
    />
    <section aria-label="Your Battle Logs" className={styles.collection}>
      {window.logs.length ? window.logs.map(log => <Link className={styles.row} href={`/replays/${encodeURIComponent(log.id)}`} key={log.id} prefetch={false}>
        <div className={styles.identity}>
          <ItemTitle as="h2">{getBattleLogOpponentDisplayName(log.selfDeckName, log.selfDeckSprites)} versus {getBattleLogOpponentDisplayName(log.opponentDeckName, log.opponentDeckSprites)}</ItemTitle>
          <p className={styles.meta}><time dateTime={log.date}>{formatAppCalendarDate(log.date)}</time><span>{log.result}</span><span>{log.format}</span><span>{log.totalTurns} turns</span></p>
        </div>
        <span className={styles.open}>Replay<ArrowRightIcon aria-hidden="true" size={18} /></span>
      </Link>) : <div className={styles.empty}>
        <ItemTitle as="h2">No Battle Logs to replay</ItemTitle>
        <p>Save a Battle Log from Pokémon TCG Live to start your first replay.</p>
        <Button asChild variant="outline"><Link href="/logs" prefetch={false}>Go to Battle Logs</Link></Button>
      </div>}
    </section>
    <nav aria-label="Battle Replay pages" className={styles.pagination}>
      {cursor ? <Button asChild variant="outline"><Link href="/replays" prefetch={false}>Latest games</Link></Button> : null}
      {window.hasMore && window.nextWindowEndDate ? <Button asChild variant="outline"><Link href={`/replays?${new URLSearchParams({ cursor: window.nextWindowEndDate })}`} prefetch={false}>Older games</Link></Button> : null}
    </nav>
  </PageWidth>;
}
