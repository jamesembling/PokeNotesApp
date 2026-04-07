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
  if (!slug) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--bg-surface)] text-xs text-[var(--text-muted)]">
        -
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

function matchesSearch(option: PokemonOption, normalizedQuery: string) {
  if (!normalizedQuery) {
    return false;
  }

  const normalizedLabel = option.label.toLowerCase();
  const normalizedSlug = option.slug.replace(/-/g, " ").toLowerCase();

  if (normalizedLabel.startsWith(normalizedQuery) || normalizedSlug.startsWith(normalizedQuery)) {
    return true;
  }

  return normalizedLabel.split(/\s+/).some((part) => part.startsWith(normalizedQuery));
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

    return slotOptions.filter((option) => matchesSearch(option, normalizedQuery)).slice(0, 8);
  }, [query, slotOptions]);

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

        <input
          className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={currentSlug ? "Search to replace Pokemon" : "Search Pokemon"}
          spellCheck={false}
          value={query}
        />

        {isOpen && normalizeSearchValue(query) ? (
          <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-[var(--shadow-lg)]">
            {filteredOptions.length > 0 ? (
              <div className="max-h-64 overflow-y-auto py-2">
                {filteredOptions.map((option) => (
                  <button
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[var(--bg-surface-alt)]"
                    key={option.slug}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      onChange(updateSpritesAtIndex(sprites, index, option.slug));
                      setQuery("");
                      setIsOpen(false);
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
