# Poke Notes Rebuild — Full Handover Document

## Why We Are Rebuilding

The rebuild started from a performance investigation on **5 April 2026**.

James noticed that a similar Pokemon TCG app (Training Court — github.com/jlgrimes/training-court)
felt dramatically smoother and faster to load than Poke Notes. The investigation revealed the
fundamental reason:

**Training Court fetches all data server-side before the page reaches the browser.**
**Poke Notes fetches all data client-side, causing a visible loading gap on every page.**

The current Poke Notes app is built in vanilla JavaScript with HTML string rendering. Every page
load follows this pattern:

```
Browser loads → Page renders (empty/skeleton) → JS runs → Fetch to Supabase → Data arrives → Page fills in
```

This creates what we called the "hydration gap" — the visible delay between a page appearing and
data filling in. With the bootstrap cache (localStorage) the app tries to paper over this, but
that cache created its own bugs (the "Load More Logs" button going missing, Pokemon selections
reverting on reload).

The deeper problem is architectural: **the current app treats derived/inferred data as
authoritative**, overwriting actual user input and server-provided state. Both major bugs
in the current app share this root cause.

The conclusion was that these bugs couldn't be fixed cleanly without a structural change.
The right move was to rebuild in Next.js 14 App Router, where:

- Data fetches happen **server-side** before the page reaches the browser
- No bootstrap cache needed — no hydration gap
- No derived data overwriting user input
- Proper normalised schema instead of JSON blobs
- Persistent sessions via @supabase/ssr cookies (fixes re-auth bug in current app)

---

## Current App Problems Being Solved

1. **Client-side data fetching** — visible loading states, hydration gap, bootstrap cache complexity
2. **Missing "Load More Logs" button** — caused by bootstrap path inferring pagination state locally
   vs live server path deriving it from Supabase. Two different code paths, two different truths.
3. **Pokemon selection edits not persisting** — selections treated as derived data reconstructed
   from deck names/sprite inference rather than as authoritative user input
4. **HTML string rendering** — impossible to maintain, impossible to type-check, hard to debug
5. **Re-authentication bug** — sessions not persisting correctly (fixed by @supabase/ssr cookies)
6. **JSON blob storage** — filterable data like matchup stats stored as unqueryable blobs
7. **No matchup notes in rebuild** — removed from scope entirely, wasn't working well

---

## Key Architectural Decisions Made

- **Full rebuild**, not incremental migration — the vanilla JS foundation made incremental too risky
- **Next.js 14 App Router** — server components by default, data fetched before page renders
- **TypeScript strict mode** — no any types, catches errors at build time not runtime
- **Normalised schema** — proper columns for filterable data, no JSON blobs for things we query
- **No localStorage for user data** — auth-gated only; localStorage only for theme preference
- **Server components by default** — client components only when browser events are needed
- **@supabase/ssr** — cookie-based sessions that persist correctly across requests
- **Matchup notes removed** — not being rebuilt, out of scope
- **Single Supabase project** — same project as current app, all data migrated across

---


## Project Overview

James is rebuilding **Poke Notes** (poke-notes.vercel.app) — a Pokemon TCG battle log and deck
strategy tracker — from a vanilla JS/HTML string rendering app into Next.js 14 App Router.

**Current live app:** https://poke-notes.vercel.app
**New app repo:** https://github.com/jamesembling/PokeNotesApp
**New app Vercel URL:** https://poke-notes-app.vercel.app
**Local workspace:** /Users/jamesembling/Documents/Codex/workspaces/PokeNotesV2
**Current app source:** /Users/jamesembling/Documents/Codex/workspaces/Pokemon Note App/

---

## Tech Stack

- **Framework:** Next.js 14 App Router
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS with CSS variables for all colours — never hardcode Tailwind colour values
- **Auth:** @supabase/ssr with Google OAuth, cookie-based sessions
- **Database:** Supabase (Postgres)
- **Deployment:** Vercel (auto-deploys from main branch on push to GitHub)
- **AI Coding:** Codex (o4-mini / o4-medium / o4-high)

---

## Supabase Project

- **URL:** https://uhsqehjapqarbsmlqnnp.supabase.co
- **Project name:** Poke Notes V2
- This is the ONLY Supabase project — same one used by the current app
- All data has been migrated: 2 users, 10 decks, 136 logs

---

## Environment Variables

