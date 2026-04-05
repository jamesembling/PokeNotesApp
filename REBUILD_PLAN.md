# Poke Notes — Full Rebuild Plan

## Why We're Rebuilding

The current app is built in vanilla JS with HTML string rendering. It works, but the
architecture has fundamental limitations that compound as the user base grows:

- All data fetching happens client-side, causing loading jank and state sync bugs
- Everything is stored in JSON blobs in Supabase, making filtering and stats expensive
- A single global mutable state object causes derived data to overwrite real user data
- In-memory search, client-side stat computation, and localStorage caching all break at scale
- Accumulated hardcoded patches (archetype aliases, evolution rules) mask root problems
- No test environment — every change goes straight to production

The rebuild fixes all of these structurally, not symptomatically.

---

## Principles

- The database is the source of truth. The app is a view of the database.
- Data fetching happens server-side by default. Client components are the exception.
- Fix root causes, never patch symptoms.
- Consistent over clever — one way to do everything, used everywhere.
- No localStorage for user data. You either log in or you don't use it.
- Security is built in from day one, not retrofitted.

---

## Tech Stack

| Concern | Choice | Reason |
|---|---|---|
| Framework | Next.js 14 App Router | Server components, file routing, Vercel-native |
| Language | TypeScript | Catches bugs at write time, better Codex output |
| Database | Supabase (Postgres) | Existing, carries over |
| Auth | Supabase + `@supabase/ssr` | Cookie-based sessions, no re-auth bug |
| Styling | Tailwind CSS + CSS variables | Design system enforced via tokens |
| Deployment | Vercel | Existing, preview deployments for free |

---

## Phase 0 — Foundation (Before Any App Code)

Everything in this phase must be complete before writing a single page or component.
This is the work that makes everything else correct.

### 0a. Document Known Edge Cases

Create `docs/known-edge-cases.md` capturing every hardcoded fix in the current app
and why it exists. This prevents re-introducing the same bugs in the rebuild.

Specifically document:
- Every entry in `ALIASES` in `sprites.js` and what bug it fixed
- Every entry in `SPRITE_ALIAS_TERMS` in `battle-log.js` and why
- The `INVALID_ARCHETYPE_IDS` exclusions and what false positives they prevented
- The `POKEMON_STRINGS` translation patches and which languages/Pokemon were affected
- Any quirks in the battle log parser that were fixed after launch

### 0b. Design the New Schema

Replace the JSON blob pattern with properly normalised tables. Anything that will
ever be filtered, sorted, searched, or aggregated becomes a real column.
Genuinely nested data (sections, turn-by-turn) stays as JSONB.

#### logs (new)
```sql
create table public.logs (
  id              text primary key,
  user_id         uuid not null references auth.users(id),
  date            date not null,
  result          text not null check (result in ('Win', 'Loss')),
  format          text not null default '',
  self_player_name      text not null default '',
  self_deck_name        text not null default '',
  self_deck_slug        text not null default '',
  self_deck_sprites     text not null default '',
  opponent_player_name  text not null default '',
  opponent_deck_name    text not null default '',
  opponent_deck_slug    text not null default '',
  opponent_deck_sprites text not null default '',
  go_order        text not null default '' check (go_order in ('First', 'Second', '')),
  total_turns     integer not null default 0,
  coin_toss_won   boolean,
  self_prizes_taken     integer not null default 0,
  opponent_prizes_taken integer not null default 0,
  self_attack_damage    integer not null default 0,
  opponent_attack_damage integer not null default 0,
  self_mulligans        integer not null default 0,
  linked_deck_id  text,
  linked_deck_list_id text,
  reason          text not null default '',
  raw_log         text not null default '',
  sections        jsonb not null default '[]',
  imported_at     timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
```

#### decks (new)
```sql
create table public.decks (
  id              text primary key,
  user_id         uuid not null references auth.users(id),
  deck_name       text not null default '',
  format          text not null default '',
  deck_pokemon    jsonb not null default '[]',
  go_preference   text not null default '',
  core_strategy   text not null default '',
  general_notes   text not null default '',
  setup_goals     jsonb not null default '[]',
  resource_plan   text not null default '',
  deck_lists      jsonb not null default '[]',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
```

