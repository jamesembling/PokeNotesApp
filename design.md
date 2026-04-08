# Poke Notes — Design System

## Overview

Poke Notes is a focused, data-first tool for competitive Pokemon TCG players. The aesthetic is clean and professional — closer to a sports analytics dashboard than a Pokemon fan site. It takes the subject matter seriously without being sterile.

The design language is built around **consistency over creativity**. Every page uses the same components, the same spacing rhythm, the same typographic hierarchy. A user who knows how one page works knows how every page works.

---

## Principles

- **Data first** — numbers, results, and records are the hero. Typography and spacing serve them.
- **Consistent over clever** — no page-specific layouts. Every section uses the same building blocks.
- **Legible in both modes** — every colour decision is made for light and dark simultaneously.
- **Mobile is real** — the app is used on phones. Mobile layout is designed, not adapted.
- **No decorative complexity** — no gradient blurs, no opacity circles, no glass morphism. Surfaces are flat and purposeful.

---

## Colour Tokens

Define these as CSS variables and Tailwind theme extensions. Never hardcode colours.

### Light Mode
```
--bg-page:        #f0f2f5       /* Page background — the grey canvas */
--bg-surface:     #ffffff       /* Cards, panels */
--bg-surface-alt: #f7f8fa       /* Inset areas, stat cells */
--border:         #e4e7eb       /* Card borders, dividers */
--text-primary:   #111827       /* Headings, key data */
--text-secondary: #374151       /* Body text */
--text-muted:     #6b7280       /* Labels, supporting text, breadcrumbs */
--text-kicker:    #6b7280       /* Small caps section labels */
```

### Dark Mode
```
--bg-page:        #0f1117       /* Page background */
--bg-surface:     #1a1d27       /* Cards, panels */
--bg-surface-alt: #14161f       /* Inset areas, stat cells */
--border:         #2a2d3a       /* Card borders, dividers */
--text-primary:   #f9fafb       /* Headings, key data */
--text-secondary: #d1d5db       /* Body text */
--text-muted:     #6b7280       /* Labels, supporting text */
--text-kicker:    #4b5563       /* Small caps section labels */
```

### Semantic Colours (same in both modes)
```
--color-win:         #16a34a   /* Win result — green-600 */
--color-win-bg:      rgba(22, 163, 74, 0.10)
--color-win-border:  rgba(22, 163, 74, 0.20)

--color-loss:        #dc2626   /* Loss result — red-600 */
--color-loss-bg:     rgba(220, 38, 38, 0.08)
--color-loss-border: rgba(220, 38, 38, 0.16)

--color-brand:       #2563eb   /* Blue-600 — links, active nav, primary actions */
--color-brand-hover: #1d4ed8   /* Blue-700 */

--color-danger:      #dc2626   /* Destructive actions */
```

---

## Typography

### Font Stack
```
font-family: 'IBM Plex Sans', system-ui, -apple-system, sans-serif;
```
Use IBM Plex Sans for body copy and interface chrome, with IBM Plex Sans Condensed for page titles and key numeric display moments. This keeps the app serious and analytical, but gives headings more intent than a default product sans. Fallback to system-ui.

### Scale

| Role | Size | Weight | Colour | Notes |
|---|---|---|---|---|
| Page title | `text-3xl` (30px) | `font-bold` | `text-primary` | H1 only — one per page |
| Section heading | `text-xl` (20px) | `font-bold` | `text-primary` | H2 |
| Card heading | `text-base` (16px) | `font-semibold` | `text-primary` | H3 |
| Kicker | `text-xs` (12px) | `font-semibold uppercase tracking-widest` | `text-kicker` | E.g. "OVERVIEW", "ALL LOGS" |
| Body | `text-sm` (14px) | `font-normal` | `text-secondary` | Default prose |
| Supporting / muted | `text-sm` (14px) | `font-normal` | `text-muted` | Subtitles, descriptions |
| Stat value | `text-3xl` (30px) | `font-bold` | `text-primary` | Large numbers in stat cards |
| Stat label | `text-xs` (12px) | `font-medium` | `text-muted` | Labels above stat values |
| Breadcrumb | `text-sm` (14px) | `font-normal` | `text-muted` | With `/` separator |

