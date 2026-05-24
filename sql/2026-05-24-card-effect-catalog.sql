create table if not exists public.card_effect_catalog (
  source_card_id          text not null,
  card_name               text not null,
  normalized_card_name    text not null,
  supertype               text not null default '',
  subtypes                jsonb not null default '[]',
  effect_kind             text not null
                            check (effect_kind in ('ability', 'attack', 'supporter', 'item', 'tool', 'stadium')),
  effect_name             text,
  normalized_effect_name  text not null default '',
  effect_text             text,
  last_synced_at          timestamptz not null default now(),

  primary key (source_card_id, effect_kind, normalized_effect_name)
);

alter table public.card_effect_catalog
  drop constraint if exists card_effect_catalog_check;

comment on table public.card_effect_catalog is
  'Structured Pokemon TCG card effects used to classify battle-log actions without live card lookups.';
comment on column public.card_effect_catalog.source_card_id is
  'Pokemon TCG API card id for the printed card version.';
comment on column public.card_effect_catalog.effect_kind is
  'Battle-log classification derived from card data. Pokemon effects are ability or attack; trainer cards are supporter, item, tool, or stadium.';

grant select on table public.card_effect_catalog to anon, authenticated;
grant all privileges on table public.card_effect_catalog to service_role;

create index if not exists card_effect_catalog_card_effect
  on public.card_effect_catalog (normalized_card_name, normalized_effect_name, effect_kind);

create index if not exists card_effect_catalog_card_kind
  on public.card_effect_catalog (normalized_card_name, effect_kind);

alter table public.card_effect_catalog enable row level security;

drop policy if exists "Anyone can read card effect catalog" on public.card_effect_catalog;

create policy "Anyone can read card effect catalog"
  on public.card_effect_catalog for select
  using (true);
