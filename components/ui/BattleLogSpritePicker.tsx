"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronIcon, CloseIcon } from "@/components/ui/icons";
import { prettifyPokemonSlug } from "@/lib/battle-log/display";
import { buildPokemonSpriteUrlFromSlug } from "@/lib/pokemon/sprites";
import type { PokemonOption } from "@/types/index";

type BattleLogSpritePickerProps = {
  title: string;
  detectedLabel?: string;
  sprites: string[];
  onChange: (nextSprites: string[]) => void;
  pokemonOptions: PokemonOption[];
};

function SpriteThumb({
  pokemonOptions,
  slug
}: {
  pokemonOptions: PokemonOption[];
  slug: string;
}) {
  const [hasError, setHasError] = useState(false);
  const label =
    pokemonOptions.find((option) => option.slug === slug)?.label ?? prettifyPokemonSlug(slug);
  const src =
    pokemonOptions.find((option) => option.slug === slug)?.spriteUrl ??
    buildPokemonSpriteUrlFromSlug(slug);

  if (!slug) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--bg-surface)] text-xs text-[var(--text-muted)]">
        -
      </div>
    );
  }

  if (hasError || !src) {
    return (
      <div
        aria-label={label}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--bg-surface)] px-1 text-center text-[10px] font-semibold leading-tight text-[var(--text-muted)]"
      >
        {label}
      </div>
    );
  }

  return (
    <Image
      alt={label}
      className="h-12 w-12 shrink-0 object-contain"
      height={48}
      onError={(event) => {
        setHasError(true);
      }}
      sizes="48px"
      src={src}
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

function getPokemonOptionLabel(slug: string, pokemonOptions: PokemonOption[]) {
  return pokemonOptions.find((option) => option.slug === slug)?.label ?? prettifyPokemonSlug(slug);
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
  const [isEditingSearch, setIsEditingSearch] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
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

  function closeSearchEditor() {
    setQuery("");
    setIsOpen(false);
    setIsEditingSearch(false);
  }

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
    setIsEditingSearch(false);
    return true;
  }

  useEffect(() => {
    setQuery("");
  }, [currentSlug]);

  useEffect(() => {
    if (!isEditingSearch) {
      return;
    }

    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isEditingSearch]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        if (isEditingSearch) {
          closeSearchEditor();
          return;
        }

        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isEditingSearch]);

  return (
    <div
      className="grid min-w-0 gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-surface-alt)] px-3 py-2.5 md:px-4 md:py-3"
      key={`${title}-${index}`}
      ref={containerRef}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button
          className="flex min-h-[60px] w-full min-w-0 items-center gap-3 text-left md:min-h-[54px]"
          onClick={() => {
            setIsEditingSearch(true);
            setIsOpen(true);
          }}
          type="button"
        >
          {currentSlug ? (
            <SpriteThumb pokemonOptions={pokemonOptions} slug={currentSlug} />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-surface)] text-xs text-[var(--text-muted)]">
              -
            </div>
          )}
          <span className="min-w-0 flex-1 truncate text-[0.95rem] font-medium text-[var(--text-primary)] md:text-sm">
            {currentSlug ? getPokemonOptionLabel(currentSlug, pokemonOptions) : "Select pokemon..."}
          </span>
          {!currentSlug ? (
            <ChevronIcon className="h-4 w-4 shrink-0 text-[var(--text-muted)] -rotate-90" />
          ) : null}
        </button>
        {currentSlug ? (
          <button
            aria-label={`Remove ${getPokemonOptionLabel(currentSlug, pokemonOptions)}`}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
            onClick={() => {
              onChange(updateSpritesAtIndex(sprites, index, ""));
              closeSearchEditor();
            }}
            type="button"
          >
            <CloseIcon className="h-[18px] w-[18px]" />
          </button>
        ) : null}
      </div>
      {isEditingSearch ? (
        <div className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-3 shadow-[var(--shadow-sm)]">
          <div className="flex min-w-0 items-center gap-2">
            <input
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface-alt)] px-3 py-2.5 text-base text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20 md:text-sm"
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
                  closeSearchEditor();
                }
              }}
              placeholder={currentSlug ? "Search to replace Pokemon" : "Search Pokemon"}
              ref={inputRef}
              spellCheck={false}
              value={query}
            />
            <button
              aria-label="Close Pokemon search"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--bg-surface-alt)] hover:text-[var(--text-primary)]"
              onClick={closeSearchEditor}
              type="button"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>

          {isOpen && normalizeSearchValue(query) ? (
            <div className="mt-2 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-surface-alt)]">
              {filteredOptions.length > 0 ? (
                <div className="max-h-64 touch-pan-y overflow-y-auto py-2">
                  {filteredOptions.map((option) => (
                    <button
                      className="flex w-full touch-manipulation items-center gap-3 px-4 py-3 text-left transition hover:bg-[var(--bg-surface)]"
                      key={option.slug}
                      onClick={() => {
                        commitQuerySelection(option.slug);
                      }}
                      type="button"
                    >
                      <SpriteThumb pokemonOptions={pokemonOptions} slug={option.slug} />
                      <span className="min-w-0 truncate text-base font-medium text-[var(--text-primary)] md:text-sm">
                        {option.label}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-3 text-base text-[var(--text-muted)] md:text-sm">
                  No Pokemon found for &quot;{query}&quot;
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
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
    <section className="grid min-w-0 gap-3">
      <div className="flex min-w-0 items-start justify-between gap-3 md:gap-4">
        <div className="grid min-w-0 gap-1">
          <p className="text-[0.95rem] font-semibold text-[var(--text-muted)] md:text-sm">{title}</p>
          {detectedLabel ? (
            <p className="text-[0.95rem] leading-5 text-[var(--text-secondary)] md:text-sm">
              Detected: {detectedLabel}
            </p>
          ) : null}
        </div>
        <button
          className="inline-flex items-center gap-1 text-[0.9rem] font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] md:gap-2 md:text-sm"
          onClick={() => onChange(swapSpritePositions(sprites))}
          type="button"
        >
          ⇄
          <span>Swap</span>
        </button>
      </div>
      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
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