### Rules
- Page titles are always bold, never italic
- Kickers always uppercase, always tracked wide, never bold beyond semibold
- Stat values always `text-3xl font-bold` — never vary this across pages
- Muted text is never smaller than `text-xs`

---

## Spacing Rhythm

These are the only spacing values used for layout. Do not introduce others.

```
Page horizontal padding:  px-4 (mobile)  px-6 (sm+)  px-8 (lg+)
Page vertical padding:    py-6 (mobile)  py-8 (sm+)
Gap between page sections: gap-6
Gap within a card:         gap-4
Gap between form fields:   gap-3
Card internal padding:     p-4 (mobile)  p-5 sm:p-6 (desktop)
```

---

## Layout

### Desktop (≥ 860px)
- Fixed sidebar: `w-64` (256px), full height, `bg-surface`, right border
- Main content: fills remaining width, `max-w-5xl` content container, centred
- Top bar: right-aligned user menu, optional page action (e.g. "Import PTCGL Log")

### Mobile (< 860px)
- No sidebar — hidden
- Top bar: hamburger left, Pokéball + page name centre, theme toggle right
- Drawer: slides in from left on hamburger tap, full height overlay
- Drawer sections: QUICK ACTIONS / NAVIGATE / ACCOUNT — small caps headers, large tap targets
- Bottom of screen: no fixed bottom nav (drawer handles all navigation)

### Page Structure — every page uses this exact structure
```
<PageHeader>            ← breadcrumb + title + subtitle
<content area>          ← one or more <Card> components
```

No exceptions. No pages with full-bleed heroes, gradient headers, or bespoke top sections.

---

## Components

### Card
The fundamental building block. Used everywhere.

```
bg-surface
border border-[--border]
rounded-xl
p-4 sm:p-6
```

**Rules:**
- Cards do not nest inside other cards
- Cards do not have coloured backgrounds (except win/loss log rows)
- No backdrop blur, no opacity effects, no gradient fills on cards

### PageHeader
Used at the top of every page. No exceptions.

```tsx
<PageHeader
  breadcrumb={[{ label: 'Poke Notes', href: '/' }, { label: 'Battle Logs' }]}
  title="Battle Logs"
  subtitle="Imported Pokemon TCG Live logs stored independently from deck strategy notes."
  action={<Button>Import PTCGL Log</Button>}  // optional
/>
```

Renders:
- Breadcrumb: `Poke Notes / Battle Logs` in `text-muted text-sm`
- Title: `text-3xl font-bold text-primary`
- Subtitle: `text-sm text-muted`
- Divider line beneath
- Optional right-aligned action button

### SectionHeader
Used inside cards to introduce a sub-section.

```tsx
<SectionHeader kicker="OVERVIEW" title="Battle Log Totals" />
```

Renders:
- Kicker: `text-xs font-semibold uppercase tracking-widest text-kicker`
- Title: `text-xl font-bold text-primary`

### StatCard
Used in grids of 2 or 4. Never used standalone.

```tsx
<StatCard label="Games Won" value="93" detail="69% win rate across resolved games." />
```

Renders inside a `bg-surface-alt rounded-xl p-4`:
- Label: `text-xs font-medium text-muted uppercase tracking-wide`
- Value: `text-3xl font-bold text-primary`
- Detail: `text-xs text-muted mt-1`

**Win/Loss StatCard variants:**
- Win value: `text-[--color-win]`
- Loss value: `text-[--color-loss]`

### LogRow
The list item for battle logs. Used in the logs list only.

```
Win row:  bg-[--color-win-bg]  border border-[--color-win-border]  rounded-xl
Loss row: bg-[--color-loss-bg] border border-[--color-loss-border] rounded-xl
```

Contents (left to right):
- Self sprite strip (2 sprites, medium)
- `Win vs Ogerpon / Meganium` bold + `5 Apr 2026` muted below
- `2nd` badge (go order, only when known) — centred
- Opponent sprites (up to 2, right-aligned)

Full-width tap target on mobile. Chevron on mobile only.

### Badge / Chip
Small inline label. Two variants:

```
Default:  bg-surface-alt border border-[--border] text-secondary rounded-full px-3 py-1 text-xs font-medium
Win:      bg-[--color-win-bg] border border-[--color-win-border] text-[--color-win] rounded-full px-3 py-1 text-xs font-medium
Loss:     bg-[--color-loss-bg] border border-[--color-loss-border] text-[--color-loss] rounded-full px-3 py-1 text-xs font-medium
```

