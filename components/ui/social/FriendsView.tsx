import Link from "next/link";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { FieldLabel } from "@/components/shadcn/field";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageActions } from "@/components/ui/PageActions";
import { ProfileAvatar } from "@/components/ui/ProfileAvatar";
import { ItemTitle, SectionTitle } from "@/components/ui/Typography";
import type { FriendConnections, SocialProfile } from "@/lib/social/types";
import { FriendActions } from "./FriendActions";
import { lastLoginLabel } from "./PlayerProfile";
import styles from "./social.module.css";

function PlayerRows({ profiles, canConnect }: { profiles: SocialProfile[]; canConnect: boolean }) {
  return <div className={styles.rows}>{profiles.map((profile) => <div className={styles.row} key={profile.id}>
    <div className={styles.identity}>
      <ProfileAvatar avatarColor={profile.avatarColor} fallback={profile.trainerName.slice(0, 2).toUpperCase()} />
      <div className={styles.identityText}>
        {profile.relationship === "blocked" ? <ItemTitle as="h3">{profile.trainerName}</ItemTitle> : <Link className={styles.identityLink} href={`/players/${profile.id}`} prefetch={false}><ItemTitle as="h3">{profile.trainerName}</ItemTitle></Link>}
        {profile.stats ? <p className={styles.meta}>{profile.stats.wins} wins · {profile.stats.losses} losses · {profile.stats.total} Battle Logs</p> : null}
        {profile.lastLoginAt ? <p className={styles.meta}>Last login · <time dateTime={profile.lastLoginAt}>{lastLoginLabel(profile.lastLoginAt)}</time> (London)</p> : null}
      </div>
    </div>
    <FriendActions canConnect={canConnect} profile={profile} />
  </div>)}</div>;
}

function ConnectionSection({ title, profiles, empty, canConnect }: { title: string; profiles: SocialProfile[]; empty: string; canConnect: boolean }) {
  return <section className={styles.section}><SectionTitle size="sm">{title} · {profiles.length}</SectionTitle>{profiles.length ? <PlayerRows canConnect={canConnect} profiles={profiles} /> : <p className={styles.empty}>{empty}</p>}</section>;
}

export function FriendsView({ connections, results, query, showcase }: { connections: FriendConnections; results: SocialProfile[]; query: string; showcase: SocialProfile }) {
  return <div className={styles.page}>
    <PageHeader action={<PageActions><Button asChild variant="outline"><Link href="/profile" prefetch={false}>Edit player profile</Link></Button>{showcase.enabled ? <Button asChild variant="outline"><Link href={`/players/${showcase.id}`} prefetch={false}>View my profile</Link></Button> : null}</PageActions>} breadcrumb={[{ label: "Poke Notes", href: "/dashboard" }, { label: "Friends" }]} subtitle="Connect with other players and see the Battle Log record they share with friends." title="Friends" />
    {!showcase.enabled ? <p className={styles.privacy}>Your player profile is hidden. <Link className="underline underline-offset-4" href="/profile" prefetch={false}>Enable it in Profile</Link> before sending or accepting friend requests.</p> : null}
    <section className={styles.section}>
      <SectionTitle size="sm">Find players</SectionTitle>
      <form action="/friends" className={styles.search}>
        <div className={styles.searchField}><FieldLabel htmlFor="player-search">Trainer name</FieldLabel><Input defaultValue={query} id="player-search" maxLength={40} name="q" placeholder="Search player profiles" /></div>
        <Button type="submit" variant="outline">Search players</Button>
      </form>
      {query ? <><p className={styles.meta} role="status">{results.length} {results.length === 1 ? "player" : "players"} found for “{query}”</p>{results.length ? <PlayerRows canConnect={showcase.enabled} profiles={results} /> : <p className={styles.empty}>No visible profiles found. Try another trainer name.</p>}</> : <p className={styles.description}>Only players who enable their profile appear in search.</p>}
    </section>
    <ConnectionSection canConnect={showcase.enabled} empty="No pending requests." profiles={connections.incoming} title="Friend requests" />
    <ConnectionSection canConnect={showcase.enabled} empty="No friends yet. Find a player and send a friend request to get started." profiles={connections.friends} title="Your friends" />
    {connections.outgoing.length ? <ConnectionSection canConnect={showcase.enabled} empty="" profiles={connections.outgoing} title="Sent requests" /> : null}
    {connections.blocked.length ? <ConnectionSection canConnect={showcase.enabled} empty="" profiles={connections.blocked} title="Blocked players" /> : null}
  </div>;
}
