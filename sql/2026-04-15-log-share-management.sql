alter table public.log_shares
  add column if not exists source_log_id text;

create index if not exists log_shares_owner_source_log
  on public.log_shares (owner_user_id, source_log_id);
