---
version: 1
slug: "route-friends"
primary_target: "route:/friends"
related_targets: ["app/(app)/friends/page.tsx", "app/(app)/friends/loading.tsx", "app/(app)/friends/error.tsx", "components/ui/social/FriendsView.tsx", "components/ui/social/FriendActions.tsx", "components/ui/social/social.module.css"]
---

# Friends

## Purpose and mode

Operate. Find other authenticated members, manage friend requests, and review the Battle Log totals accepted friends share. Player Profile and Friendship meaning belongs in `CONTEXT.md`; visual authority remains in `docs/design-system.md`. Editing the owner's showcase stays in `/profile`.

## Built direction

Extend the incumbent flat competitive workspace with IBM Plex typography, neutral semantic colours, open sections, and ruled player rows. Find players leads, followed by Friend requests and Your friends; Sent requests and Blocked players appear when populated. Each section carries its count. Identity uses the shared preset or uploaded avatar and linked trainer name; permitted record and last-login metadata follow beneath it. Relationship actions sit beside identity without enclosing cards or decorative status treatments.

The header offers Edit player profile and View my profile. Discovery and relationship actions need no enable-profile step. Empty lists and searches retain explicit guidance.

## Responsive layout

Measure the available social-page container, including the space left by the app sidebar. The labelled Trainer name input and Search players button share the same 44px height and baseline. At 36rem or less, row actions follow identity in a vertical layout. At 23rem or less, the search field takes a full row and Search players wraps below it. Names and metadata wrap; action groups can wrap without clipping. Header actions use shared `PageActions`.

## Data and interaction contracts

- Search submits the `q` query through the Friends route. The app trims and bounds it to 40 characters; searches require at least two characters. Results contain at most 20 member profiles, omit self and blocked pairs, and announce the returned count rather than claiming a complete directory total.
- An account remains discoverable without a saved showcase row. Search and display use the trainer name when saved, otherwise a trimmed display name of at least two characters limited to 40 characters, otherwise a stable Player label derived from the account ID.
- Incoming requests offer Accept request and Decline; outgoing requests offer Cancel request; accepted friends offer Remove friend. An unconnected player offers Add friend. More exposes Block player; blocked rows offer Unblock and have no profile link. Requesting and accepting do not depend on an enable-profile setting.
- Mutations show Updating… and disable controls while pending. Success uses a status announcement; failures use alert semantics and semantic loss text. Saved changes revalidate Profile, Friends, and Player Profile routes.
- Friends' rows display permitted wins, losses, and all saved Battle Log totals. Last login appears only when returned by the privacy projection and is explicitly formatted in Europe/London. A nonfriend receives no record or last-login metadata.

## Preserved boundaries and states

All reads and mutations require authentication. A request becomes a Friendship only when its recipient accepts it. Blocking removes the connection and prevents either player seeing the other's profile or search entry; unblocking does not restore the connection. Profiles have no hide setting. Private account details, individual Battle Logs, Deck Lists, and notes do not enter this projection. Last-login sharing is a separate opt-in setting, off by default.

Loading announces its state in the same open row language. Route errors offer Retry and Go to Profile. Preserve shared light/dark tokens, visible focus, labelled search, and player-specific accessible action names.

## Source

`app/(app)/friends/page.tsx`, `loading.tsx`, `error.tsx`, and `actions.ts`; `components/ui/social/FriendsView.tsx`, `FriendActions.tsx`, `SocialLoadingState.tsx`, `SocialErrorState.tsx`, and `social.module.css`; reads and mutations in `lib/db/social.ts`, validation in `lib/social/validation.ts`, and authenticated projection/relationship rules in `supabase/migrations/20261002224116_add_trainer_profiles_and_friendships.sql` and `20261002232410_discoverable_players_and_avatar_uploads.sql`.
