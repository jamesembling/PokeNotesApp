"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { saveShowcaseAction } from "@/app/(app)/friends/actions";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Field, FieldLabel } from "@/components/shadcn/field";
import { SectionTitle } from "@/components/ui/Typography";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import { usePokemonOptionsResource } from "@/lib/pokemon/use-pokemon-options";
import { buildPokemonSearchIndex, findPokemonSearchMatchesInIndex } from "@/lib/pokemon/search";
import type { SocialProfile } from "@/lib/social/types";
import { FavouriteCardArt, type FavouriteCard } from "./FavouriteCardArt";
import styles from "./social.module.css";

export function ShowcaseForm({ profile }: { profile: SocialProfile }) {
  const [state, action, pending] = useActionState(saveShowcaseAction, {});
  const [enabled, setEnabled] = useState(profile.enabled);
  const [pokemonSlug, setPokemonSlug] = useState(profile.favouritePokemon?.slug ?? "");
  const [pokemonQuery, setPokemonQuery] = useState("");
  const pokemon = usePokemonOptionsResource();
  const pokemonIndex = useMemo(() => buildPokemonSearchIndex(pokemon.pokemonOptions ?? []), [pokemon.pokemonOptions]);
  const pokemonMatches = useMemo(() => pokemonQuery.trim() ? findPokemonSearchMatchesInIndex(pokemonIndex, pokemonQuery, 20) : [], [pokemonIndex, pokemonQuery]);
  const selectedPokemon = pokemonIndex.optionsBySlug.get(pokemonSlug);
  const [cards, setCards] = useState<FavouriteCard[]>(profile.favouriteCards);
  const [cardQuery, setCardQuery] = useState("");
  const [options, setOptions] = useState<FavouriteCard[]>([]);
  const [cardError, setCardError] = useState("");
  const [loadingCards, setLoadingCards] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const query = cardQuery.trim();
    setOptions([]);
    setCardError("");
    if (query.length < 2) { setLoadingCards(false); return; }
    const controller = new AbortController();
    setLoadingCards(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/card-art-options?q=${encodeURIComponent(query)}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Card search unavailable");
        const data = await response.json() as { options?: FavouriteCard[] };
        if (!controller.signal.aborted) setOptions(Array.isArray(data.options) ? data.options : []);
      } catch {
        if (!controller.signal.aborted) setCardError("Could not load card art. Try the search again.");
      } finally {
        if (!controller.signal.aborted) setLoadingCards(false);
      }
    }, 350);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [cardQuery, retry]);

  function moveCard(index: number, direction: number) {
    setCards((current) => {
      const next = [...current];
      [next[index], next[index + direction]] = [next[index + direction], next[index]];
      return next;
    });
  }

  return (
    <form action={action} aria-busy={pending} className={styles.form}>
      <SectionTitle size="sm">Player profile</SectionTitle>
      <p className={styles.description}>Choose the name, favourite Pokémon and card art other Poke Notes members can see. Your account starts with this profile hidden.</p>
      <fieldset disabled={pending}>
        <legend className="sr-only">Player profile settings</legend>
        <div className={styles.fields}>
          <label className={styles.check}>
            <input checked={enabled} name="enabled" onChange={(event) => setEnabled(event.target.checked)} type="checkbox" />
            <span>Enable my player profile<small>Appear in player search and allow friend requests. Turning this off hides your profile and shared record; existing friendships are kept.</small></span>
          </label>
          <Field>
            <FieldLabel htmlFor="trainer-name">Trainer name</FieldLabel>
            <Input defaultValue={profile.trainerName} id="trainer-name" maxLength={40} name="trainerName" placeholder="Name shown to other players" required={enabled} />
            <p className={styles.description}>This is separate from your account name and PTCGL username.</p>
          </Field>
          <label className={styles.check}>
            <input defaultChecked={profile.shareLastLogin} name="shareLastLogin" type="checkbox" />
            <span>Share last login with friends<small>Accepted friends can see your last login time. This is off by default.</small></span>
          </label>
          <div>
            <FieldLabel htmlFor="favourite-pokemon-search">Favourite Pokémon</FieldLabel>
            <input name="favouritePokemonSlug" type="hidden" value={pokemonSlug} />
            {pokemonSlug ? <div className={styles.selection}>
              <div className={styles.pokemon}><SpriteStrip pokemonOptions={pokemon.pokemonOptions} size="lg" sprites={[pokemonSlug]} /><span>{selectedPokemon?.label ?? profile.favouritePokemon?.name ?? pokemonSlug}</span></div>
              <Button onClick={() => setPokemonSlug("")} type="button" variant="ghost">Remove favourite Pokémon</Button>
            </div> : null}
            <Input className="mt-3" id="favourite-pokemon-search" onChange={(event) => setPokemonQuery(event.target.value)} placeholder="Search Pokémon by name" value={pokemonQuery} />
            {pokemon.error ? <div className={styles.status}><p className={styles.error} role="alert">{pokemon.error}</p><Button onClick={pokemon.reload} type="button" variant="outline">Retry Pokémon search</Button></div> : null}
            {pokemon.isLoading && !pokemon.pokemonOptions ? <p className={styles.meta} role="status">Loading Pokémon…</p> : null}
            {pokemonQuery.trim() && pokemon.pokemonOptions ? <div aria-label="Pokémon search results" className={styles.results}>
              {pokemonMatches.length ? pokemonMatches.map((option) => <Button className={styles.result} key={option.slug} onClick={() => { setPokemonSlug(option.slug); setPokemonQuery(""); }} type="button" variant="ghost"><SpriteStrip pokemonOptions={[option]} size="sm" sprites={[option.slug]} />{option.label}</Button>) : <p className={styles.empty}>No Pokémon found. Try another name.</p>}
            </div> : null}
          </div>
          <div>
            <FieldLabel htmlFor="favourite-card-search">Favourite card art</FieldLabel>
            <p className={styles.description}>Choose up to three different card printings. Their order is the order shown on your profile.</p>
            <input name="favouriteCards" type="hidden" value={JSON.stringify(cards)} />
            {cards.length ? <ol className={styles.pickedCards}>{cards.map((card, index) => <li className={styles.pickedCard} key={`${card.set}-${card.number}`}>
              <span>{index + 1}. {card.name} <span className={styles.artPrint}>{card.set} {card.number}</span></span>
              <div className={styles.actions}>
                <Button aria-label={`Move ${card.name}, ${card.set} ${card.number} earlier`} disabled={index === 0} onClick={() => moveCard(index, -1)} size="sm" type="button" variant="ghost">Earlier</Button>
                <Button aria-label={`Move ${card.name}, ${card.set} ${card.number} later`} disabled={index === cards.length - 1} onClick={() => moveCard(index, 1)} size="sm" type="button" variant="ghost">Later</Button>
                <Button aria-label={`Remove ${card.name}, ${card.set} ${card.number}`} onClick={() => setCards((current) => current.filter((_, position) => position !== index))} size="sm" type="button" variant="outline">Remove</Button>
              </div>
            </li>)}</ol> : null}
            <Input className="mt-3" id="favourite-card-search" maxLength={100} onChange={(event) => setCardQuery(event.target.value)} placeholder="Search card name or set and number" value={cardQuery} />
            <p className={styles.meta} role="status">{loadingCards ? "Searching card art…" : cards.length === 3 ? "Three card arts selected. Remove one to choose another." : "Type at least two characters to find a printing."}</p>
            {cardError ? <div className={styles.status}><p className={styles.error} role="alert">{cardError}</p><Button onClick={() => setRetry((current) => current + 1)} type="button" variant="outline">Retry card search</Button></div> : null}
            {!loadingCards && !cardError && cardQuery.trim().length >= 2 ? options.length ? <div aria-label="Card art search results" className={styles.cardOptionGrid}>{options.map((card) => {
              const selected = cards.some((current) => current.set === card.set && current.number === card.number);
              return <div className={styles.cardOption} key={`${card.set}-${card.number}`}><FavouriteCardArt card={card} linked={false} /><Button aria-label={`Choose ${card.name}, ${card.set} ${card.number}`} className="mt-2 w-full" disabled={selected || cards.length === 3} onClick={() => setCards((current) => [...current, card])} type="button" variant="outline">{selected ? "Selected" : "Choose"}</Button></div>;
            })}</div> : <p className={styles.empty}>No card art found. Try another name or printing.</p> : null}
          </div>
        </div>
      </fieldset>
      <p className={styles.privacy}>Accepted friends can see your Battle Log wins, losses and total games. Your email, personal names, PTCGL details, individual Battle Logs, Deck Lists and notes stay private.</p>
      <div className={styles.saveRow}>
        <div>{state.error ? <p className={`${styles.status} ${styles.error}`} role="alert">{state.error}</p> : null}{state.success ? <p className={styles.status} role="status">{state.success}</p> : null}</div>
        <Button disabled={pending} type="submit">{pending ? "Saving…" : "Save player profile"}</Button>
      </div>
    </form>
  );
}
