---
version: 1
slug: "route-profile"
primary_target: "route:/profile"
related_targets: ["app/(app)/profile/page.tsx","app/(app)/profile/loading.tsx","components/ui/ProfileForm.tsx","components/ui/ProfileLoadingState.tsx","components/ui/account/ProfileAvatarChooser.tsx","components/ui/account/profile.module.css","components/ui/ProfileAvatar.tsx","components/ui/social/ShowcaseForm.tsx","components/ui/social/social.module.css"]
---

# Profile

## Purpose and mode

Operate. Let a player maintain their account and import identity, choose a shared profile picture, inspect private account activity, and edit their Player Profile showcase. Product language remains in `CONTEXT.md`; visual authority remains in `docs/design-system.md`.

## Built direction

Extend the approved Stats and Deck Strategy world with shared IBM Plex typography, neutral semantic foregrounds and surfaces, open sections, and thin rules. A large clickable avatar leads beside the account display name, optional PTCGL handle, and View my player profile link. Group private Account and Activity information directly underneath. Edit account details is a labelled native disclosure; the separate Player profile editor follows. Keep the page open without enclosing cards, pills, decorative colour bars, or a separate visual world.

The avatar opens a picture chooser with the current or staged image, existing Poké Ball presets, and an own-image upload. Preset colour names remain visible, with a neutral selection ring and distinct keyboard-focus ring. Saved feedback stays neutral; failures use semantic loss text and alert semantics.

## Responsive layout

Measure the width available after the app sidebar. The identity header is a horizontal avatar/name pair: the avatar is 8.5rem by default, 6.5rem at 38rem or less, and 5.5rem at 25rem or less. Names and handles wrap within the remaining space. Account and Activity use two columns, stacking at 38rem or less. Definition-list values wrap and dates use tabular numerals.

The disclosed account form measures its own width. Account and import sections become one column at 38rem or less; their fields and save row stack at 25rem or less. The announced loading skeleton follows the avatar header, grouped metadata, disclosure, and Player profile editor.

The picture dialog uses shared `AppDialogContent` and stays within the viewport with bounded scrolling. Eight presets use four columns. Upload actions wrap and become full-width on screens at 400px or less. Shared buttons retain the opaque 2px keyboard-focus outline with a 2px offset. Keep reduced-motion behavior and visible close/focus controls.

The Player profile editor measures its own width. Its fields stack; selected card rows wrap their controls. Card-art search results use four columns, reducing to two at 36rem or less, where the showcase save row also stacks. Pokémon results form a bounded scrollable list. This editor retains printing captions and ordering controls; the inspection route owns the caption-free favourite-art gallery.

## Data and interaction contracts

- Display Name, PTCGL Username, Alternate PTCGL usernames, First Name, and Last Name remain explicitly labelled fields submitted through Save Profile inside Edit account details. Explain that PTCGL Username identifies the player's side when importing Battle Logs; aliases are comma-separated and imported logs display the primary username. Preserve validation, optional names, saved values, and inline save feedback.
- Save Profile shows Saving… and disables during submission or an avatar save. The picture trigger disables during an account save so the two mutations cannot race.
- Clicking the avatar opens Profile picture. Selecting a Poké Ball preset saves immediately and removes the custom image from the active profile. Uploading a JPEG, PNG, or WebP of at most 2 MiB stages a preview; Save picture persists it. Selecting a preset or saving an upload disables chooser controls while pending, announces progress and success, and leaves an actionable error on failure. Closing discards an unsaved selection; saving refreshes the account and shared avatar presentation.
- The server decodes still image bytes rather than trusting the filename or MIME header, checks the actual image format and size, strips metadata, and produces a centre-cropped square WebP up to 512 pixels per side. Object names and write/delete permissions are scoped to the current owner; the selected picture is shared through Player Profiles.
- Account is a private labelled definition list for Email, Name, and Access. Missing email shows Not available; absent personal names show Not set. Activity labels Joined, Last login, and Last active; Joined prefers the authentication timestamp, then the profile timestamp. Missing timestamps show Not available yet. Activity explicitly identifies London time.
- Player profile has its own Save player profile action. Profiles are always discoverable by other authenticated members except across a block. There is no enable or hide control. Trainer name is separate from account and PTCGL names and must contain 2–40 characters. A profile without a saved showcase remains usable through the trainer-name, bounded display-name, or stable Player-ID fallback defined in `CONTEXT.md`.
- Share last login with friends is independent and defaults off. Accepted friends receive last login only when opted in; the owner can inspect their own value regardless of that setting.
- Favourite Pokémon is optional and chosen through catalogue search, with Remove and Retry controls. Favourite card art selects up to three distinct printings; selected rows retain card name and set/number, Earlier/Later ordering controls, and Remove. Saved order determines gallery order. Card search requires two characters, debounces requests, and exposes pending, empty, and retryable failure states. Selected/full-capacity choices disable appropriately.
- Showcase submission disables its fieldset and save button, announces Saving…, and reports success or an alert. Failure leaves edits available for retry. Its privacy explanation identifies aggregate Battle Log totals shared with accepted friends and the account details and individual records that stay private.

## Preserved boundaries

The page reads the authenticated account profile and its separate current-user showcase in parallel. Details, presets, and uploads retain current-user validation, persistence, avatar cookie behavior, and workspace refresh. Showcase reads and saves use the authenticated social projection and action path; Pokémon options and printing search supply choices. A missing social schema leaves account editing usable with a direct temporary-unavailability message. This surface adds no role editing, email editing, or account deletion. Keep visible focus, radio keyboard behavior, semantic light/dark colours, and announced save states intact.

## Source

`app/(app)/profile/page.tsx`, `loading.tsx`, and `actions.ts`; `components/ui/ProfileForm.tsx`, `ProfileLoadingState.tsx`, `ProfileAvatar.tsx`, `account/ProfileAvatarChooser.tsx`, and `account/profile.module.css`; shared `PageHeader`, `PageTitle`, `SectionTitle`, `Field`, `Input`, `Button`, `AppDialogContent`, and dialog primitives. Account reads remain in `lib/db/profile.ts`; avatar upload and processing live in `app/api/profile/avatar/route.ts`, `lib/server/profile-avatar.ts`, and `lib/profile-avatar.ts`. Showcase controls live in `components/ui/social/ShowcaseForm.tsx` and `social.module.css`, with `lib/db/social.ts`, `app/(app)/friends/actions.ts`, Pokémon options, and `/api/card-art-options` supplying reads, choices, and persistence. Discovery and avatar storage rules are in `supabase/migrations/20261002232410_discoverable_players_and_avatar_uploads.sql`.
