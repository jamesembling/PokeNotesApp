import Image from "next/image";

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
      className="group relative block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      href={cardUrl}
      rel="noreferrer"
      target="_blank"
    >
      <div className="relative overflow-visible" style={{ aspectRatio: "0.715" }}>
        <div className="absolute inset-0 rounded-lg border border-border bg-muted" />
        <Image
          alt={name}
          fill
          className="relative h-full w-full object-contain transition"
          sizes="(max-width: 640px) 22vw, (max-width: 1024px) 16vw, 120px"
          src={imageUrl}
          style={{
            filter: "drop-shadow(0 2.5px 3.5px rgba(15,23,42,0.34)) drop-shadow(0 0.75px 1.5px rgba(15,23,42,0.22))"
          }}
        />
        <Image
          alt={`${count} copies`}
          height={46}
          sizes="46px"
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
          width={46}
        />
      </div>
    </a>
  );
}
