-- Repair live admin/publication and Bet Punto columns in one production-safe migration.
-- Safe to run repeatedly; keeps existing data private/unchanged and refreshes PostgREST.

do $$
begin
  if to_regclass('public.tours') is not null then
    alter table public.tours
      add column if not exists is_current_public boolean not null default false;
  end if;

  if to_regclass('public.rounds') is not null then
    alter table public.rounds
      add column if not exists published boolean not null default false;
  end if;

  if to_regclass('public.tour_teams') is not null then
    alter table public.tour_teams
      add column if not exists published boolean not null default false;
  end if;

  if to_regclass('public.matches') is not null then
    alter table public.matches
      add column if not exists published boolean not null default false;
  end if;

  if to_regclass('public.bet_markets') is not null then
    alter table public.bet_markets
      add column if not exists market_scope text not null default 'general_pot',
      add column if not exists result_option_id uuid null,
      add column if not exists result_text text null;
  end if;

  if to_regclass('public.bet_options') is not null then
    alter table public.bet_options
      add column if not exists odds_decimal numeric(8,2) null;
  end if;

  if to_regclass('public.bets') is not null then
    alter table public.bets
      add column if not exists outcome_status text not null default 'pending',
      add column if not exists payout_amount_pence integer null,
      add column if not exists payout_status text not null default 'pending',
      add column if not exists payout_notes text null,
      add column if not exists device_id text null;
  end if;
end $$;

do $$
begin
  if to_regclass('public.bet_markets') is not null then
    alter table public.bet_markets drop constraint if exists bet_markets_market_scope_check;
    alter table public.bet_markets add constraint bet_markets_market_scope_check
      check (market_scope in ('general_pot', 'special'));
  end if;

  if to_regclass('public.bets') is not null then
    alter table public.bets drop constraint if exists bets_outcome_status_check;
    alter table public.bets add constraint bets_outcome_status_check
      check (outcome_status in ('pending', 'won', 'lost', 'push', 'void'));

    alter table public.bets drop constraint if exists bets_payout_status_check;
    alter table public.bets add constraint bets_payout_status_check
      check (payout_status in ('pending', 'not_applicable', 'due', 'paid'));
  end if;
end $$;

do $$
begin
  if to_regclass('public.tours') is not null then
    create unique index if not exists tours_single_current_public_idx
      on public.tours(is_current_public)
      where is_current_public = true;
  end if;

  if to_regclass('public.rounds') is not null then
    create index if not exists rounds_tour_id_published_idx on public.rounds(tour_id, published);
  end if;

  if to_regclass('public.tour_teams') is not null then
    create index if not exists tour_teams_tour_id_published_idx on public.tour_teams(tour_id, published);
  end if;

  if to_regclass('public.matches') is not null then
    create index if not exists matches_tour_id_round_id_published_idx on public.matches(tour_id, round_id, published);
  end if;

  if to_regclass('public.bet_markets') is not null then
    create index if not exists bet_markets_tour_status_scope_idx on public.bet_markets(tour_id, status, market_scope);
  end if;

  if to_regclass('public.bets') is not null then
    create index if not exists bets_market_status_idx on public.bets(market_id, status);
  end if;
end $$;

-- Hide already-created orphan markets from public/admin visibility warnings; organisers can recreate them with options.
do $$
begin
  if to_regclass('public.bet_markets') is not null and to_regclass('public.bet_options') is not null then
    update public.bet_markets bm
    set status = 'void'
    where bm.status <> 'void'
      and not exists (select 1 from public.bet_options bo where bo.market_id = bm.id);
  end if;
end $$;

notify pgrst, 'reload schema';
