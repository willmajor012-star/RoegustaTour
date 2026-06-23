-- Bet Punto tour reset and prepared-market support.
-- Adds an explicit draft/prepared market status and a required flag for mandatory pick coverage.

alter table public.bet_markets
  add column if not exists required boolean not null default false;

-- Production databases may have a generated/legacy name for the status CHECK constraint.
-- Drop any CHECK constraint on bet_markets that references the status column before adding
-- the canonical draft-aware constraint.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'bet_markets'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
  loop
    execute format('alter table public.bet_markets drop constraint if exists %I', constraint_name);
  end loop;
end $$;

alter table public.bet_markets
  add constraint bet_markets_status_check check (status in ('draft','open','closed','settled','void'));

update public.bet_markets
set required = true
where required = false
  and status <> 'void'
  and (
    market_type = 'team_result'
    or (market_type = 'player_performance' and title ilike '%stableford%')
  );

create index if not exists bet_markets_tour_required_idx on public.bet_markets(tour_id, required);

notify pgrst, 'reload schema';