### In .env (local):
```
NEXT_PUBLIC_SUPABASE_URL=https://uhsqehjapqarbsmlqnnp.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
NEW_SUPABASE_URL=https://uhsqehjapqarbsmlqnnp.supabase.co
NEW_SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### In Vercel (all set):
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- NEW_SUPABASE_URL
- NEW_SUPABASE_SERVICE_KEY

---

## Current Blocker (Production Only)

Auth works correctly — Google OAuth redirects to /logs after sign in. But /logs returns a 404
on the Vercel production deployment. Local development works perfectly on http://localhost:3000.

Runtime logs in Vercel show the edge cache is serving a stale 404 for /logs. The Cache status
shows HIT on key /404, meaning an earlier failed request was cached.

**Fix options to try:**
1. Vercel dashboard → Deployments → Redeploy with build cache completely disabled
2. Add `Cache-Control: no-store` headers for dynamic routes in next.config.js
3. Vercel support ticket to purge edge cache for poke-notes-app.vercel.app

---

## Google OAuth Setup

- Google Cloud Console project: "Poke Notes"
- Authorised JavaScript origins: (none needed — Supabase handles this)
- Authorised redirect URIs:
  - https://uhsqehjapqarbsmlqnnp.supabase.co/auth/v1/callback  ← critical, must be present
  - https://poke-notes-app.vercel.app/auth/callback
- Supabase Auth → URL Configuration:
  - Site URL: https://poke-notes-app.vercel.app
  - Redirect URLs: https://poke-notes-app.vercel.app/auth/callback

---


## Database Schema (Key Tables)

### logs
- id, user_id, date, result (Win/Loss), format, go_order (First/Second/"")
- self_player_name, self_deck_name, self_deck_sprites (comma-separated slugs)
- opponent_player_name, opponent_deck_name, opponent_deck_sprites (comma-separated slugs)
- total_turns, coin_toss_won, self_prizes_taken, opponent_prizes_taken
- self_attack_damage, opponent_attack_damage, self_mulligans, opponent_mulligans
- linked_deck_id (FK to decks — currently null for migrated logs, needs re-linking in Phase 6)
- raw_log (full text), sections (JSONB — array of LogSection), search_vector (tsvector)
- Note: go_order is empty string for some migrated logs — old app didn't store it as a column,
  it was derived at display time. Can be re-derived from sections JSONB in a future cleanup pass.

### decks
- id, user_id, deck_name, format, go_preference
- deck_pokemon (JSONB array of slug strings)
- core_strategy, general_notes, setup_goals (text[]), resource_plan
- deck_lists (JSONB array of DeckList objects — see structure below)

### DeckList structure (inside deck_lists JSONB):
```json
{
  "id": "decklist-xxx",
  "name": "List name",
  "format": "SVI-ASC",
  "rawList": "full raw text pasted by user",
  "parsedCards": [
    { "count": 4, "name": "Dragapult ex", "set": "TWM", "number": "130", "category": "Pokemon" }
  ]
}
```
parsedCards has been backfilled for all 15 existing deck lists (420 cards total).
category is one of: "Pokemon", "Trainer", "Energy", "Unknown"
NOTE: trainer subtype (Supporter/Item/Tool/Stadium) is NOT stored — deferred to Phase 9.

### pokemon_catalog
- slug (PK, e.g. "dragapult"), label (e.g. "Dragapult"), national_dex (integer)
- stage ("Basic", "Stage 1", "Stage 2"), evolves_from (FK to self)
- sprite_url, name_de, name_es, name_fr, name_it, name_pt_br
- 1025 Pokemon seeded from PokéAPI with two-pass evolves_from FK handling

### archetype_catalog
- id (PK, e.g. "dragapult" — from alt attribute of sprite img on Limitless /decks page)
- label (e.g. "Dragapult ex"), sprites (JSONB array of slugs), is_excluded (boolean)
- is_excluded = true for "toedscruel-ex" (causes false positive matches)
- 25 archetypes seeded from Limitless TCG /decks page

### profiles
- id (FK to auth.users), display_name, email, role ("user" or "admin")

---

## App File Structure

```
app/
  (app)/                    # Protected routes — server-side session check in layout
    layout.tsx              # Checks session, redirects to /login if no session
    logs/
      page.tsx              # Battle logs list (async server component, real Supabase data)
      [id]/page.tsx         # Log detail page (async server component)
    decks/
      page.tsx              # Deck list page (async server component)
      [id]/page.tsx         # Deck detail page (async server component)
      [id]/lists/[listId]/page.tsx  # Visual deck list — card image grid
    stats/page.tsx          # Placeholder
    calculator/page.tsx     # Placeholder
    profile/page.tsx        # Placeholder
  (auth)/
    login/page.tsx          # Google OAuth sign in (client component)
  (admin)/                  # Admin routes — checks profile.role === 'admin' server-side
    admin/dashboard/page.tsx
  auth/
    callback/route.ts       # OAuth callback — exchanges code for session, redirects to /logs
  shared/[token]/page.tsx   # Public shared log (no auth required)
  globals.css               # CSS variables for light (:root) and dark (.dark) mode
  layout.tsx                # Root layout — ThemeProvider wraps children

