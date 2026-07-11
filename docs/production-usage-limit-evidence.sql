-- Privacy-safe production usage evidence for import, sharing, telemetry, and
-- deck-list limit decisions. Every returned row is an aggregate: this file
-- never returns identifiers, tokens, names, notes, paths, log text, or cards.
--
-- Run against the currently linked project from the repository root:
--   supabase --agent=no db query --linked \
--     --file docs/production-usage-limit-evidence.sql --output table
--
-- Keep this file as one SELECT statement. The linked CLI returns the final
-- result set only, so each evidence section is combined into that result.
-- Percentiles use active user/time buckets: zero-activity days and hours are
-- intentionally excluded. Results are live and drift as new events arrive.

with
share_sizes as (
  select octet_length(payload::text)::bigint as bytes
  from public.log_shares
),
share_size_stats as (
  select
    count(*)::bigint as sample_rows,
    min(bytes)::bigint as min_bytes,
    round(percentile_cont(0.50) within group (order by bytes))::bigint as median_bytes,
    round(percentile_cont(0.90) within group (order by bytes))::bigint as p90_bytes,
    round(percentile_cont(0.95) within group (order by bytes))::bigint as p95_bytes,
    round(percentile_cont(0.99) within group (order by bytes))::bigint as p99_bytes,
    max(bytes)::bigint as max_bytes
  from share_sizes
),
share_status as (
  select
    count(*)::bigint as total_rows,
    count(*) filter (where expires_at > now())::bigint as active_rows,
    count(*) filter (where expires_at <= now())::bigint as expired_or_revoked_rows
  from public.log_shares
),
share_envelope as (
  select
    count(*)::bigint as total_rows,
    count(*) filter (
      where jsonb_typeof(payload) is distinct from 'object'
    )::bigint as fail_payload_object,
    count(*) filter (
      where payload ->> 'version' is distinct from 'v1'
    )::bigint as fail_version_v1,
    count(*) filter (
      where jsonb_typeof(payload -> 'log') is distinct from 'object'
    )::bigint as fail_log_object,
    count(*) filter (
      where jsonb_typeof(payload #> '{log,sections}') is distinct from 'array'
    )::bigint as fail_log_sections_array,
    count(*) filter (
      where jsonb_typeof(payload -> 'linkedStrategyLabel') is distinct from 'string'
    )::bigint as fail_linked_strategy_label_string,
    count(*) filter (
      where payload ? 'linkedDeckListSortedCards'
        and jsonb_typeof(payload -> 'linkedDeckListSortedCards') not in ('array', 'null')
    )::bigint as fail_optional_sorted_cards_array,
    count(*) filter (
      where jsonb_typeof(payload) is distinct from 'object'
        or payload ->> 'version' is distinct from 'v1'
        or jsonb_typeof(payload -> 'log') is distinct from 'object'
        or jsonb_typeof(payload #> '{log,sections}') is distinct from 'array'
        or jsonb_typeof(payload -> 'linkedStrategyLabel') is distinct from 'string'
        or (
          payload ? 'linkedDeckListSortedCards'
          and jsonb_typeof(payload -> 'linkedDeckListSortedCards') not in ('array', 'null')
        )
    )::bigint as fail_any_v1_envelope
  from public.log_shares
),
share_day_buckets as (
  select
    owner_user_id,
    date_trunc('day', created_at) as day_bucket,
    count(*)::bigint as events
  from public.log_shares
  group by owner_user_id, date_trunc('day', created_at)
),
share_rate_stats as (
  select
    count(*)::bigint as active_user_days,
    count(distinct owner_user_id)::bigint as active_users,
    sum(events)::bigint as total_shares,
    min(events)::bigint as min_per_active_user_day,
    round(percentile_cont(0.50) within group (order by events))::bigint
      as median_per_active_user_day,
    round(percentile_cont(0.90) within group (order by events))::bigint
      as p90_per_active_user_day,
    round(percentile_cont(0.95) within group (order by events))::bigint
      as p95_per_active_user_day,
    round(percentile_cont(0.99) within group (order by events))::bigint
      as p99_per_active_user_day,
    max(events)::bigint as max_per_active_user_day
  from share_day_buckets
),
log_measurements as (
  select 'raw_log_bytes'::text as metric, octet_length(raw_log)::bigint as value
  from public.logs
  union all
  select 'sections_json_bytes', octet_length(sections::text)::bigint
  from public.logs
  union all
  select
    'combined_raw_and_sections_bytes',
    (octet_length(raw_log) + octet_length(sections::text))::bigint
  from public.logs
  union all
  select
    'section_count',
    case
      when jsonb_typeof(sections) = 'array'
        then jsonb_array_length(sections)::bigint
    end
  from public.logs
),
log_size_stats as (
  select
    metric,
    count(*) filter (where value is not null)::bigint as sample_rows,
    count(*) filter (where value is null)::bigint as null_or_invalid_rows,
    min(value)::bigint as min_value,
    round(percentile_cont(0.50) within group (order by value))::bigint as median_value,
    round(percentile_cont(0.90) within group (order by value))::bigint as p90_value,
    round(percentile_cont(0.95) within group (order by value))::bigint as p95_value,
    round(percentile_cont(0.99) within group (order by value))::bigint as p99_value,
    max(value)::bigint as max_value
  from log_measurements
  group by metric
),
scoped_logs as (
  select 'all_time'::text as window_label, user_id, imported_at
  from public.logs
  union all
  select 'last_30_days', user_id, imported_at
  from public.logs
  where imported_at >= now() - interval '30 days'
),
import_day_buckets as (
  select
    window_label,
    user_id,
    date_trunc('day', imported_at) as day_bucket,
    count(*)::bigint as imports
  from scoped_logs
  group by window_label, user_id, date_trunc('day', imported_at)
),
import_rate_stats as (
  select
    window_label,
    count(*)::bigint as active_user_days,
    count(distinct user_id)::bigint as active_users,
    sum(imports)::bigint as total_imports,
    min(imports)::bigint as min_per_active_user_day,
    round(percentile_cont(0.50) within group (order by imports))::bigint
      as median_per_active_user_day,
    round(percentile_cont(0.90) within group (order by imports))::bigint
      as p90_per_active_user_day,
    round(percentile_cont(0.95) within group (order by imports))::bigint
      as p95_per_active_user_day,
    round(percentile_cont(0.99) within group (order by imports))::bigint
      as p99_per_active_user_day,
    max(imports)::bigint as max_per_active_user_day
  from import_day_buckets
  group by window_label
),
performance_environment_stats as (
  select
    case
      when deployment_env in ('production', 'preview', 'local', 'unknown')
        then deployment_env
      else 'other'
    end as environment,
    count(*)::bigint as event_rows,
    count(distinct user_id)::bigint as active_users,
    count(distinct (user_id, date_trunc('day', created_at)))::bigint as active_user_days
  from public.route_performance_events
  group by 1
),
performance_windows as (
  select 'all_time'::text as window_label, 'all'::text as scope, user_id, created_at
  from public.route_performance_events
  union all
  select 'all_time', 'production', user_id, created_at
  from public.route_performance_events
  where deployment_env = 'production'
  union all
  select 'last_30_days', 'all', user_id, created_at
  from public.route_performance_events
  where created_at >= now() - interval '30 days'
  union all
  select 'last_30_days', 'production', user_id, created_at
  from public.route_performance_events
  where deployment_env = 'production'
    and created_at >= now() - interval '30 days'
),
performance_buckets as (
  select
    window_label,
    scope,
    'user_hour'::text as bucket_kind,
    user_id,
    date_trunc('hour', created_at) as bucket_start,
    count(*)::bigint as events
  from performance_windows
  group by window_label, scope, user_id, date_trunc('hour', created_at)
  union all
  select
    window_label,
    scope,
    'user_day',
    user_id,
    date_trunc('day', created_at),
    count(*)::bigint
  from performance_windows
  group by window_label, scope, user_id, date_trunc('day', created_at)
),
performance_rate_stats as (
  select
    window_label,
    scope,
    bucket_kind,
    count(*)::bigint as active_buckets,
    count(distinct user_id)::bigint as active_users,
    sum(events)::bigint as total_events,
    min(events)::bigint as min_per_active_bucket,
    round(percentile_cont(0.50) within group (order by events))::bigint
      as median_per_active_bucket,
    round(percentile_cont(0.90) within group (order by events))::bigint
      as p90_per_active_bucket,
    round(percentile_cont(0.95) within group (order by events))::bigint
      as p95_per_active_bucket,
    round(percentile_cont(0.99) within group (order by events))::bigint
      as p99_per_active_bucket,
    max(events)::bigint as max_per_active_bucket
  from performance_buckets
  group by window_label, scope, bucket_kind
),
legacy_lists as (
  select child.value as item
  from public.decks as deck
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(deck.deck_lists) = 'array' then deck.deck_lists
      else '[]'::jsonb
    end
  ) as child(value)
),
deck_measurements as (
  select
    'legacy_occurrence'::text as source,
    'raw_list_bytes'::text as metric,
    octet_length(coalesce(item ->> 'rawList', ''))::bigint as value
  from legacy_lists
  union all
  select
    'legacy_occurrence',
    'raw_list_nonempty_lines',
    (
      select count(*)::bigint
      from regexp_split_to_table(coalesce(item ->> 'rawList', ''), E'\\r?\\n') as line
      where btrim(line) <> ''
    )
  from legacy_lists
  union all
  select
    'legacy_occurrence',
    'parsed_card_entries',
    case
      when jsonb_typeof(item -> 'parsedCards') = 'array'
        then jsonb_array_length(item -> 'parsedCards')::bigint
    end
  from legacy_lists
  union all
  select
    'legacy_occurrence',
    'parsed_cards_json_bytes',
    case
      when jsonb_typeof(item -> 'parsedCards') = 'array'
        then octet_length((item -> 'parsedCards')::text)::bigint
    end
  from legacy_lists
  union all
  select
    'legacy_occurrence',
    'sorted_card_entries',
    case
      when jsonb_typeof(item -> 'sortedCards') = 'array'
        then jsonb_array_length(item -> 'sortedCards')::bigint
    end
  from legacy_lists
  union all
  select
    'legacy_occurrence',
    'sorted_cards_json_bytes',
    case
      when jsonb_typeof(item -> 'sortedCards') = 'array'
        then octet_length((item -> 'sortedCards')::text)::bigint
    end
  from legacy_lists
  union all
  select 'relational_row', 'raw_list_bytes', octet_length(raw_list)::bigint
  from public.deck_lists
  union all
  select
    'relational_row',
    'raw_list_nonempty_lines',
    (
      select count(*)::bigint
      from regexp_split_to_table(raw_list, E'\\r?\\n') as line
      where btrim(line) <> ''
    )
  from public.deck_lists
  union all
  select
    'relational_row',
    'parsed_card_entries',
    case
      when jsonb_typeof(parsed_cards) = 'array'
        then jsonb_array_length(parsed_cards)::bigint
    end
  from public.deck_lists
  union all
  select
    'relational_row',
    'parsed_cards_json_bytes',
    case
      when jsonb_typeof(parsed_cards) = 'array'
        then octet_length(parsed_cards::text)::bigint
    end
  from public.deck_lists
  union all
  select
    'relational_row',
    'sorted_card_entries',
    case
      when jsonb_typeof(sorted_cards) = 'array'
        then jsonb_array_length(sorted_cards)::bigint
    end
  from public.deck_lists
  union all
  select
    'relational_row',
    'sorted_cards_json_bytes',
    case
      when jsonb_typeof(sorted_cards) = 'array'
        then octet_length(sorted_cards::text)::bigint
    end
  from public.deck_lists
),
deck_size_stats as (
  select
    source,
    metric,
    count(*) filter (where value is not null)::bigint as sample_rows,
    count(*) filter (where value is null)::bigint as null_or_invalid_rows,
    min(value)::bigint as min_value,
    round(percentile_cont(0.50) within group (order by value))::bigint as median_value,
    round(percentile_cont(0.90) within group (order by value))::bigint as p90_value,
    round(percentile_cont(0.95) within group (order by value))::bigint as p95_value,
    round(percentile_cont(0.99) within group (order by value))::bigint as p99_value,
    max(value)::bigint as max_value
  from deck_measurements
  group by source, metric
),
evidence as (
  select 'share_payload_size'::text as section, to_jsonb(result) as aggregate
  from share_size_stats as result
  union all
  select 'share_status', to_jsonb(result)
  from share_status as result
  union all
  select 'share_v1_envelope', to_jsonb(result)
  from share_envelope as result
  union all
  select 'share_rate_per_active_user_day', to_jsonb(result)
  from share_rate_stats as result
  union all
  select 'log_body_size', to_jsonb(result)
  from log_size_stats as result
  union all
  select 'log_import_rate_per_active_user_day', to_jsonb(result)
  from import_rate_stats as result
  union all
  select 'performance_environment', to_jsonb(result)
  from performance_environment_stats as result
  union all
  select 'performance_rate', to_jsonb(result)
  from performance_rate_stats as result
  union all
  select 'deck_list_size', to_jsonb(result)
  from deck_size_stats as result
)
select section, aggregate
from evidence
order by
  section,
  aggregate ->> 'window_label',
  aggregate ->> 'scope',
  aggregate ->> 'bucket_kind',
  aggregate ->> 'source',
  aggregate ->> 'metric',
  aggregate ->> 'environment';
