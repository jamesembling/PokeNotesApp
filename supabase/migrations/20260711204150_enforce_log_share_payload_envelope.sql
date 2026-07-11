-- Reject malformed direct-RPC snapshots before they consume storage or become
-- a public read-time failure. This intentionally validates only the stable v1
-- envelope: deeper Battle Log fields remain governed by the application codec,
-- and no product-level payload byte limit is introduced here.
alter table public.log_shares
  add constraint log_shares_payload_v1_envelope
  check (
    jsonb_typeof(payload) is not distinct from 'object'
    and payload ->> 'version' is not distinct from 'v1'
    and jsonb_typeof(payload -> 'log') is not distinct from 'object'
    and jsonb_typeof(payload #> '{log,sections}') is not distinct from 'array'
    and jsonb_typeof(payload -> 'linkedStrategyLabel') is not distinct from 'string'
    and (
      not (payload ? 'linkedDeckListSortedCards')
      or jsonb_typeof(payload -> 'linkedDeckListSortedCards') in ('array', 'null')
    )
  ) not valid;

-- Privacy-safe production evidence found 71/71 existing rows conforming. The
-- two-phase form keeps the preflight and enforcement contract explicit: new
-- writes are checked as soon as the constraint is added, then historical rows
-- must pass before the migration can complete.
alter table public.log_shares
  validate constraint log_shares_payload_v1_envelope;
