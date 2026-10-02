---
version: 1
slug: "route-player-profile"
primary_target: "route:/players/[id]"
related_targets: ["app/(app)/players/[id]/page.tsx", "app/(app)/players/[id]/loading.tsx", "app/(app)/players/[id]/error.tsx", "app/(app)/players/[id]/not-found.tsx", "components/ui/social/PlayerProfile.tsx", "components/ui/social/FavouriteCardArt.tsx", "components/ui/social/social.module.css"]
---

# Player Profile

## Purpose and mode

Operate. Inspect a player's identity and favourite card printings, with a Battle Log record available to accepted friends and the owner. Editing the owner's showcase belongs to `/profile`. Product meaning remains in `CONTEXT.md`; visual authority remains in `docs/design-system.md`.

## Built direction

Extend the incumbent flat IBM Plex competitive workspace in this reading order: trainer identity, permitted Battle Log record and last login, then up to three full favourite card artworks. The shared page header names the player and carries relationship actions; self instead offers Edit profile. The shared preset or uploaded avatar, relationship label, and optional favourite Pokémon sprite establish identity without a separate hero card. The record is an open ruled ledger with neutral, labelled tabular numbers. Artwork is real printing imagery in saved selection order, with no visible card-name or set/number captions; accessible image and link names retain that identity.

## Responsive layout

Measure the available social-page container. The record has four columns and artwork has three columns, bounded to 52rem. At 36rem or less both become two columns; at 23rem or less artwork becomes a single column bounded to 18rem. Full artworks preserve their proportions without cropping. Names wrap, and header actions follow the shared responsive header/action treatment. Last login uses a labelled definition-list row, with the date above the time and London-time label. Light and dark modes use the same semantic foreground, surface, border, and focus tokens.

## Data and interaction contracts

- Wins, Losses, and Games logged report saved Battle Logs. Win rate rounds wins divided by wins plus losses; no known outcomes shows an em dash. Games logged may include outcomes outside that denominator. Tournament rounds remain separate. Do not repeat this calculation explanation as a disclaimer beneath the record.
- Accepted friends and the owner receive the aggregate record. A nonfriend receives the direct privacy state explaining that the Battle Log record becomes visible after acceptance. Individual logs and deck information stay private; presentation never grants disclosure.
- Last login appears for friends or self as `dt`/`dd` account metadata. Accepted friends receive it only when the owner opts in; absent values state Not shared or Not available as applicable. Available timestamps use a semantic `time` element with separate date and time lines and an explicit London-time label. The owner can see their own last login regardless of the sharing setting.
- Artwork links open the exact printing on Limitless in a new tab. The gallery has no visible card-name or printing captions; image alt text and link labels identify each printing. An image failure displays Artwork unavailable. An empty self showcase links to Profile to choose up to three card arts; other profiles use a direct empty-state message. The Profile editor keeps its own printing labels and ordering controls.
- Relationship controls share `FriendActions` with Friends, including pending, success, and error states. Profiles are discoverable without an enable step or saved showcase row, with the identity fallback defined in `CONTEXT.md`; no hidden-profile notice or enable guidance appears.

## Preserved boundaries and states

The route requires authentication and a valid UUID. An unavailable or blocked profile resolves to the not-found state. The server projection controls record and last-login disclosure. Loading announces its state with open skeleton rows, and errors offer Retry and Go to Profile. Owner edits, favourite-art ordering, last-login sharing, and relationship changes retain their separate actions and saved contracts.

## Source

`app/(app)/players/[id]/page.tsx`, `loading.tsx`, `error.tsx`, and `not-found.tsx`; `components/ui/social/PlayerProfile.tsx`, `FavouriteCardArt.tsx`, `FriendActions.tsx`, and `social.module.css`; profile projection in `lib/db/social.ts` and `supabase/migrations/20261002224116_add_trainer_profiles_and_friendships.sql` plus `20261002232410_discoverable_players_and_avatar_uploads.sql`, with artwork URLs in `lib/social/artwork.ts` and the existing Deck List printing-link helper.
