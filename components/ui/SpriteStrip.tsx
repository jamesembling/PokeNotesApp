"use client";

type SpriteStripProps = {
  sprites: string[];
  size: "sm" | "md";
  maxVisible?: number;
};

const sizeClasses: Record<SpriteStripProps["size"], string> = {
  sm: "h-8 w-8",
  md: "h-12 w-12"
};

const sizeValues: Record<SpriteStripProps["size"], number> = {
  sm: 32,
  md: 48
};

export function SpriteStrip({ sprites, size, maxVisible = 2 }: SpriteStripProps) {
  const visibleSprites = sprites.slice(0, maxVisible);

  if (visibleSprites.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <div
          className={[
            "flex items-center justify-center rounded-full bg-[var(--bg-surface-alt)] text-xs text-[var(--text-muted)]",
            sizeClasses[size]
          ].join(" ")}
        >
          -
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {visibleSprites.map((slug, index) => {
        const src = `https://r2.limitlesstcg.net/pokemon/gen9/${slug}.png`;

        return (
          <img
            alt=""
            aria-hidden="true"
            className={[sizeClasses[size], "object-contain"].join(" ")}
            height={sizeValues[size]}
            key={`${slug}-${index}`}
            loading="lazy"
            onError={(event) => {
              event.currentTarget.remove();
            }}
            src={src}
            width={sizeValues[size]}
          />
        );
      })}
    </div>
  );
}
