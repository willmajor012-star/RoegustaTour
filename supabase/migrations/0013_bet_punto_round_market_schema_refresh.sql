-- Bet Punto round-linked market workflow schema refresh.
-- Idempotent: safe to run repeatedly on live databases that may have missed earlier repairs.

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.bet_markets') is not null then
    alter table public.bet_markets
      add column if not exists round_id uuid references public.rounds(id) on delete set null,
      add column if not exists match_id uuid references public.matches(id) on delete set null,
      add column if not exists description text,
      add column if not exists market_scope text not null default 'general_pot',
      add column if not exists closes_at timestamptz,
      add column if not exists result_option_id uuid,
      add column if not exists result_text text,
      add column if not exists updated_at timestamptz not null default now();

    if not exists (
      select 1 from pg_constraint
      where conname = 'bet_markets_market_scope_check'
        and conrelid = 'public.bet_markets'::regclass
    ) then
      alter table public.bet_markets
        add constraint bet_markets_market_scope_check check (market_scope in ('general_pot', 'special'));
    end if;
  end if;

  if to_regclass('public.bet_options') is not null then
    alter table public.bet_options
      add column if not exists linked_player_id uuid references public.players(id) on delete set null,
      add column if not exists linked_team_id uuid references public.tour_teams(id) on delete set null,
      add column if not exists linked_match_side text,
      add column if not exists odds_decimal numeric,
      add column if not exists sort_order integer not null default 0;

    if not exists (
      select 1 from pg_constraint
      where conname = 'bet_options_linked_match_side_check'
        and conrelid = 'public.bet_options'::regclass
    ) then
      alter table public.bet_options
        add constraint bet_options_linked_match_side_check check (linked_match_side in ('A','B','halved'));
    end if;
  end if;

  if to_regclass('public.bet_markets') is not null and to_regclass('public.bet_options') is not null then
    if not exists (
      select 1 from pg_constraint
      where conname = 'bet_markets_result_option_fk'
        and conrelid = 'public.bet_markets'::regclass
    ) then
      alter table public.bet_markets
        add constraint bet_markets_result_option_fk foreign key (result_option_id) references public.bet_options(id) on delete set null;
    end if;
  end if;

  if to_regclass('public.bets') is not null then
    alter table public.bets
      add column if not exists stake_amount_pence integer,
      add column if not exists payout_amount_pence integer,
      add column if not exists outcome_status text not null default 'pending',
      add column if not exists payout_status text not null default 'not_applicable',
      add column if not exists payout_notes text,
      add column if not exists bettor_player_id uuid references public.players(id) on delete set null,
      add column if not exists admin_entered boolean not null default false,
      add column if not exists admin_notes text,
      add column if not exists void_reason text,
      add column if not exists public_edit_token_hash text,
      add column if not exists updated_at timestamptz not null default now();
  end if;
end $$;

create index if not exists bet_markets_tour_status_idx on public.bet_markets(tour_id, status);
create index if not exists bet_options_market_idx on public.bet_options(market_id);
create index if not exists bets_market_idx on public.bets(market_id);
create index if not exists bets_bettor_player_idx on public.bets(bettor_player_id);
create index if not exists bets_public_edit_token_hash_idx on public.bets(public_edit_token_hash) where public_edit_token_hash is not null;
create index if not exists bets_market_bettor_idx on public.bets(market_id, lower(btrim(bettor_name)));

-- Force Supabase/PostgREST to pick up repaired columns immediately after migration.
notify pgrst, 'reload schema';
