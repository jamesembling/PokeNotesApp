"use client";

import Image from "next/image";
import { useState } from "react";
import { buildPokemonSpriteUrlFromSlug, findPokemonOptionBySlug, prettifyPokemonSlug } from "@/lib/pokemon/sprites";
import type { PokemonOption } from "@/types/index";

type SpriteStripProps = {
  sprites: string[];
  size: "xs" | "sm" | "md" | "lg" | "xl";
  maxVisible?: number;
  className?: string;
  pokemonOptions?: PokemonOption[] | null;
};

const sizeClasses: Record<SpriteStripProps["size"], string> = {
  xs: "h-5 w-5",
  sm: "h-8 w-8",
  md: "h-8 w-8",
  lg: "h-10 w-10 sm:h-12 sm:w-12",
  xl: "h-12 w-12 sm:h-14 sm:w-14"
};

const sizeValues: Record<SpriteStripProps["size"], number> = {
  xs: 20,
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
          "flex shrink-0 items-center justify-center rounded-full bg-muted px-1 text-center font-semibold leading-tight text-muted-foreground",
          size === "lg" ? "text-[9px]" : size === "xs" ? "text-[7px]" : "text-[8px]",
          sizeClasses[size]
        ].join(" ")}
      >
        <span aria-hidden="true">{prettifyPokemonSlug(slug).slice(0, 3)}</span>
      </div>
    );
  }

  return (
    <span className={["relative block shrink-0", sizeClasses[size]].join(" ")}>
      <Image
        alt={prettifyPokemonSlug(slug)}
        className="h-full w-full object-contain"
        height={sizeValues[size]}
        onError={() => {
          setHasError(true);
        }}
        sizes={`${sizeValues[size]}px`}
        src={src}
        style={{ height: "100%", width: "100%" }}
        unoptimized
        width={sizeValues[size]}
      />
    </span>
  );
}

type SpriteStripContentProps = Omit<SpriteStripProps, "pokemonOptions"> & {
  pokemonOptions?: PokemonOption[] | null;
};

function SpriteStripContent({
  sprites,
  size,
  maxVisible = 2,
  className,
  pokemonOptions
}: SpriteStripContentProps) {
  const visibleSprites = sprites.slice(0, maxVisible);
  const stripClassName = ["flex items-center gap-0.5", className].filter(Boolean).join(" ");

  if (visibleSprites.length === 0) {
    return (
      <div className={stripClassName}>
        <div
          className={[
            "flex shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground",
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

export function SpriteStrip({ pokemonOptions, ...props }: SpriteStripProps) {
  return <SpriteStripContent {...props} pokemonOptions={pokemonOptions ?? null} />;
}