#### pokemon_catalog (new — replaces bundled file)
```sql
create table public.pokemon_catalog (
  slug            text primary key,
  label           text not null,
  national_dex    integer,
  stage           text not null default 'Basic',
  evolves_from    text,
  sprite_url      text not null default '',
  name_de         text,
  name_es         text,
  name_fr         text,
  name_it         text,
  name_pt_br      text,
  last_synced_at  timestamptz not null default now()
);
```

#### archetype_catalog (new — replaces bundled file)
```sql
create table public.archetype_catalog (
  id              text primary key,
  label           text not null,
  sprites         jsonb not null default '[]',
  is_excluded     boolean not null default false,
  last_synced_at  timestamptz not null default now()
);
```

#### log_shares (unchanged structure, keep as-is)
#### profiles (unchanged structure, keep as-is)

### 0c. Write Database Indexes

Add indexes for every column that will be filtered or sorted in queries:

```sql
create index logs_user_id_date on public.logs (user_id, date desc);
create index logs_user_id_result on public.logs (user_id, result);
create index logs_user_id_format on public.logs (user_id, format);
create index logs_linked_deck_id on public.logs (linked_deck_id) where linked_deck_id is not null;
create index decks_user_id on public.decks (user_id);
```

### 0d. Write RLS Policies

Every table gets explicit RLS policies before any data is written to it.
RLS must be tested — do not assume it works.

```sql
-- Logs
alter table public.logs enable row level security;
create policy "Users see own logs" on public.logs for select using (auth.uid() = user_id);
create policy "Users insert own logs" on public.logs for insert with check (auth.uid() = user_id);
create policy "Users update own logs" on public.logs for update using (auth.uid() = user_id);
create policy "Users delete own logs" on public.logs for delete using (auth.uid() = user_id);

-- Same pattern for decks

-- Catalogs are public read, no user writes
alter table public.pokemon_catalog enable row level security;
create policy "Public read pokemon catalog" on public.pokemon_catalog for select using (true);

alter table public.archetype_catalog enable row level security;
create policy "Public read archetype catalog" on public.archetype_catalog for select using (true);

-- Log shares — public read by token only
alter table public.log_shares enable row level security;
create policy "Public read log shares" on public.log_shares for select using (true);
create policy "Owners insert log shares" on public.log_shares for insert with check (auth.uid() = owner_user_id);
create policy "Owners delete log shares" on public.log_shares for delete using (auth.uid() = owner_user_id);
```

### 0e. Write Migration Script

Write a one-time script that reads existing payload blobs and populates the new
normalised columns for all existing logs, decks, and matchups.

Run on dev database first. Verify all records migrated correctly. Then run on prod.

### 0f. Seed Catalogs

Write scripts to populate `pokemon_catalog` from PokéAPI and `archetype_catalog`
from Limitless TCG. These replace the bundled JS files.

Incorporate all known edge cases from `docs/known-edge-cases.md` into the seeding
logic — not as hardcoded patches but as proper data.

### 0g. Configure Environments

- Create second Supabase project for development
- Set up repo with `main` (production) and `dev` (development) branches
- Configure Vercel environment variables for both environments
- Verify preview deployments work and point at dev Supabase

### 0h. Define Core TypeScript Types

Before any component is written, define types for all core data structures:

```typescript
// types/index.ts
type BattleLog = { ... }
type Deck = { ... }
type Matchup = { ... }
type Player = { ... }
type Archetype = { ... }
type LogShare = { ... }
type UserProfile = { ... }
```

These types are included in every relevant Codex session brief.

---

## Phase 1 — Scaffold

**Goal:** Working Next.js app with auth, routing, and empty pages.
**Done when:** A user can sign in with Google, see an empty shell for each section,
and sign out. Auth persists across browser restarts.

Tasks:
- Next.js 14 project with TypeScript and Tailwind
- `@supabase/ssr` auth with Google OAuth
- Middleware for session refresh on every request
- Route groups: `(app)` for protected routes, public for shared logs and auth
- Empty pages: `/logs`, `/decks`, `/matchups`, `/stats`, `/calculator`, `/profile`
- `/shared/[token]` public route
- `/admin` route group with server-side admin role check
- Desktop sidebar navigation
- Mobile top bar + drawer navigation
- Theme toggle (light/dark) — only localStorage use permitted

