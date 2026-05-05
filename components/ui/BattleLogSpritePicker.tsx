"use client";

import Image from "next/image";
import { Input } from "@/components/shadcn/input";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronIcon, CloseIcon } from "@/components/ui/icons";
import { prettifyPokemonSlug } from "@/lib/battle-log/display";
import {
  findBestPokemonSearchMatch,
  findPokemonSearchMatches,
  normalizePokemonSearchValue
} from "@/lib/pokemon/search";
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
      onError={() => {
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

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
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
  const [isDesktopFloatingPanel, setIsDesktopFloatingPanel] = useState(false);
  const [floatingPanelStyle, setFloatingPanelStyle] = useState<CSSProperties | null>(null);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const floatingPanelRef = useRef<HTMLDivElement | null>(null);
  const slotOptions = useMemo(
    () => buildOptionsForSlot(currentSlug, sprites, pokemonOptions),
    [currentSlug, pokemonOptions, sprites]
  );

  const filteredOptions = useMemo(() => {
    if (!normalizePokemonSearchValue(query)) {
      return [];
    }

    return findPokemonSearchMatches(slotOptions, query, 8);
  }, [query, slotOptions]);
  const isMobileInlinePanel = isEditingSearch && !isDesktopFloatingPanel;

  function closeSearchEditor() {
    setQuery("");
    setIsOpen(false);
    setIsEditingSearch(false);
  }

  function commitQuerySelection(preferredSlug?: string) {
    const nextOption =
      (preferredSlug ? slotOptions.find((option) => option.slug === preferredSlug) : null) ??
      findBestPokemonSearchMatch(slotOptions, query);

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
    const desktopFloatingPanelQuery = window.matchMedia(
      "(min-width: 1024px) and (hover: hover) and (pointer: fine)"
    );

    function syncDesktopMode() {
      setIsDesktopFloatingPanel(desktopFloatingPanelQuery.matches);
    }

    syncDesktopMode();
    desktopFloatingPanelQuery.addEventListener("change", syncDesktopMode);

    return () => {
      desktopFloatingPanelQuery.removeEventListener("change", syncDesktopMode);
    };
  }, []);

  useEffect(() => {
    if (!isEditingSearch) {
      return;
    }

    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isEditingSearch]);

  useEffect(() => {
    if (!isEditingSearch || !isDesktopFloatingPanel) {
      setFloatingPanelStyle(null);
      return;
    }

    function syncFloatingPanelPosition() {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      const rect = container.getBoundingClientRect();
      const viewportPadding = 16;
      const minPanelWidth = 320;
      const preferredPanelWidth = Math.max(minPanelWidth, Math.min(420, rect.width + 28));
      const maxPanelWidth = Math.max(minPanelWidth, window.innerWidth - viewportPadding * 2);
      const panelWidth = Math.min(preferredPanelWidth, maxPanelWidth);
      const left = clamp(rect.left, viewportPadding, window.innerWidth - panelWidth - viewportPadding);
      const top = rect.bottom + 8;
      const maxHeight = Math.max(
        180,
        Math.min(420, window.innerHeight - top - viewportPadding)
      );

      setFloatingPanelStyle({
        left,
        maxHeight,
        position: "fixed",
        top,
        width: panelWidth
      });
    }

    syncFloatingPanelPosition();
    window.addEventListener("resize", syncFloatingPanelPosition);
    window.addEventListener("scroll", syncFloatingPanelPosition, true);

    return () => {
      window.removeEventListener("resize", syncFloatingPanelPosition);
      window.removeEventListener("scroll", syncFloatingPanelPosition, true);
    };
  }, [isDesktopFloatingPanel, isEditingSearch]);

  useEffect(() => {
    if (!isEditingSearch || isDesktopFloatingPanel) {
      return;
    }

    function keepMobilePickerVisible() {
      containerRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest"
      });
    }

    const timeoutId = window.setTimeout(keepMobilePickerVisible, 80);
    window.addEventListener("resize", keepMobilePickerVisible);
    window.addEventListener("orientationchange", keepMobilePickerVisible);
    window.visualViewport?.addEventListener("resize", keepMobilePickerVisible);
    window.visualViewport?.addEventListener("scroll", keepMobilePickerVisible);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("resize", keepMobilePickerVisible);
      window.removeEventListener("orientationchange", keepMobilePickerVisible);
      window.visualViewport?.removeEventListener("resize", keepMobilePickerVisible);
      window.visualViewport?.removeEventListener("scroll", keepMobilePickerVisible);
    };
  }, [isDesktopFloatingPanel, isEditingSearch]);

  useEffect(() => {
    if (!isEditingSearch) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;

      if (containerRef.current?.contains(target)) {
        return;
      }

      if (floatingPanelRef.current?.contains(target)) {
        return;
      }

      closeSearchEditor();
    }

    window.addEventListener("pointerdown", handlePointerDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isEditingSearch]);

  const searchPanelContent = (
    <div
      className={`grid gap-2 border border-[var(--border)] bg-[var(--bg-surface)] p-3 ${
        isMobileInlinePanel
          ? "rounded-b-2xl rounded-t-none border-t-0 shadow-none"
          : "rounded-2xl shadow-[var(--shadow-lg)]"
      }`}
      ref={isDesktopFloatingPanel ? floatingPanelRef : undefined}
    >
      <div
        className="flex min-w-0 items-center gap-2"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <Input
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

      {isOpen && normalizePokemonSearchValue(query) ? (
        <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-surface-alt)]">
          {filteredOptions.length > 0 ? (
            <div
              className="touch-pan-y overflow-y-auto py-2"
              style={
                isDesktopFloatingPanel && floatingPanelStyle?.maxHeight
                  ? { maxHeight: Math.max(120, Number(floatingPanelStyle.maxHeight) - 84) }
                  : { maxHeight: "min(20rem,45vh)" }
              }
            >
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
      ) : (
        <p className="px-1 text-sm text-[var(--text-muted)]">
          Start typing to search the Pokemon list.
        </p>
      )}
    </div>
  );

  const floatingSearchPanel =
    isEditingSearch &&
    isDesktopFloatingPanel &&
    floatingPanelStyle &&
    typeof document !== "undefined"
      ? createPortal(
          <div
            className="z-[90]"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            style={floatingPanelStyle}
          >
            {searchPanelContent}
          </div>,
          document.body
        )
      : null;

  return (
    <div
      className={`relative grid min-w-0 gap-2 border border-[var(--border)] bg-[var(--bg-surface-alt)] px-3 py-2.5 md:px-4 md:py-3 ${
        isMobileInlinePanel
          ? "z-30 rounded-t-lg rounded-b-none border-b-transparent"
          : isEditingSearch
            ? "z-30 rounded-lg"
            : "rounded-lg"
      }`}
      ref={containerRef}
      key={`${title}-${index}`}
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
      {isMobileInlinePanel ? searchPanelContent : null}
      {floatingSearchPanel}
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