Used for: format tags (SVI-ASC), win rate chips, record chips, go-order badges.

### Button

```
Primary:     bg-[--color-brand] hover:bg-[--color-brand-hover] text-white rounded-lg px-4 py-2 text-sm font-medium transition
Secondary:   bg-surface border border-[--border] text-secondary hover:bg-surface-alt rounded-lg px-4 py-2 text-sm font-medium transition
Destructive: bg-transparent border border-[--color-danger] text-[--color-danger] hover:bg-red-50 dark:hover:bg-red-950 rounded-lg px-4 py-2 text-sm font-medium transition
Ghost:       bg-transparent text-secondary hover:bg-surface-alt rounded-lg px-3 py-1.5 text-sm font-medium transition
```

No icon-only buttons without a tooltip. No buttons with loading spinners that aren't debounced.

### Form Fields

```
Label:   text-sm font-medium text-secondary mb-1.5
Input:   w-full bg-surface-alt border border-[--border] rounded-lg px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[--color-brand] focus:border-transparent transition
Helper:  text-xs text-muted mt-1
Error:   text-xs text-[--color-danger] mt-1
```

### Navigation (Desktop Sidebar)

```
Sidebar bg:           bg-surface border-r border-[--border]
Nav section divider:  border-t border-[--border] my-2
Nav item default:     text-sm text-secondary hover:text-primary hover:bg-surface-alt rounded-lg px-3 py-2 transition
Nav item active:      text-sm font-semibold text-[--color-brand] bg-blue-50 dark:bg-blue-950/30 rounded-lg px-3 py-2
Quick action items:   text-sm text-secondary hover:text-primary
```

Active state: left blue indicator bar (`w-0.5 bg-[--color-brand]`) on the left edge of the item.

### Breadcrumb
Always rendered by `PageHeader`. Never built ad hoc.

```
Poke Notes  /  Battle Logs  /  Log Detail
```
- All items: `text-sm text-muted`
- Separator: `/` in `text-muted mx-1.5`
- Last item: `text-sm text-primary font-medium` (current page, not a link)

### SpriteStrip
Pokemon sprite images displayed inline. Used in log rows, deck cards, matchup cards.

```
Size sm: 24×24px sprites, gap-0.5
Size md: 32×32px sprites, gap-0.5
```

Always `object-contain`. Always `onerror` removes the image silently. Never shows broken image icons.

---

## Admin Panel

Completely separate visual treatment from the user-facing app. Accessed at `/admin`.

```
Admin bg-page:     #0a0c10  (darker than user dark mode, always dark)
Admin sidebar:     #111318
Admin accent:      #6366f1  (indigo — distinct from user-facing blue)
```

Admin uses the same component primitives (Card, StatCard, Button) but with the darker palette. This makes it immediately visually distinct — a user who accidentally navigates there knows they're somewhere different.

---

## What Not To Do

These are explicitly banned patterns based on the current app's inconsistencies:

- ❌ Gradient blur circles behind profile headers or any decorative element
- ❌ Cards nested inside cards (panels inside panels)
- ❌ Per-page bespoke layouts — every page uses PageHeader + Cards
- ❌ Inline Tailwind colour values — always use CSS variables
- ❌ Different stat display patterns on different pages — always use StatCard
- ❌ Glass morphism or backdrop-filter effects
- ❌ Different button styles invented per feature
- ❌ Coloured sidebar backgrounds or gradient navigation
- ❌ Tables for data that can be expressed as cards or rows
- ❌ Fixed pixel font sizes — always use Tailwind text scale

---

## Codex Instructions

When building any UI in this project:

1. Use only components from `components/ui/` — never build bespoke UI inline
2. Every page starts with `<PageHeader>` — no exceptions
3. Refer to this file for all colour, spacing, and typography decisions
4. If a component you need doesn't exist in `components/ui/`, flag it and build it there first before using it
5. Mobile layout is built simultaneously with desktop — never as an afterthought
6. Dark mode is implemented via CSS variables — never with separate dark: class sprawl
7. Win/Loss colour is always semantic (`--color-win`, `--color-loss`) — never hardcoded green/red
