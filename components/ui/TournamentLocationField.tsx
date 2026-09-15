"use client";

import { useEffect, useId, useRef, useState } from "react";
import { LoaderCircle, MapPin, Search } from "lucide-react";
import { Field, FieldLabel } from "@/components/shadcn/field";
import { Input } from "@/components/shadcn/input";
import type { PlayStoreSuggestion } from "@/lib/locations/play-stores";

type LookupState = "idle" | "loading" | "ready" | "error";

export function TournamentLocationField({ defaultValue = "" }: { defaultValue?: string }) {
  const listboxId = useId();
  const debounceTimerRef = useRef<number | null>(null);
  const [query, setQuery] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<PlayStoreSuggestion[]>([]);
  const [selectedStore, setSelectedStore] = useState<PlayStoreSuggestion | null>(null);
  const [hasUserEdited, setHasUserEdited] = useState(false);
  const [lookupState, setLookupState] = useState<LookupState>("idle");
  const [isListOpen, setIsListOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
    }

    const normalizedQuery = query.trim();
    if (
      !hasUserEdited ||
      normalizedQuery.length < 1 ||
      (selectedStore && selectedStore.label === normalizedQuery)
    ) {
      setSuggestions([]);
      setLookupState("idle");
      setIsListOpen(false);
      setActiveIndex(-1);
      return;
    }

    const controller = new AbortController();
    debounceTimerRef.current = window.setTimeout(() => {
      setLookupState("loading");

      void fetch(`/api/location-suggestions?q=${encodeURIComponent(normalizedQuery)}`, {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal
      })
        .then(async (response) => {
          const payload = await response.json();
          if (!response.ok || !Array.isArray(payload.suggestions)) {
            throw new Error("Location suggestions unavailable.");
          }

          const nextSuggestions = payload.suggestions as PlayStoreSuggestion[];
          setSuggestions(nextSuggestions);
          setLookupState("ready");
          setIsListOpen(nextSuggestions.length > 0);
          setActiveIndex(nextSuggestions.length > 0 ? 0 : -1);
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setSuggestions([]);
            setLookupState("error");
            setIsListOpen(false);
            setActiveIndex(-1);
          }
        });
    }, 120);

    return () => {
      controller.abort();
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [hasUserEdited, query, selectedStore]);

  function selectStore(store: PlayStoreSuggestion) {
    setQuery(store.label);
    setSelectedStore(store);
    setSuggestions([]);
    setLookupState("idle");
    setIsListOpen(false);
    setActiveIndex(-1);
  }

  return (
    <Field>
      <FieldLabel htmlFor="tournament-location">Location</FieldLabel>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={isListOpen}
          aria-haspopup="listbox"
          autoComplete="off"
          className="min-h-[2.75rem] pl-9 pr-9 text-base font-semibold placeholder:font-semibold sm:min-h-[3rem] sm:text-sm"
          id="tournament-location"
          maxLength={160}
          name="location"
          onBlur={() => window.setTimeout(() => setIsListOpen(false), 150)}
          onChange={(event) => {
            setHasUserEdited(true);
            setQuery(event.target.value);
            setSelectedStore(null);
          }}
          onFocus={() => {
            if (suggestions.length > 0) {
              setIsListOpen(true);
            }
          }}
          onKeyDown={(event) => {
            if (!isListOpen || suggestions.length === 0) {
              return;
            }

            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((current) => (current + 1) % suggestions.length);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
            } else if (event.key === "Enter" && activeIndex >= 0) {
              event.preventDefault();
              selectStore(suggestions[activeIndex]);
            } else if (event.key === "Escape") {
              setIsListOpen(false);
            }
          }}
          placeholder="Start typing a UK Play! Store name"
          role="combobox"
          value={query}
        />
        {lookupState === "loading" ? (
          <LoaderCircle
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground motion-reduce:animate-none"
          />
        ) : null}

        {isListOpen ? (
          <ul
            className="absolute inset-x-0 top-[calc(100%+0.35rem)] z-50 max-h-60 overflow-y-auto rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-md"
            id={listboxId}
            role="listbox"
          >
            {suggestions.map((suggestion, index) => (
              <li
                aria-selected={index === activeIndex}
                className="flex min-h-11 cursor-pointer items-start gap-2 rounded-md px-3 py-2 text-sm leading-snug outline-none hover:bg-muted aria-selected:bg-muted"
                id={`${listboxId}-option-${index}`}
                key={suggestion.id}
                onClick={() => selectStore(suggestion)}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                role="option"
              >
                <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block font-semibold text-foreground">{suggestion.label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {suggestion.address}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <p aria-live="polite" className="sr-only" role="status">
        {lookupState === "loading"
          ? "Searching UK Play! Stores."
          : lookupState === "error"
            ? "Play! Store suggestions are unavailable. You can still enter a location manually."
            : lookupState === "ready" && suggestions.length === 0
              ? "No matching UK Play! Store found. You can still enter a location manually."
              : isListOpen
                ? `${suggestions.length} UK Play! Store suggestions available.`
                : ""}
      </p>
    </Field>
  );
}
