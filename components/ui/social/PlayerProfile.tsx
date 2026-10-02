import Link from "next/link";
import { Button } from "@/components/shadcn/button";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageActions } from "@/components/ui/PageActions";
import { ProfileAvatar } from "@/components/ui/ProfileAvatar";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import { SectionTitle } from "@/components/ui/Typography";
import type { SocialProfile } from "@/lib/social/types";
import { FavouriteCardArt } from "./FavouriteCardArt";
import { FriendActions } from "./FriendActions";
import styles from "./social.module.css";

const loginFormatter = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" });

export function lastLoginLabel(value: string | null) {
  return value && Number.isFinite(Date.parse(value)) ? loginFormatter.format(new Date(value)) : "Not available";
}

export function PlayerProfile({ profile, canConnect }: { profile: SocialProfile; canConnect: boolean }) {
  const knownGames = profile.stats ? profile.stats.wins + profile.stats.losses : 0;
  const trainerName = profile.trainerName || "Your player profile";
  return (
    <div className={styles.page}>
      <PageHeader
        action={profile.relationship === "self" ? <PageActions><Button asChild variant="outline"><Link href="/profile" prefetch={false}>Edit profile</Link></Button></PageActions> : <FriendActions canConnect={canConnect} profile={profile} />}
        breadcrumb={[{ label: "Poke Notes", href: "/dashboard" }, { label: "Friends", href: "/friends" }, { label: trainerName }]}
        title={trainerName}
      />
      <div className={styles.profileIdentity}>
        <ProfileAvatar avatarColor={profile.avatarColor} className={styles.profileAvatar} fallback={profile.trainerName.slice(0, 2).toUpperCase() || "PN"} />
        <div>
          <p className={styles.meta}>{profile.relationship === "self" ? "Your player profile" : profile.relationship === "friends" ? "Friends" : "Player profile"}</p>
          {profile.favouritePokemon ? <div className={styles.pokemon}><SpriteStrip pokemonOptions={[{ slug: profile.favouritePokemon.slug, label: profile.favouritePokemon.name, spriteUrl: profile.favouritePokemon.spriteUrl }]} size="lg" sprites={[profile.favouritePokemon.slug]} /><span>Favourite Pokémon · {profile.favouritePokemon.name}</span></div> : null}
        </div>
      </div>
      {!profile.enabled && profile.relationship === "self" ? <p className={styles.privacy}>Your profile is hidden. <Link className="underline underline-offset-4" href="/profile" prefetch={false}>Enable your player profile</Link> to appear in search and connect with other players.</p> : null}
      <section aria-labelledby="player-record" className={styles.section}>
        <SectionTitle id="player-record" size="sm">Battle Log record</SectionTitle>
        {profile.stats ? <>
          <dl className={styles.record}>
            <div><dt>Wins</dt><dd>{profile.stats.wins}</dd></div>
            <div><dt>Losses</dt><dd>{profile.stats.losses}</dd></div>
            <div><dt>Games logged</dt><dd>{profile.stats.total}</dd></div>
            <div><dt>Win rate</dt><dd>{knownGames ? `${Math.round(profile.stats.wins / knownGames * 100)}%` : "—"}</dd></div>
          </dl>
          <p className={styles.description}>All saved Battle Logs. Win rate uses wins and losses. Tournament rounds are separate.</p>
        </> : <p className={styles.privacy}>Battle Log totals are shared with accepted friends. Individual logs and deck information remain private.</p>}
        {profile.relationship === "friends" || profile.relationship === "self" ? <p className={styles.meta}>Last login · {profile.lastLoginAt ? <><time dateTime={profile.lastLoginAt}>{lastLoginLabel(profile.lastLoginAt)}</time> (London time)</> : profile.shareLastLogin ? "Not available" : "Not shared"}</p> : null}
      </section>
      <section aria-labelledby="favourite-arts" className={styles.section}>
        <SectionTitle id="favourite-arts" size="sm">Favourite card art</SectionTitle>
        {profile.favouriteCards.length ? <div className={styles.artGrid}>{profile.favouriteCards.map((card) => <FavouriteCardArt card={card} key={`${card.set}-${card.number}`} />)}</div> : <p className={styles.empty}>{profile.relationship === "self" ? <Link className="underline underline-offset-4" href="/profile" prefetch={false}>Choose up to three favourite card arts in Profile.</Link> : "No favourite card art selected yet."}</p>}
      </section>
    </div>
  );
}
