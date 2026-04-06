# Poke Notes Rebuild Plan

**Stack:** Next.js 14 App Router, TypeScript, Supabase, Tailwind CSS, Vercel

---

## Phase 0 — Foundation ✅ COMPLETE

- Schema design and Supabase setup
- Data migration from old app (2 users, 10 decks, 136 logs)
- Pokemon catalog seeding (1025 Pokemon with evolution chains and localised names)
- Archetype catalog seeding (25 archetypes from Limitless)
- GitHub repo created and connected to Vercel
- TypeScript types in types/index.ts

---

## Phase 1 — App Scaffold ✅ COMPLETE

- Next.js 14 project with App Router
- Google OAuth via @supabase/ssr
- Protected route group (app) with server-side session check
- Middleware session refresh on every request
- Route groups: (app), (auth), (admin)
- Empty page shells for all routes

---

## Phase 2 — Navigation + Battle Logs ✅ COMPLETE

- Desktop sidebar with nav links, active state, user avatar, theme toggle
- Mobile top bar with hamburger, Pokéball logo, theme toggle
- Mobile slide-in drawer with QUICK ACTIONS / NAVIGATE / ACCOUNT sections
- Light and dark mode with correct SVG icons from current app
- Battle logs list — server-side, real data, grouped by date, win/loss colours, sprites
- Stats row — correct counts from SQL (total, wins, losses)
- Log detail page — both players with sprites, stats row, full turn sections

---

## Phase 3 — Decks ✅ COMPLETE

- Deck list page — 2-column grid, sprites, format badge, go preference
- Deck detail page — hero with sprites, stats row, strategy sections, deck lists
- Deck list backfill script — parsedCards populated for all 15 deck lists (420 cards)
- Visual deck list — card image grid with Limitless CDN badge images
- Badge images sourced from: limitless3.nyc3.cdn.digitaloceanspaces.com/decklist/{count}.png

---

## Phase 4 — Stats Page ⬜ TODO

- Win rate by format (SQL aggregate queries)
- Win rate by matchup (opponent deck name)
- Win rate by go order (first vs second)
- Trend over time

---

## Phase 5 — Log Import ⬜ TODO

- PTCGL log parser (port from current app)
- Import flow UI on logs page
- Auto-detect deck from log
- Auto-link log to deck via linked_deck_id

---

## Phase 6 — Deck Management ⬜ TODO

- Create new deck form
- Edit deck details (name, format, go preference, strategy sections)
- Add and edit deck lists
- Re-establish linked_deck_id on migrated logs

---

## Phase 7 — Probability Calculator ⬜ TODO

- Port calculator from current app
- Connect to deck lists

---

## Phase 8 — Search ⬜ TODO

- Postgres full-text search on logs (search_vector column already set up)
- Search UI on logs page

---

## Phase 9 — Card Metadata Caching ⬜ TODO

- Store trainer subtypes (Supporter/Item/Tool/Stadium) in parsedCards during save
- Re-run backfill to populate subtypes for existing deck lists
- Proper card ordering in visual deck list matching current app
- Cron job for daily catalog refresh (pokemon_catalog + archetype_catalog)

---

## Phase 10 — Admin Panel ⬜ TODO

- /admin/dashboard route (server-side role check)
- User management
- Archetype exclusion management (is_excluded flag)

---

## Current Blocker

Vercel 404 on /logs in production. Auth works correctly (redirects to /logs after Google OAuth).
Vercel edge cache is serving a stale 404 for /logs from an earlier failed request.

Fix options:
1. Vercel dashboard → Deployments → Redeploy with no build cache
2. Add cache-control headers to next.config.js for dynamic routes
3. Raise Vercel support ticket to purge edge cache for poke-notes-app.vercel.app

Local development works correctly on http://localhost:3000

---

## Key Technical Decisions

- Server components by default, client components only for interactivity (onError, onClick etc)
- No localStorage for user data — auth-gated only
- localStorage only for theme preference (light/dark)
- All colours via CSS variables — never hardcode Tailwind colour classes
- Sprites from Limitless CDN: r2.limitlesstcg.net/pokemon/gen9/{slug}.png
- Card images from Limitless CDN: limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/{SET}/{SET}_{NUMBER}_R_EN_SM.png
- Badge images from Limitless CDN: limitless3.nyc3.cdn.digitaloceanspaces.com/decklist/{count}.png
- Trainer subtype ordering deferred until Phase 9 card metadata caching

---

## Codex Tier Strategy

- o4-mini: Bounded investigation, single-file fixes, scripts
- o4-medium: Multi-file features, broad codebase changes
- o4-high: Complex architecture decisions, hard reasoning problems
