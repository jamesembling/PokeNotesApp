"use client";

import Image from "next/image";
import { useState } from "react";
import { buildPokemonSpriteUrlFromSlug, findPokemonOptionBySlug, prettifyPokemonSlug } from "@/lib/pokemon/sprites";
import { usePokemonOptions } from "@/lib/pokemon/use-pokemon-options";

type SpriteStripProps = {
  sprites: string[];
  size: "sm" | "md" | "lg" | "xl";
  maxVisible?: number;
  className?: string;
};

const sizeClasses: Record<SpriteStripProps["size"], string> = {
  sm: "h-8 w-8",
  md: "h-8 w-8",
  lg: "h-10 w-10 sm:h-12 sm:w-12",
  xl: "h-12 w-12 sm:h-14 sm:w-14"
};

const sizeValues: Record<SpriteStripProps["size"], number> = {
  sm: 32,
  md: 32,
  lg: 48,
  xl: 56
};

function SpriteStripItem({
  slug,
  src,
  size
}: {
  slug: string;
  src?: string;
  size: SpriteStripProps["size"];
}) {
  const [hasError, setHasError] = useState(false);

  if (hasError || !src) {
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
  const pokemonOptions = usePokemonOptions();
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
        const matchedOption = findPokemonOptionBySlug(slug, pokemonOptions ?? undefined);
        return (
          <SpriteStripItem
            key={`${slug}-${index}`}
            size={size}
            slug={slug}
            src={matchedOption?.spriteUrl || buildPokemonSpriteUrlFromSlug(slug) || undefined}
          />
        );
      })}
    </div>
  );
}
