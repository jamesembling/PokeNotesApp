"use client";

import Image from "next/image";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { useEffect, useMemo, useRef, useState } from "react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/shadcn/popover";
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
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-card text-xs text-muted-foreground">
        -
      </div>
    );
  }

  if (hasError || !src) {
    return (
      <div
        aria-label={label}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-card px-1 text-center text-[10px] font-semibold leading-tight text-muted-foreground"
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
      unoptimized
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
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
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
    const desktopFloatingPanelQuery = window.matchMedia("(min-width: 640px)");

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

  const searchPanelContent = (
    <div
      className={`grid gap-2 border border-border bg-card p-3 ${
        isMobileInlinePanel
          ? "rounded-b-2xl rounded-t-none border-t-0 shadow-none"
          : "rounded-2xl shadow-[var(--shadow-lg)]"
      }`}
    >
      <div
        className="flex min-w-0 items-center gap-2"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <Input
          className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-base text-card-foreground outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/50 md:text-sm"
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
        <Button
          aria-label="Close Pokemon search"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-card-foreground"
          onClick={closeSearchEditor}
          size="icon"
          type="button"
          variant="ghost"
        >
          <CloseIcon className="h-4 w-4" />
        </Button>
      </div>

      {isOpen && normalizePokemonSearchValue(query) ? (
        <div className="overflow-hidden rounded-lg border border-border bg-muted">
          {filteredOptions.length > 0 ? (
            <div
              className="touch-pan-y overflow-y-auto py-2"
              style={
                isDesktopFloatingPanel
                  ? { maxHeight: "min(21rem,var(--radix-popover-content-available-height))" }
                  : { maxHeight: "min(20rem,45vh)" }
              }
            >
              {filteredOptions.map((option) => (
                <Button
                  className="h-auto w-full touch-manipulation justify-start gap-3 rounded-none px-4 py-3 text-left transition hover:bg-card"
                  key={option.slug}
                  onClick={() => {
                    commitQuerySelection(option.slug);
                  }}
                  type="button"
                  variant="ghost"
                >
                  <SpriteThumb pokemonOptions={pokemonOptions} slug={option.slug} />
                  <span className="min-w-0 truncate text-base font-medium text-card-foreground md:text-sm">
                    {option.label}
                  </span>
                </Button>
              ))}
            </div>
          ) : (
            <div className="px-4 py-3 text-base text-muted-foreground md:text-sm">
              No Pokemon found for &quot;{query}&quot;
            </div>
          )}
        </div>
      ) : (
        <p className="px-1 text-sm text-muted-foreground">
          Start typing to search the Pokemon list.
        </p>
      )}
    </div>
  );

  return (
    <Popover
      onOpenChange={(nextOpen) => {
        if (!nextOpen && isDesktopFloatingPanel) {
          closeSearchEditor();
        }
      }}
      open={isEditingSearch && isDesktopFloatingPanel}
    >
      <PopoverAnchor asChild>
        <div
          className={`relative grid min-w-0 gap-2 border border-border bg-muted px-3 py-2.5 md:px-4 md:py-3 ${
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
            <Button
              className="flex min-h-[60px] min-w-0 flex-1 justify-start gap-3 p-0 text-left hover:bg-transparent md:min-h-[54px]"
              onClick={() => {
                setIsEditingSearch(true);
                setIsOpen(true);
              }}
              type="button"
              variant="ghost"
            >
              {currentSlug ? (
                <SpriteThumb pokemonOptions={pokemonOptions} slug={currentSlug} />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-card text-xs text-muted-foreground">
                  -
                </div>
              )}
              <span className="min-w-0 flex-1 truncate text-[0.95rem] font-medium text-card-foreground md:text-sm">
                {currentSlug ? getPokemonOptionLabel(currentSlug, pokemonOptions) : "Select pokemon..."}
              </span>
              {!currentSlug ? (
                <ChevronIcon className="h-4 w-4 shrink-0 text-muted-foreground -rotate-90" />
              ) : null}
            </Button>
            {currentSlug ? (
              <Button
                aria-label={`Remove ${getPokemonOptionLabel(currentSlug, pokemonOptions)}`}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-card hover:text-card-foreground"
                onClick={() => {
                  onChange(updateSpritesAtIndex(sprites, index, ""));
                  closeSearchEditor();
                }}
                size="icon"
                type="button"
                variant="ghost"
              >
                <CloseIcon className="h-[18px] w-[18px]" />
              </Button>
            ) : null}
          </div>
          {isMobileInlinePanel ? searchPanelContent : null}
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="z-[90] w-[min(420px,calc(100vw-2rem))] bg-popover p-0 shadow-[var(--shadow-lg)]"
        onOpenAutoFocus={(event) => event.preventDefault()}
        sideOffset={8}
      >
        {searchPanelContent}
      </PopoverContent>
    </Popover>
  );
}

export function BattleLogSpritePicker({
  title,
  sprites,
  onChange,
  pokemonOptions
}: BattleLogSpritePickerProps) {
  return (
    <section className="grid min-w-0 gap-3">
      <div className="flex min-w-0 items-start justify-between gap-3 md:gap-4">
        <div className="grid min-w-0 gap-1">
          <p className="text-[0.95rem] font-semibold text-muted-foreground md:text-sm">{title}</p>
        </div>
        <Button
          className="inline-flex items-center gap-1 text-[0.9rem] font-medium text-foreground transition hover:text-card-foreground md:gap-2 md:text-sm"
          onClick={() => onChange(swapSpritePositions(sprites))}
          type="button"
          variant="ghost"
        >
          ⇄
          <span>Swap</span>
        </Button>
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
