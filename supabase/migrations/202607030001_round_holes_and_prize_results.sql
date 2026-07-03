alter table public.rounds
  add column if not exists holes integer not null default 18;

alter table public.rounds
  drop constraint if exists rounds_holes_check;

alter table public.rounds
  add constraint rounds_holes_check check (holes in (9, 18));

update public.rounds set holes = 18 where holes is null;

create table if not exists public.round_prize_results (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references public.tours(id) on delete cascade,
  round_id uuid not null references public.rounds(id) on delete cascade,
  prize_type text not null check (prize_type in ('individual_stableford', 'team_gross', 'custom')),
  title text not null,
  winner_player_id uuid null references public.players(id) on delete set null,
  winner_team_id uuid null references public.tour_teams(id) on delete set null,
  winning_score_text text null,
  score_value numeric null,
  score_unit text null,
  notes text null,
  linked_bet_market_id uuid null references public.bet_markets(id) on delete set null,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists round_prize_results_tour_id_idx on public.round_prize_results(tour_id);
create index if not exists round_prize_results_round_id_idx on public.round_prize_results(round_id);
create index if not exists round_prize_results_tour_published_idx on public.round_prize_results(tour_id, published);

notify pgrst, 'reload schema';
