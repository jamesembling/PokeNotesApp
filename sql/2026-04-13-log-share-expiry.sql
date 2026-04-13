alter table public.log_shares
  add column if not exists expires_at timestamptz not null default (now() + interval '30 days');
