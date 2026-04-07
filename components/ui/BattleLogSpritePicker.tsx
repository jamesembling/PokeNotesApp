"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { prettifyPokemonSlug } from "@/lib/battle-log/display";
import type { PokemonOption } from "@/types/index";

type BattleLogSpritePickerProps = {
  title: string;
  detectedLabel?: string;
  sprites: string[];
  onChange: (nextSprites: string[]) => void;
  pokemonOptions: PokemonOption[];
};

function SpriteThumb({ slug }: { slug: string }) {
  const [hasError, setHasError] = useState(false);

  if (!slug) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--bg-surface)] text-xs text-[var(--text-muted)]">
        -
      </div>
    );
  }

  if (hasError) {
    return (
      <div
        aria-label={prettifyPokemonSlug(slug)}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--bg-surface)] px-1 text-center text-[10px] font-semibold leading-tight text-[var(--text-muted)]"
      >
        {prettifyPokemonSlug(slug)}
      </div>
    );
  }

  return (
    <img
      alt={prettifyPokemonSlug(slug)}
      className="h-12 w-12 shrink-0 object-contain"
      height={48}
      loading="lazy"
      onError={(event) => {
        event.currentTarget.style.display = "none";
        setHasError(true);
      }}
      src={`https://r2.limitlesstcg.net/pokemon/gen9/${slug}.png`}
      width={48}
    />
  );
}

function buildOptionsForSlot(
  currentSlug: string,
  allSelected: string[],
  pokemonOptions: PokemonOption[]
) {
  return pokemonOptions.filter(
    (option) => option.slug === currentSlug || !allSelected.includes(option.slug)
  );
}

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase();
}

function getSearchRank(option: PokemonOption, normalizedQuery: string) {
  if (!normalizedQuery) {
    return null;
  }

  const normalizedLabel = option.label.toLowerCase();
  const normalizedSlug = option.slug.replace(/-/g, " ").toLowerCase();
  const normalizedCompactSlug = option.slug.toLowerCase();

  if (
    normalizedLabel === normalizedQuery ||
    normalizedSlug === normalizedQuery ||
    normalizedCompactSlug === normalizedQuery
  ) {
    return 0;
  }

  if (
    normalizedLabel.startsWith(normalizedQuery) ||
    normalizedSlug.startsWith(normalizedQuery) ||
    normalizedCompactSlug.startsWith(normalizedQuery)
  ) {
    return 1;
  }

  if (
    normalizedLabel.split(/\s+/).some((part) => part.startsWith(normalizedQuery)) ||
    normalizedSlug.split(/\s+/).some((part) => part.startsWith(normalizedQuery))
  ) {
    return 2;
  }

  if (
    normalizedLabel.includes(normalizedQuery) ||
    normalizedSlug.includes(normalizedQuery) ||
    normalizedCompactSlug.includes(normalizedQuery)
  ) {
    return 3;
  }

  return null;
}

function findBestSearchMatch(options: PokemonOption[], query: string) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) {
    return null;
  }

  const exactMatch =
    options.find((option) => normalizeSearchValue(option.label) === normalizedQuery) ??
    options.find(
      (option) => normalizeSearchValue(option.slug.replace(/-/g, " ")) === normalizedQuery
    ) ??
    options.find((option) => normalizeSearchValue(option.slug) === normalizedQuery);

  if (exactMatch) {
    return exactMatch;
  }

  const filteredOptions = options.filter(
    (option) => getSearchRank(option, normalizedQuery) !== null
  );
  return filteredOptions.length === 1 ? filteredOptions[0] : null;
}

function updateSpritesAtIndex(currentSprites: string[], index: number, nextSlug: string) {
  const nextSprites = [...currentSprites];

  if (!nextSlug) {
    nextSprites.splice(index, 1);
    return nextSprites.slice(0, 2);
  }

  nextSprites[index] = nextSlug;
  return nextSprites
    .filter(Boolean)
    .slice(0, 2);
}

function swapSpritePositions(currentSprites: string[]) {
  const [first = "", second = ""] = currentSprites;
  return [second, first].filter(Boolean);
}

