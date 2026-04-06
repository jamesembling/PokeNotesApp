type DeckListCardProps = {
  name: string;
  count: number;
  imageUrl: string;
  cardUrl: string;
};

export function DeckListCard({
  name,
  count,
  imageUrl,
  cardUrl
}: DeckListCardProps) {
  const badgeImageUrl = `https://limitless3.nyc3.cdn.digitaloceanspaces.com/decklist/${count}.png`;

  return (
    <a
      className="group relative block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-page)]"
      href={cardUrl}
      rel="noreferrer"
      target="_blank"
    >
      <div className="relative overflow-visible" style={{ aspectRatio: "0.715" }}>
        <div className="absolute inset-0 rounded-lg border border-[var(--border)] bg-[var(--bg-surface-alt)]" />
        <img
          alt={name}
          className="relative h-full w-full object-contain transition"
          decoding="async"
          loading="lazy"
          src={imageUrl}
          style={{
            filter: "drop-shadow(0 2.5px 3.5px rgba(15,23,42,0.34)) drop-shadow(0 0.75px 1.5px rgba(15,23,42,0.22))"
          }}
        />
        <img
          alt={`${count} copies`}
          decoding="async"
          loading="lazy"
          src={badgeImageUrl}
          style={{
            position: "absolute",
            bottom: "0.55rem",
            left: "50%",
            transform: "translateX(-50%)",
            width: "min(46px, 38%)",
            height: "auto",
            zIndex: 1,
            pointerEvents: "none"
          }}
        />
      </div>
    </a>
  );
}
