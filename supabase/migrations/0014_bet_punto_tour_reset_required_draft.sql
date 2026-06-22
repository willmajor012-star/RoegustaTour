-- Bet Punto tour reset and prepared-market support.
-- Adds an explicit draft/prepared market status and a required flag for mandatory pick coverage.

alter table public.bet_markets
  add column if not exists required boolean not null default false;

alter table public.bet_markets drop constraint if exists bet_markets_status_check;
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