components/ui/
  Button.tsx                # Primary/secondary/ghost variants — has hardcoded px-4 py-2
                            # DO NOT use Button for icon-only buttons — use plain <button>
  Card.tsx                  # Surface wrapper
  PageHeader.tsx            # Breadcrumb + title + subtitle + optional action slot
  Sidebar.tsx               # Desktop sidebar + mobile drawer (client component)
                            # Uses usePathname for active state, useTheme for dark mode
  StatCard.tsx              # Label/value/detail card with optional valueColor (win/loss/default)
  LogRow.tsx                # Battle log row — client component (onError on sprite imgs)
  DeckCard.tsx              # Deck grid card — links to /decks/{id}
  DeckListCard.tsx          # Card image in visual deck list — client component (onError)
                            # Badge images from: limitless3.nyc3.cdn.digitaloceanspaces.com/decklist/{count}.png
  SpriteStrip.tsx           # Pokemon sprite images — client component (onError)
  ResultBadge.tsx           # Win/Loss pill badge
  Badge.tsx                 # Generic pill badge
  ThemeProvider.tsx         # Light/dark mode context — reads/writes localStorage
  icons.tsx                 # SVG icons — Moon, Sun, Menu, Close, Chevron, Pencil, Trash
                            # SVG paths copied exactly from current app's ui-icons.js

lib/
  supabase/
    server.ts               # createServerClient with Next.js cookie handling
    client.ts               # createBrowserClient for client components
  db/
    logs.ts                 # getLogSummaryStats, getLogsPage, getLogById
    decks.ts                # getDecks, getDeckById, getDeckLogStats, getDeckWithList