Supabase settings to verify:
- JWT expiry: 3600
- Refresh token rotation: enabled
- Session timeout: 30 days

### Codex Brief — Phase 1

```
[paste project brief + design.md + types/index.ts]

Task: Scaffold the Next.js 14 app with the following:
- Auth via @supabase/ssr with Google OAuth
- Middleware that refreshes the session on every request
- Route group (app) with a layout that redirects to /login if no session
- Route group (admin) with a layout that checks profile.role === 'admin' server-side
- Public routes: /login, /auth/callback, /shared/[token]
- Empty page shells for: /logs, /decks, /matchups, /stats, /calculator, /profile
- Desktop sidebar using the navigation spec in design.md
- Mobile top bar + slide-in drawer using the navigation spec in design.md
- Theme toggle that stores preference in localStorage only

Do not fetch any data yet. Pages should render their PageHeader component with
correct breadcrumbs and an empty content area.
```

---

## Phase 2 — Battle Logs (Read)

**Goal:** Server-side fetched log list and log detail views.
**Done when:** A logged-in user sees their logs listed by date, can click a log to
see the full detail view, and the data is fetched server-side with no loading spinner
on first render.

Tasks:
- `lib/db/logs.ts` — all log queries
- Paginated log list query (default: 30 most recent by date)
- Log detail query by ID
- `LogList` server component
- `LogRow` component using design system win/loss treatment
- `LogDetail` server component with sections, players, stats
- `SpriteStrip` component
- Load more pagination (server-side, not client fetch)
- Shared log view at `/shared/[token]`

### Codex Brief — Phase 2

```
[paste project brief + design.md + types/index.ts + lib/db/logs.ts if exists]

Task: Build the battle logs read experience.

The /logs page is a server component that:
- Fetches the 30 most recent logs for the authenticated user from the logs table
- Renders them grouped by date using the LogRow component
- Shows a summary stat bar at the top (total, wins, losses) from a SQL count query
- Has a "Load more" button that fetches the next 30 logs (server action, not client fetch)

The /logs/[id] page is a server component that:
- Fetches the single log by id, verifying user_id matches auth.uid()
- Renders the full log detail using the sections JSONB column
- Shows player stats from the normalised columns (not derived from sections)
- Has an Edit and Share button (client components, behaviour in next phase)

Use only components from components/ui/. Refer to design.md for all styling.
Data fetching uses createServerClient from @supabase/ssr. No useEffect. No client fetches.
```

---

## Phase 3 — Battle Logs (Write)

**Goal:** Users can import new logs and edit existing ones.
**Done when:** A user can paste a raw PTCGL log, have it parsed and identified,
save it, and see it immediately in the list.

Tasks:
- `lib/battle-log/parser.ts` — port and clean up existing parser in TypeScript
- `lib/battle-log/archetype.ts` — identification using database catalog, not hardcoded aliases
- `lib/battle-log/stats.ts` — derive stats from parsed sections
- Pre-evolution matching derived from `pokemon_catalog.evolves_from`, not hardcoded
- Multi-language support using `pokemon_catalog.name_*` columns
- Log import form (client component)
- Log edit form (client component)
- Server actions for create, update, delete
- Rate limiting on import: max 20 imports per user per hour
- Input length limit on raw log text

### Codex Brief — Phase 3

```
[paste project brief + types/index.ts + known-edge-cases.md + lib/battle-log/parser.ts]

Task: Build the archetype identification system.

Archetype identification must:
- Query the archetype_catalog table for known archetypes (do not use hardcoded lists)
- For each archetype, look up its sprites' pre-evolutions from pokemon_catalog using
  the evolves_from column (do not hardcode evolution lines)
- Match against the relevant lines of the raw log text
- Support non-English logs using name_de, name_es, name_fr, name_it, name_pt_br
  columns from pokemon_catalog (do not hardcode translations)
- Exclude archetypes where is_excluded = true in archetype_catalog
- Return the best match with a confidence score

Known edge cases to handle (from known-edge-cases.md):
[paste relevant entries]

This function runs server-side only. It takes the parsed log sections and the
user's language preference. It returns an archetype ID and label or null.
```

