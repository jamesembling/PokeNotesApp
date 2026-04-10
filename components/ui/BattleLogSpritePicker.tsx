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
        aria-label={prettifyPokemonSlug(slug)}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--bg-surface)] px-1 text-center text-[10px] font-semibold leading-tight text-[var(--text-muted)]"
      >
        {prettifyPokemonSlug(slug)}
      </div>
    );
  }

  return (
    <Image
      alt={prettifyPokemonSlug(slug)}
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
  const [isEditingMobile, setIsEditingMobile] = useState(false);
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

  function closeMobileEditor() {
    setQuery("");
    setIsOpen(false);
    setIsEditingMobile(false);
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
    setIsEditingMobile(false);
    return true;
  }

  useEffect(() => {
    setQuery("");
  }, [currentSlug]);

  useEffect(() => {
    if (!isEditingMobile) {
      return;
    }

    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isEditingMobile]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        if (isEditingMobile) {
          closeMobileEditor();
          return;
        }

        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isEditingMobile]);

  return (
    <div
      className="relative flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-3 py-2.5 md:items-start md:px-4 md:py-3"
      key={`${title}-${index}`}
      ref={containerRef}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3 md:items-start">
        <div className="flex min-w-0 flex-1 items-center gap-3 md:hidden">
          <button
            className="flex min-h-[68px] w-full min-w-0 items-center gap-3 text-left"
            onClick={() => {
              setIsEditingMobile(true);
              setIsOpen(true);
            }}
            type="button"
          >
            {currentSlug ? (
              <SpriteThumb pokemonOptions={pokemonOptions} slug={currentSlug} />
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--bg-surface)] text-xs text-[var(--text-muted)]">
                -
              </div>
            )}
            <span className="min-w-0 flex-1 truncate text-[0.95rem] font-medium text-[var(--text-primary)]">
              {currentSlug ? prettifyPokemonSlug(currentSlug) : "Select pokemon..."}
            </span>
            {!currentSlug ? (
              <ChevronIcon className="h-4 w-4 shrink-0 text-[var(--text-muted)] -rotate-90" />
            ) : null}
          </button>
          {currentSlug ? (
            <button
              aria-label={`Remove ${prettifyPokemonSlug(currentSlug)}`}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
              onClick={() => {
                onChange(updateSpritesAtIndex(sprites, index, ""));
                closeMobileEditor();
              }}
              type="button"
            >
              <CloseIcon className="h-[18px] w-[18px]" />
            </button>
          ) : null}
        </div>

        <div className="hidden min-w-0 flex-1 md:block">
          <div className="flex items-start justify-between gap-2 md:gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <SpriteThumb pokemonOptions={pokemonOptions} slug={currentSlug} />
              <p className="truncate text-[0.95rem] font-medium text-[var(--text-primary)] md:text-sm">
                {currentSlug ? prettifyPokemonSlug(currentSlug) : "No Pokemon selected"}
              </p>
            </div>
            {currentSlug ? (
              <button
                aria-label={`Remove ${prettifyPokemonSlug(currentSlug)}`}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] md:h-auto md:w-auto md:rounded-none"
                onClick={() => {
                  onChange(updateSpritesAtIndex(sprites, index, ""));
                  closeMobileEditor();
                }}
                type="button"
              >
                <CloseIcon className="h-3.5 w-3.5 md:h-3 md:w-3" />
              </button>
            ) : null}
          </div>

          <div className="relative mt-2">
            <input
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-[0.95rem] text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20 md:text-sm"
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
              ref={inputRef}
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
                        <SpriteThumb pokemonOptions={pokemonOptions} slug={option.slug} />
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

        {isEditingMobile ? (
          <div className="absolute inset-x-3 top-full z-30 mt-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-3 shadow-[var(--shadow-lg)] md:hidden">
            <div className="flex items-center gap-2">
              <input
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface-alt)] px-3 py-2.5 text-[0.95rem] text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
                onBlur={() => {
                  commitQuerySelection();
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
                    closeMobileEditor();
                  }
                }}
                placeholder={currentSlug ? "Search to replace Pokemon" : "Search Pokemon"}
                ref={inputRef}
                spellCheck={false}
                value={query}
              />
              <button
                aria-label="Close Pokemon search"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--bg-surface-alt)] hover:text-[var(--text-primary)]"
                onClick={closeMobileEditor}
                type="button"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>

            {isOpen && normalizeSearchValue(query) ? (
              <div className="mt-2 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-surface-alt)]">
                {filteredOptions.length > 0 ? (
                  <div className="max-h-64 overflow-y-auto py-2">
                    {filteredOptions.map((option) => (
                      <button
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[var(--bg-surface)]"
                        key={option.slug}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          commitQuerySelection(option.slug);
                        }}
                        type="button"
                      >
                        <SpriteThumb pokemonOptions={pokemonOptions} slug={option.slug} />
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
        ) : null}
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
      <div className="flex items-start justify-between gap-3 md:gap-4">
        <div className="grid gap-1">
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
      <div className="grid gap-3 lg:grid-cols-2">
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
