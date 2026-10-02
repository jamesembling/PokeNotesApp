---
version: 1
slug: "route-profile"
primary_target: "route:/profile"
related_targets: ["app/(app)/profile/page.tsx","app/(app)/profile/loading.tsx","components/ui/ProfileForm.tsx","components/ui/ProfileLoadingState.tsx","components/ui/account/profile.module.css","components/ui/ProfileAvatar.tsx","components/ui/social/ShowcaseForm.tsx","components/ui/social/social.module.css"]
---

# Profile

## Purpose and mode

Operate. Let a player maintain the details used in Poke Notes and Battle Log imports, choose an avatar colour, inspect account activity, and edit their optional Player Profile showcase. Product language remains in `CONTEXT.md`; visual authority remains in `docs/design-system.md`.

## Built direction

Extend the approved Stats and Deck Strategy world with shared IBM Plex typography, neutral semantic foregrounds and surfaces, open sections, and thin rules. Account details leads with labelled identity fields and Save Profile; Profile picture and Player profile follow behind rules. Account and Activity provide secondary reference data. Preserve that hierarchy without enclosing cards, pills, decorative colour bars, or a separate title scale. View my profile opens the owner's inspection surface when showcase data is available.

Keep shared inputs, buttons, and avatar artwork in their established treatment. Avatar colour is a functional choice, with a visible colour name beneath each image, a neutral selection ring, and a distinct keyboard-focus ring. Save feedback and selected-colour text stay neutral; failures use semantic loss text and alert semantics.

## Responsive layout

Measure the width available after the app sidebar. At 58rem or wider, the form occupies the flexible main column beside a 19rem Account and Activity rail, separated by a 3rem gap. Below 58rem, the rail follows the form behind a top rule, with Account and Activity side by side. At 35rem or less, those reference sections stack with a rule before Activity.

The form has its own content container. Fields use two columns until 27rem or less, when they and the save row stack. Avatar choices use eight columns, reducing to four at 34rem or less. Long emails and metadata values wrap within their columns; dates use tabular numerals. The announced loading skeleton uses the same page header, form, avatar, and reference layout.

The separate Player profile form measures its own available width. Its fields stack; selected card rows wrap their controls. Card-art search results use four columns, reducing to two at 36rem or less, where the showcase save row also stacks. Pokémon results form a bounded scrollable list. This editor uses printing previews; the inspection route owns the full favourite-art display.

## Data and interaction contracts

- Display Name, PTCGL Username, Alternate PTCGL usernames, First Name, and Last Name remain explicitly labelled fields submitted through Save Profile. Explain that PTCGL Username identifies the player's side when importing Battle Logs; aliases are comma-separated and imported logs display the primary username. Preserve validation, optional-name behavior, saved values, and inline success or failure feedback.
- Save Profile shows Saving... and disables during its submission. It also disables while an avatar save is pending so that an in-flight colour update cannot race a details submission.
- Avatar choices remain one labelled radio group. Selecting a colour updates the preview and starts the existing automatic save. Disable the choices while pending, announce Saving colour..., then show the selected colour. On failure, restore the previous selection and show the error. On success, refresh the account presentation through the existing path.
- Account is a labelled definition list for Email, Role, and Avatar colour. Missing email shows Unknown. Activity labels Account created, Last login, and Last active; account creation prefers the authentication timestamp, then the profile timestamp. Missing timestamps show Not available yet.
- Player profile has its own Save player profile action. Enable my player profile and Share last login with friends both default off. Trainer name is separate from account name and PTCGL username, is limited to 40 characters, and requires at least two characters when enabled. Disabling hides the profile and shared record while keeping existing friendships.
- Favourite Pokémon is optional and chosen through the existing catalogue search, with Remove and Retry controls. Favourite card art selects up to three distinct printings; selected rows retain card name and set/number, Earlier/Later ordering controls, and Remove. Their saved order determines display order. Card search requires two characters, debounces requests, and exposes pending, empty, and retryable failure states. Selected/full-capacity choices disable appropriately.
- Showcase submission disables its fieldset and save button, announces Saving…, and reports success or an alert. Failure leaves the current edits available for retry. Privacy copy explicitly states that accepted friends receive aggregate Battle Log wins, losses, and totals while private account details and individual records remain private.

## Preserved boundaries

The page reads the authenticated current account profile and its separate current-user showcase in parallel. Details and avatar changes retain their current-user actions, validation, persistence, avatar cookie, and workspace revalidation. Showcase reads and saves use the authenticated social projection and action path; Pokémon options and printing search supply the editor choices. A missing social schema leaves account editing usable with a direct temporary-unavailability message. This surface adds no role editing, email editing, or account deletion. Keep visible focus, radio keyboard behavior, semantic light/dark colours, and announced save states intact.

## Source

`app/(app)/profile/page.tsx`, `app/(app)/profile/loading.tsx`, `components/ui/ProfileForm.tsx`, `ProfileLoadingState.tsx`, and `account/profile.module.css`; shared `PageHeader`, `PageActions`, `SectionTitle`, `Field`, `Input`, `Button`, and `ProfileAvatar`. Account reads and mutations remain in `lib/db/profile.ts` and Profile actions. Showcase controls live in `components/ui/social/ShowcaseForm.tsx` and `social.module.css`, with `lib/db/social.ts`, `app/(app)/friends/actions.ts`, the existing Pokémon options resource, and `/api/card-art-options` supplying reads, validation, choices, and persistence.