types/index.ts              # All TypeScript types — BattleLog, BattleLogSummary, Deck, etc.
middleware.ts               # Refreshes Supabase session on every request
```

---


## CDN URLs Used Throughout App

- **Pokemon sprites:** https://r2.limitlesstcg.net/pokemon/gen9/{slug}.png
- **Card images (primary):** https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/{SET}/{SET}_{PADDED_NUMBER}_R_EN_SM.png
- **Card images (fallback):** https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/{SET}/{SET}_{PADDED_NUMBER}_EN_SM.png
- **Card link:** https://limitlesstcg.com/cards/{SET}/{NUMBER}
- **Count badge images:** https://limitless3.nyc3.cdn.digitaloceanspaces.com/decklist/{count}.png
  These are pre-made badge images (hexagon shape with bevel) — NOT CSS clip-path.
  This was a key discovery: the current app uses actual Limitless CDN images for badges,
  not a CSS hexagon. This is why the badges have the correct bevel and colour.

Card number padding: "5" → "005", "130" → "130", "GG70" → "GG070"
```typescript
function formatCardNumber(number: string): string {
  const match = number.match(/^([A-Za-z]*)(\d+)([A-Za-z]*)$/);
  if (match) {
    const [, prefix, digits, suffix] = match;
    return `${prefix}${digits.padStart(3, '0')}${suffix}`;
  }
  return number;
}
```

---

## What's Built (Phases 0-3)

### Phase 0 — Foundation ✅
- Normalised schema with proper columns for all filterable data
- RLS policies on all tables
- migrate.mjs — migrated all data from old app
- seed-pokemon.mjs — 1025 Pokemon, two-pass evolves_from FK (Base Pokemon first, then evolutions)
- seed-archetypes.mjs — 25 archetypes parsed from Limitless /decks HTML
  Key learning: archetype ID comes from alt attribute of sprite img, NOT from the href URL
  (href URLs are numeric like /decks/284, not slug-based)
- backfill-deck-lists.mjs — populated parsedCards for all 15 deck lists (420 cards)
- GitHub repo connected to Vercel with env vars set

### Phase 1 — Scaffold ✅
- Full Next.js 14 App Router project
- Google OAuth with persistent cookie-based sessions
- All route groups and placeholder pages

### Phase 2 — Navigation + Logs ✅
- Desktop sidebar: Pokéball logo, nav links with blue left border active state, user initials
  avatar, theme toggle (moon/sun icons) — icon-only buttons use plain <button> not Button component
- Mobile: sticky top bar with Pokéball logo, hamburger menu, theme toggle
- Mobile drawer: QUICK ACTIONS / NAVIGATE / ACCOUNT sections, closes on nav or backdrop click
- Light/dark mode — default light, toggle saves to localStorage, applies .dark class to <html>
- Icons: SVG paths copied exactly from /Pokemon Note App/src/shared/ui-icons.js
- Battle logs list: grouped by date, win/loss record per day, green/red row backgrounds, sprites
- Stats row: 3 StatCards with SQL count queries (not JS array filtering)
- Log detail: hero card with both players + sprites, 4 StatCards, full turn sections with actions
  and bulleted details — sections rendered from JSONB sections array

### Phase 3 — Decks ✅
- Deck list: 2-column grid, sprites from deck_pokemon JSONB, format badge, go preference
- Deck detail: hero with sprites, stats (shows 0 — linked_deck_id null from migration),
  strategy sections (hidden when empty), deck lists with "View List" links
- Visual deck list: card image grid (4 cols mobile, 6 sm, 8 lg), correct Limitless badge images
- Cards sorted: Pokemon → Trainer → Energy, sorted by count desc within each group
  NOTE: trainer subtype ordering (Supporter before Item etc) deferred to Phase 9

---

## Remaining Phases

### Phase 4 — Stats Page
- Win rate by format (SQL GROUP BY queries)
- Win rate by matchup (opponent_deck_name)
- Win rate by go order (go_order)
- Trend over time

### Phase 5 — Log Import
- Port PTCGL log parser from /Pokemon Note App/src/features/logs/
- Import UI on logs page (the "Import PTCGL Log" button in sidebar quick actions)
- Parse: date, result, players, deck names, sprites, go order, sections, stats
- Auto-detect self deck from player name matching profile display_name
- Store raw_log, sections, all stat columns correctly

### Phase 6 — Deck Management
- Create new deck form
- Edit deck (name, format, go preference, strategy text sections)
- Add and edit deck lists — rawList input → parsedCards generated at save time
  (store BOTH rawList and parsedCards, don't re-parse at display time)
- Re-establish linked_deck_id on migrated logs

### Phase 7 — Probability Calculator
- Port from /Pokemon Note App/src/features/calculator.js

### Phase 8 — Full-Text Search
- search_vector tsvector column already set up in schema with trigger
- Search UI on logs list page

### Phase 9 — Card Metadata Caching
- Store trainer subtypes (Supporter/Item/Tool/Stadium) in parsedCards at save time
- Requires Limitless search API call: GET https://limitlesstcg.com/api/search?q={name}&lang=en
- Re-run backfill to populate subtypes for existing deck lists
- Proper card ordering matching current app: Pokemon (by evolution line) → Supporters → Items →
  Tools → Stadiums → Energy
- Daily cron job for catalog refresh (CRON_SECRET already set in Vercel)

### Phase 10 — Admin Panel
- /admin/dashboard with server-side role check (profile.role === 'admin')
- User management
- Archetype exclusion management (is_excluded on archetype_catalog)

---

## Codex Prompting Strategy

**Tier selection:**
- o4-mini: Single file fixes, bounded scripts, investigation tasks, parsing fixes
- o4-medium: Multi-file features, broad codebase changes, new pages
- o4-high: Complex architecture decisions, when medium has already failed

**Critical rule:** Always read the current app source files before writing Codex prompts for
anything visual or behavioural. The current app source is at:
/Users/jamesembling/Documents/Codex/workspaces/Pokemon Note App/

Key files to check before prompting:
- site.css — all CSS classes, colours, exact styling (this is compiled Tailwind)
- src/shared/ui-icons.js — all SVG icon paths
- src/features/decks/deck-list-graphics.js — card rendering, badge CDN URLs, sorting logic
- src/features/decks/deck-list-parse.js — raw list parser

**DO NOT guess at styling** — always read site.css first. Many mistakes in this session came
from guessing at CSS values instead of reading the source.

---

## Git Workflow

```bash
# After Codex writes code and you've tested locally:
cd /Users/jamesembling/Documents/Codex/workspaces/PokeNotesV2
git add .
git commit -m "Description of what changed"
git push origin main
# Vercel auto-deploys from main
```

Rules:
- Always test locally first (npm run dev → http://localhost:3000)
- Never commit without seeing it work locally
- Never commit broken code
- Commit messages should describe what the feature does, not what files changed

---

## Scripts in Workspace Root (All Already Run)

- migrate.mjs — one-off migration from old Supabase (done)
- seed-pokemon.mjs — seeds pokemon_catalog from PokéAPI (done)
- seed-archetypes.mjs — seeds archetype_catalog from Limitless (done)
- backfill-deck-lists.mjs — populates parsedCards in deck_lists JSONB (done)

All scripts use NEW_SUPABASE_URL and NEW_SUPABASE_SERVICE_KEY from .env.
