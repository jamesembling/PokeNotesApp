"use client";

import Image from "next/image";
import { useState } from "react";
import { buildDeckListCardUrl } from "@/lib/deck-lists/render";
import { buildFavouriteCardArtImageUrl } from "@/lib/social/artwork";
import type { FavouriteCardArt as FavouriteCardData } from "@/lib/social/types";
import styles from "./social.module.css";

export type FavouriteCard = FavouriteCardData;

export function FavouriteCardArt({ card, linked = true, showCaption = true }: { card: FavouriteCard; linked?: boolean; showCaption?: boolean }) {
  const [failed, setFailed] = useState(false);
  const artwork = <div className={styles.artImage}>{failed
    ? <div className={styles.artFallback}>Artwork unavailable</div>
    : <Image alt={`${card.name}, ${card.set} ${card.number}`} fill onError={() => setFailed(true)} quality={80} sizes="(max-width: 640px) 45vw, 260px" src={buildFavouriteCardArtImageUrl(card.set, card.number)} />}</div>;

  return (
    <figure className={styles.art}>
      {linked ? <a aria-label={`View ${card.name}, ${card.set} ${card.number} on Limitless`} className={styles.artLink} href={buildDeckListCardUrl(card.set, card.number)} rel="noreferrer" target="_blank">{artwork}</a> : artwork}
      {showCaption ? <figcaption className={styles.artCaption}>{card.name}<span className={styles.artPrint}>{card.set} {card.number}</span></figcaption> : null}
    </figure>
  );
}
