"use client";

import { useState } from "react";

type DeckListCardProps = {
  name: string;
  count: number;
  imageUrl: string;
  fallbackImageUrl: string;
  cardUrl: string;
};

export function DeckListCard({
  name,
  count,
  imageUrl,
  fallbackImageUrl,
  cardUrl
}: DeckListCardProps) {
  const [src, setSrc] = useState(imageUrl);
  const [showPlaceholder, setShowPlaceholder] = useState(false);
  const [showCountFallback, setShowCountFallback] = useState(false);

  const badgeImageUrl = `https://limitless3.nyc3.cdn.digitaloceanspaces.com/decklist/${count}.png`;

  return (
    <a
      className="group relative block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-page)]"
      href={cardUrl}
      rel="noreferrer"
      target="_blank"
    >
      <div className="relative overflow-visible" style={{ aspectRatio: "0.715" }}>
        {showPlaceholder ? (
          <div className="flex h-full w-full items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-surface-alt)] p-1 text-center text-xs text-[var(--text-muted)]">
            {name}
          </div>
        ) : (
          <img
            alt={name}
            className="h-full w-full object-contain transition"
            style={{
              filter: "drop-shadow(0 2.5px 3.5px rgba(15,23,42,0.34)) drop-shadow(0 0.75px 1.5px rgba(15,23,42,0.22))"
            }}
            onError={() => {
              if (src !== fallbackImageUrl) {
                setSrc(fallbackImageUrl);
                return;
              }
              setShowPlaceholder(true);
            }}
            src={src}
          />
        )}

        {!showCountFallback ? (
          <img
            alt={`${count} copies`}
            loading="lazy"
            onError={() => setShowCountFallback(true)}
            src={badgeImageUrl}
            style={{
              position: "absolute",
              bottom: "0.55rem",
              left: "50%",
              transform: "translateX(-50%)",
              width: "min(46px, 38%)",
              height: "auto",
              zIndex: 1,
              pointerEvents: "none",
            }}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              bottom: "0.7rem",
              left: "50%",
              transform: "translateX(-50%)",
              background: "#0f172aeb",
              color: "#fff",
              borderRadius: "999px",
              minWidth: "2.15rem",
              padding: "0.28rem 0.55rem",
              fontSize: "0.78rem",
              fontWeight: 800,
              lineHeight: 1,
              zIndex: 1,
              pointerEvents: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {count}
          </div>
        )}
      </div>
    </a>
  );
}
