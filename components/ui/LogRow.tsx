"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import type { BattleLogSummary } from "@/types/index";

type LogRowProps = {
  log: BattleLogSummary;
};

function formatLogDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(`${date}T00:00:00`));
}

function SpriteImage({ slug, alt }: { slug: string; alt: string }) {
  const src = `https://r2.limitlesstcg.net/pokemon/gen9/${slug}.png`;

  return (
    <img
      alt={alt}
      className="h-8 w-8 object-contain"
      height={32}
      loading="lazy"
      onError={(event) => {
        event.currentTarget.style.display = "none";
      }}
      src={src}
      width={32}
    />
  );
}

export function LogRow({ log }: LogRowProps) {
  const rowClasses =
    log.result === "Win"
      ? "border-[var(--color-win-border)] bg-[var(--color-win-bg)]"
      : "border-[var(--color-loss-border)] bg-[var(--color-loss-bg)]";

  const selfSprites = log.selfDeckSprites.slice(0, 2);
  const opponentSprite = log.opponentDeckSprites[0];
  const opponentDeckName = log.opponentDeckName || "Unknown Deck";

  return (
    <Link
      className={[
        "flex items-center gap-4 rounded-xl border p-4 transition hover:translate-y-[-1px]",
        rowClasses
      ].join(" ")}
      href={`/logs/${log.id}`}
    >
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        {selfSprites.length > 0 ? (
          selfSprites.map((slug, index) => (
            <SpriteImage
              alt={`${log.selfDeckName} sprite`}
              key={`${log.id}-${slug}-${index}`}
              slug={slug}
            />
          ))
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg-surface)] text-xs text-[var(--text-muted)]">
            -
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
          {log.result} vs {opponentDeckName}
        </p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {formatLogDate(log.date)} · Go {log.goOrder || "Unknown"}
        </p>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <Badge>{log.goOrder || "Unknown"}</Badge>
        {opponentSprite ? (
          <SpriteImage alt={`${opponentDeckName} sprite`} slug={opponentSprite} />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg-surface)] text-xs text-[var(--text-muted)]">
            -
          </div>
        )}
      </div>
    </Link>
  );
}
