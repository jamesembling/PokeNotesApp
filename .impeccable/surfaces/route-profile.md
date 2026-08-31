---
version: 1
slug: "route-profile"
primary_target: "route:/profile"
related_targets: ["app/(app)/profile/page.tsx","app/(app)/profile/loading.tsx","components/ui/ProfileForm.tsx","components/ui/ProfileLoadingState.tsx","components/ui/account/profile.module.css","components/ui/ProfileAvatar.tsx"]
---

# Profile

## Purpose and mode

Operate. Let a player maintain the details used in Poke Notes and Battle Log imports, choose an avatar colour, and inspect account activity. Product language remains in `CONTEXT.md`; visual authority remains in `docs/design-system.md`.

## Built direction

Extend the approved Stats and Deck Strategy world with shared IBM Plex typography, neutral semantic foregrounds and surfaces, open sections, and thin rules. Account details leads with four labelled fields and Save Profile; Profile picture follows behind a rule. Account and Activity provide secondary reference data. Preserve that hierarchy without enclosing cards, pills, decorative colour bars, or a separate title scale.

Keep shared inputs, buttons, and avatar artwork in their established treatment. Avatar colour is a functional choice, with a visible colour name beneath each image, a neutral selection ring, and a distinct keyboard-focus ring. Save feedback and selected-colour text stay neutral; failures use semantic loss text and alert semantics.

## Responsive layout

Measure the width available after the app sidebar. At 58rem or wider, the form occupies the flexible main column beside a 19rem Account and Activity rail, separated by a 3rem gap. Below 58rem, the rail follows the form behind a top rule, with Account and Activity side by side. At 35rem or less, those reference sections stack with a rule before Activity.

The form has its own content container. Fields use two columns until 27rem or less, when they and the save row stack. Avatar choices use eight columns, reducing to four at 34rem or less. Long emails and metadata values wrap within their columns; dates use tabular numerals. The announced loading skeleton uses the same page header, form, avatar, and reference layout.

## Data and interaction contracts

- Display Name, PTCGL Username, First Name, and Last Name remain explicitly labelled fields submitted through Save Profile. Explain that PTCGL Username identifies the player's side when importing Battle Logs. Preserve the existing validation, optional-name behavior, saved values, and inline success or failure feedback.
- Save Profile shows Saving... and disables during its submission. It also disables while an avatar save is pending so that an in-flight colour update cannot race a details submission.
- Avatar choices remain one labelled radio group. Selecting a colour updates the preview and starts the existing automatic save. Disable the choices while pending, announce Saving colour..., then show the selected colour. On failure, restore the previous selection and show the error. On success, refresh the account presentation through the existing path.
- Account is a labelled definition list for Email, Role, and Avatar colour. Missing email shows Unknown. Activity labels Account created, Last login, and Last active; account creation prefers the authentication timestamp, then the profile timestamp. Missing timestamps show Not available yet.

## Preserved boundaries

The page reads the authenticated current profile. Details and avatar changes retain their existing current-user actions, validation, persistence, avatar cookie, and workspace revalidation. This surface adds no role editing, email editing, account deletion, or new data fetch. Keep visible focus, radio keyboard behavior, semantic light/dark colours, and announced save states intact.

## Source

`app/(app)/profile/page.tsx`, `app/(app)/profile/loading.tsx`, `components/ui/ProfileForm.tsx`, `ProfileLoadingState.tsx`, and `account/profile.module.css`; shared `PageHeader`, `SectionTitle`, `Field`, `Input`, `Button`, and `ProfileAvatar`. Account reads and mutations remain in `lib/db/profile.ts` and the existing Profile actions.
