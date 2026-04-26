create index if not exists logs_user_date_imported_id
  on public.logs (user_id, date desc, imported_at desc, id desc);

revoke all on function public.refresh_deck_log_stats(uuid, text) from public;
revoke all on function public.refresh_deck_log_stats(uuid, text) from anon;
revoke all on function public.refresh_deck_log_stats(uuid, text) from authenticated;
revoke all on function public.sync_deck_log_stats_from_log_row() from public;
revoke all on function public.sync_deck_log_stats_from_log_row() from anon;
revoke all on function public.sync_deck_log_stats_from_log_row() from authenticated;

revoke all on function public.refresh_user_log_stats(uuid) from public;
revoke all on function public.refresh_user_log_stats(uuid) from anon;
revoke all on function public.refresh_user_log_stats(uuid) from authenticated;
revoke all on function public.sync_user_log_stats_from_log_row() from public;
revoke all on function public.sync_user_log_stats_from_log_row() from anon;
revoke all on function public.sync_user_log_stats_from_log_row() from authenticated;

notify pgrst, 'reload schema';