function SpriteSearchSlot({
  currentSlug,
  index,
  onChange,
  pokemonOptions,
  sprites,
  title
}: {
  currentSlug: string;
  index: number;
  onChange: (nextSprites: string[]) => void;
  pokemonOptions: PokemonOption[];
  sprites: string[];
  title: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const slotOptions = useMemo(
    () => buildOptionsForSlot(currentSlug, sprites, pokemonOptions),
    [currentSlug, pokemonOptions, sprites]
  );

  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalizeSearchValue(query);

    if (!normalizedQuery) {
      return [];
    }

    return slotOptions
      .map((option) => ({
        option,
        rank: getSearchRank(option, normalizedQuery)
      }))
      .filter(
        (entry): entry is { option: PokemonOption; rank: number } => entry.rank !== null
      )
      .sort((left, right) => {
        if (left.rank !== right.rank) {
          return left.rank - right.rank;
        }

        return left.option.label.localeCompare(right.option.label);
      })
      .slice(0, 8)
      .map((entry) => entry.option);
  }, [query, slotOptions]);

  function commitQuerySelection(preferredSlug?: string) {
    const nextOption =
      (preferredSlug ? slotOptions.find((option) => option.slug === preferredSlug) : null) ??
      findBestSearchMatch(slotOptions, query);

    if (!nextOption) {
      return false;
    }

    onChange(updateSpritesAtIndex(sprites, index, nextOption.slug));
    setQuery("");
    setIsOpen(false);
    return true;
  }

  useEffect(() => {
    if (!currentSlug) {
      return;
    }

    setQuery("");
  }, [currentSlug]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  return (
    <div
      className="relative flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3"
      key={`${title}-${index}`}
      ref={containerRef}
    >
      <SpriteThumb slug={currentSlug} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[var(--text-primary)]">
              {currentSlug ? prettifyPokemonSlug(currentSlug) : "No Pokemon selected"}
            </p>
          </div>
          {currentSlug ? (
            <button
              className="text-sm font-medium text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
              onClick={() => onChange(updateSpritesAtIndex(sprites, index, ""))}
              type="button"
            >
              ×
            </button>
          ) : null}
        </div>

        <div className="relative mt-2">
          <input
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
            onBlur={() => {
              commitQuerySelection();
              setIsOpen(false);
            }}
            onChange={(event) => {
              setQuery(event.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                if (commitQuerySelection(filteredOptions[0]?.slug)) {
                  event.preventDefault();
                  return;
                }
              }

              if (event.key === "Escape") {
                setIsOpen(false);
              }
            }}
            placeholder={currentSlug ? "Search to replace Pokemon" : "Search Pokemon"}
            spellCheck={false}
            value={query}
          />

          {isOpen && normalizeSearchValue(query) ? (
            <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-[var(--shadow-lg)]">
              {filteredOptions.length > 0 ? (
                <div className="max-h-64 overflow-y-auto py-2">
                  {filteredOptions.map((option) => (
                    <button
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[var(--bg-surface-alt)]"
                      key={option.slug}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        commitQuerySelection(option.slug);
                      }}
                      type="button"
                    >
                      <SpriteThumb slug={option.slug} />
                      <span className="min-w-0 truncate text-sm font-medium text-[var(--text-primary)]">
                        {option.label}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-3 text-sm text-[var(--text-muted)]">
                  No Pokemon found for &quot;{query}&quot;
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function BattleLogSpritePicker({
  title,
  detectedLabel,
  sprites,
  onChange,
  pokemonOptions
}: BattleLogSpritePickerProps) {
  return (
    <section className="grid gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="grid gap-1">
          <p className="text-sm font-semibold text-[var(--text-muted)]">{title}</p>
          {detectedLabel ? (
            <p className="text-sm text-[var(--text-secondary)]">Detected: {detectedLabel}</p>
          ) : null}
        </div>
        <button
          className="inline-flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
          onClick={() => onChange(swapSpritePositions(sprites))}
          type="button"
        >
          ⇄
          <span>Swap</span>
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {[0, 1].map((index) => {
          const currentSlug = sprites[index] ?? "";

          return (
            <SpriteSearchSlot
              currentSlug={currentSlug}
              index={index}
              key={`${title}-${index}`}
              onChange={onChange}
              pokemonOptions={pokemonOptions}
              sprites={sprites}
              title={title}
            />
          );
        })}
      </div>
    </section>
  );
}