---

## Phase 4 — Stats

**Goal:** Stats page powered entirely by SQL aggregates.
**Done when:** The stats page loads with no JavaScript computation — all numbers
come from database queries.

Tasks:
- `lib/db/stats.ts` — all stats queries
- Overall win/loss/total counts (SQL count with filter)
- Win rate by format (group by format)
- Win rate by opponent deck (group by opponent_deck_slug)
- Coin flip win rate
- Average turns per game
- Stat display components using StatCard from design system

### Codex Brief — Phase 4

```
[paste project brief + design.md + types/index.ts + lib/db/stats.ts]

Task: Build the stats page.

The /stats page is a server component that runs all queries in parallel using
Promise.all. No stats are computed in JavaScript — all numbers come from SQL.

Queries needed:
- Total logs, wins, losses for the authenticated user
- Win rate grouped by format
- Win rate grouped by opponent_deck_slug (top 10 matchups)
- Coin flip wins / total
- Average total_turns across all logs
- Self attack damage total, opponent attack damage total

All queries use the normalised columns (result, format, opponent_deck_slug etc).
No queries touch the sections JSONB column.

Use StatCard from components/ui/ for all number displays.
Use design.md for layout — stat grids are 2-column mobile, 4-column desktop.
```

---

## Phase 5 — Decks

**Goal:** Full deck strategy feature.
**Done when:** Users can create, edit, view, and delete decks,
with linked logs showing correctly.

Tasks:
- `lib/db/decks.ts`
- Deck list and detail views (server components)
- Create/edit forms (client components)
- Deck-log linking (uses `linked_deck_id` column on logs)
- Win rate per deck pulled from SQL, not computed in JS
- Pokemon picker component (client — needs interactivity)

---

## Phase 6 — Search

**Goal:** Full-text search across logs and decks.
**Done when:** A user can search and get relevant results instantly from the database.

Tasks:
- Add `tsvector` search columns to logs and decks
- Database triggers to keep search vectors updated on insert/update
- `lib/db/search.ts` — single search query across both tables
- Search input component (client — debounced, results server-fetched)
- No in-memory index. No JavaScript string scanning.

```sql
-- Example for logs
alter table public.logs add column search_vector tsvector;

create index logs_search on public.logs using gin(search_vector);

create function update_log_search_vector() returns trigger as $$
begin
  new.search_vector :=
    to_tsvector('english',
      coalesce(new.self_deck_name, '') || ' ' ||
      coalesce(new.opponent_deck_name, '') || ' ' ||
      coalesce(new.raw_log, '')
    );
  return new;
end;
$$ language plpgsql;

create trigger log_search_vector_update
before insert or update on public.logs
for each row execute function update_log_search_vector();
```

---

## Phase 7 — Catalog Refresh (Cron)

**Goal:** Pokemon and archetype catalogs stay current automatically.
**Done when:** A daily cron job refreshes both catalogs without manual intervention.

Tasks:
- `/api/catalog/refresh` endpoint — protected with `CRON_SECRET` header
- Fetches latest archetypes from Limitless TCG
- Fetches latest Pokemon from PokéAPI (incremental — only new entries)
- Updates `archetype_catalog` and `pokemon_catalog` tables
- Applies known edge cases from `known-edge-cases.md` as data rules, not code patches
- Vercel cron configuration in `vercel.json`
- Admin dashboard shows last sync time and entry counts

```json
// vercel.json
{
  "crons": [{
    "path": "/api/catalog/refresh",
    "schedule": "0 3 * * *"
  }]
}
```

---

## Phase 8 — Admin Panel

**Goal:** Proper standalone admin panel, visually distinct from the user app.
**Done when:** An admin user can view user stats, manage roles, monitor catalog
health, and see system-level data. Non-admins cannot access any admin route.

Layout: `/admin` route group with its own layout, darker palette, indigo accent.
Auth: Server-side role check on every request — not client-side.

