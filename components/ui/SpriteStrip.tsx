"use client";

type SpriteStripProps = {
  sprites: string[];
  size: "sm" | "md" | "lg";
  maxVisible?: number;
  className?: string;
};

const sizeClasses: Record<SpriteStripProps["size"], string> = {
  sm: "h-6 w-6",
  md: "h-8 w-8",
  lg: "h-9 w-9 sm:h-11 sm:w-11"
};

const sizeValues: Record<SpriteStripProps["size"], number> = {
  sm: 24,
  md: 32,
  lg: 44
};

export function SpriteStrip({ sprites, size, maxVisible = 2, className }: SpriteStripProps) {
  const visibleSprites = sprites.slice(0, maxVisible);
  const stripClassName = ["flex items-center gap-0.5", className].filter(Boolean).join(" ");

  if (visibleSprites.length === 0) {
    return (
      <div className={stripClassName}>
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
    <div className={stripClassName}>
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
