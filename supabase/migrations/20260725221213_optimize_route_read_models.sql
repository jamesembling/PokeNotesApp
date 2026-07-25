create or replace function public.get_deck_index_page_data()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with request_context as (
    select (select auth.uid()) as user_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', decks.id,
        'user_id', decks.user_id,
        'deck_name', decks.deck_name,
        'archetype_id', decks.archetype_id,
        'format', decks.format,
        'go_preference', decks.go_preference,
        'deck_pokemon', decks.deck_pokemon,
        'deck_list_count', greatest(
          (
            select count(*)::integer
            from public.deck_lists
            where deck_lists.user_id = decks.user_id
              and deck_lists.deck_id = decks.id
          ),
          case
            when jsonb_typeof(decks.deck_lists) = 'array' then jsonb_array_length(decks.deck_lists)
            else 0
          end
        ),
        'games_played', coalesce(deck_log_stats.games_played, 0),
        'games_won', coalesce(deck_log_stats.games_won, 0),
        'games_lost', coalesce(deck_log_stats.games_lost, 0),
        'created_at', decks.created_at,
        'updated_at', decks.updated_at
      )
      order by decks.updated_at desc
    ),
    '[]'::jsonb
  )
  from public.decks
  cross join request_context
  left join public.deck_log_stats
    on deck_log_stats.user_id = request_context.user_id
    and deck_log_stats.deck_id = decks.id
  where decks.user_id = request_context.user_id;
$$;

revoke execute on function public.get_deck_index_page_data() from public, anon;
grant execute on function public.get_deck_index_page_data() to authenticated;

create or replace function public.get_initial_logs_page_data(p_limit integer default 51)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with request_context as (
    select (select auth.uid()) as user_id
  ),
  stats as (
    select
      coalesce(user_log_stats.games_played, 0) as games_played,
      coalesce(user_log_stats.games_won, 0) as games_won,
      coalesce(user_log_stats.games_lost, 0) as games_lost
    from request_context
    left join public.user_log_stats
      on user_log_stats.user_id = request_context.user_id
  ),
  ordered_logs as (
    select
      logs.id,
      logs.date,
      logs.result,
      logs.format,
      logs.go_order,
      logs.self_player_name,
      logs.self_deck_name,
      logs.self_deck_sprites,
      logs.opponent_player_name,
      logs.opponent_deck_name,
      logs.opponent_deck_sprites,
      logs.total_turns,
      logs.linked_deck_id,
      logs.linked_deck_list_id,
      logs.imported_at,
      logs.user_id
    from public.logs
    cross join request_context
    where logs.user_id = request_context.user_id
    order by logs.date desc, logs.imported_at desc, logs.id desc
    limit greatest(1, least(coalesce(p_limit, 51), 101))
  ),
  enriched_logs as (
    select
      ordered_logs.id,
      ordered_logs.date,
      ordered_logs.result,
      ordered_logs.format,
      ordered_logs.go_order,
      ordered_logs.self_player_name,
      ordered_logs.self_deck_name,
      ordered_logs.self_deck_sprites,
      ordered_logs.opponent_player_name,
      ordered_logs.opponent_deck_name,
      ordered_logs.opponent_deck_sprites,
      ordered_logs.total_turns,
      ordered_logs.linked_deck_id,
      ordered_logs.linked_deck_list_id,
      ordered_logs.imported_at,
      coalesce(relational_list.name, aggregate_list.name) as linked_deck_list_name
    from ordered_logs
    left join public.deck_lists as relational_list
      on relational_list.user_id = ordered_logs.user_id
      and relational_list.deck_id = ordered_logs.linked_deck_id
      and relational_list.id = ordered_logs.linked_deck_list_id
    left join public.decks
      on relational_list.id is null
      and decks.user_id = ordered_logs.user_id
      and decks.id = ordered_logs.linked_deck_id
    left join lateral (
      select deck_list ->> 'name' as name
      from jsonb_array_elements(
        case
          when jsonb_typeof(decks.deck_lists) = 'array' then decks.deck_lists
          else '[]'::jsonb
        end
      ) as deck_list
      where relational_list.id is null
        and deck_list ->> 'id' = ordered_logs.linked_deck_list_id
      limit 1
    ) as aggregate_list on true
  )
  select jsonb_build_object(
    'stats',
    jsonb_build_object(
      'games_played', stats.games_played,
      'games_won', stats.games_won,
      'games_lost', stats.games_lost
    ),
    'logs',
    coalesce(
      (
        select jsonb_agg(
          to_jsonb(enriched_logs)
          order by enriched_logs.date desc, enriched_logs.imported_at desc, enriched_logs.id desc
        )
        from enriched_logs
      ),
      '[]'::jsonb
    )
  )
  from stats;
$$;

revoke execute on function public.get_initial_logs_page_data(integer) from public, anon;
grant execute on function public.get_initial_logs_page_data(integer) to authenticated;