Pages:
- `/admin/dashboard` — user count, log count, growth over time
- `/admin/users` — user list, role management
- `/admin/catalog` — catalog health, last sync, entry counts, manual refresh trigger

This is built last because it depends on everything else being stable.

---

## Probability Calculator

Port the existing calculator to the new stack. This is self-contained and can
slot in at any phase after Phase 1. It has no database dependency — it operates
purely on the deck list the user pastes in.

---

## Security Checklist

Complete before any phase goes to production:

- [ ] RLS enabled and tested on every table
- [ ] Admin role verified server-side on every `/admin` request
- [ ] Service role key never in `NEXT_PUBLIC_` variables
- [ ] Shared log tokens are cryptographically random, 32+ characters
- [ ] Cron endpoint protected with `CRON_SECRET` header check
- [ ] Rate limiting on log import: 20 per user per hour
- [ ] Raw log input has explicit length limit (e.g. 500KB max)
- [ ] No `dangerouslySetInnerHTML` anywhere in the codebase
- [ ] Supabase session timeout set to 30 days
- [ ] Refresh token rotation enabled in Supabase auth settings

---

## Files That Must Exist Before Codex Starts

These are created manually (or with my help) before any Codex session begins.
They are referenced in every prompt.

| File | Purpose |
|---|---|
| `docs/REBUILD_PLAN.md` | This document |
| `docs/known-edge-cases.md` | All known quirks from the current app |
| `docs/design.md` | Full design system |
| `docs/schema.md` | Final schema with column descriptions |
| `types/index.ts` | All core TypeScript types |
| `AGENTS.md` | Codex working rules and constraints |

---

## AGENTS.md (Codex Working Rules)

```markdown
# AGENTS.md

## Project
Poke Notes — a Pokemon TCG battle log and deck strategy tracker.
Next.js 14 App Router, TypeScript, Supabase, Tailwind CSS, deployed on Vercel.

## Core Constraints
- Data fetching happens server-side by default. Page components are async server
  components. Never use useEffect to fetch data.
- localStorage is only used for theme preference. Never store user data client-side.
- All user data lives in Supabase with proper normalised columns.
- Use only components from components/ui/ for all UI. Never build bespoke UI inline.
- Every page starts with <PageHeader>. No exceptions.
- Refer to docs/design.md for all colour, spacing, and typography decisions.
- Auth is enforced at the layout level server-side. Never check auth client-side.
- Admin role is verified server-side on every /admin request.
- No hardcoded archetype aliases or evolution lines — use the database catalogs.
- TypeScript strict mode. No `any` types without explicit justification.

## Working Rules
- Read existing code before proposing changes.
- One goal per session. Do not refactor while fixing bugs.
- If a component you need doesn't exist in components/ui/, build it there first.
- If a schema change is required, write the migration SQL explicitly.
- Mobile layout is built simultaneously with desktop, never as an afterthought.
- Fix sessions and refactor sessions are separate — never mix them.

## Done Criteria
Every task must define: Goal, Constraints, Done when.
A task is not done until the done criteria are met — not when the code looks right.
```

---

## The Master Codex Project Brief

Paste this at the start of every Codex session:

```
I am rebuilding Poke Notes — a Pokemon TCG battle log and deck strategy tracker.

Tech stack: Next.js 14 App Router, TypeScript, Supabase (Postgres),
@supabase/ssr for auth, Tailwind CSS, deployed on Vercel.

Core principle: Data fetching happens server-side by default. Page components
are async server components that await Supabase queries. Client components are
only used when interactivity is needed. Never use useEffect to fetch data.

Auth: Cookie-based sessions via @supabase/ssr. All routes in (app) require
authentication enforced at the layout level. The only public routes are /login,
/auth/callback, and /shared/[token].

Storage: No localStorage for user data. Theme preference only. All user data
lives in Supabase with normalised columns — not JSON blobs.

Design: Use only components from components/ui/. Every page starts with
<PageHeader>. Refer to docs/design.md for all design decisions.

Security: RLS enforced on all tables. Admin role verified server-side.
Service role key never in NEXT_PUBLIC_ variables.

Schema: [paste docs/schema.md]
Types: [paste types/index.ts]
```
