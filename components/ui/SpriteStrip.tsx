"use client";

import Image from "next/image";
import { useState } from "react";

type SpriteStripProps = {
  sprites: string[];
  size: "sm" | "md" | "lg";
  maxVisible?: number;
  className?: string;
};

const sizeClasses: Record<SpriteStripProps["size"], string> = {
  sm: "h-8 w-8",
  md: "h-8 w-8",
  lg: "h-9 w-9 sm:h-11 sm:w-11"
};

const sizeValues: Record<SpriteStripProps["size"], number> = {
  sm: 32,
  md: 32,
  lg: 44
};

function prettifyPokemonSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function SpriteStripItem({
  slug,
  size
}: {
  slug: string;
  size: SpriteStripProps["size"];
}) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div
        aria-label={prettifyPokemonSlug(slug)}
        className={[
          "flex items-center justify-center rounded-full bg-[var(--bg-surface-alt)] px-1 text-center font-semibold leading-tight text-[var(--text-muted)]",
          size === "lg" ? "text-[9px]" : "text-[8px]",
          sizeClasses[size]
        ].join(" ")}
      >
        {prettifyPokemonSlug(slug)}
      </div>
    );
  }

  const src = `https://r2.limitlesstcg.net/pokemon/gen9/${slug}.png`;

  return (
    <Image
      alt={prettifyPokemonSlug(slug)}
      className={[sizeClasses[size], "object-contain"].join(" ")}
      height={sizeValues[size]}
      onError={(event) => {
        setHasError(true);
      }}
      sizes={`${sizeValues[size]}px`}
      src={src}
      width={sizeValues[size]}
    />
  );
}

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
        return (
          <SpriteStripItem key={`${slug}-${index}`} size={size} slug={slug} />
        );
      })}
    </div>
  );
}
