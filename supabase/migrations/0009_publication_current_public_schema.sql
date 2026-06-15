-- Add missing publication/current-public columns for deployed public visibility flows.
-- Safe to run repeatedly; new flags default private and do not backfill historic rows as public.
-- Table checks keep this repair migration harmless when run before the baseline schema exists.

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

  -- Some deployments may have a legacy/publication results table. Add the flag only when it exists.
  if to_regclass('public.results') is not null then
    alter table public.results
      add column if not exists published boolean not null default false;
  end if;
end $$;

do $$
begin
  if to_regclass('public.tours') is not null then
    create index if not exists tours_is_current_public_idx
      on public.tours(is_current_public);
  end if;

  if to_regclass('public.rounds') is not null then
    create index if not exists rounds_tour_id_published_idx
      on public.rounds(tour_id, published);
  end if;

  if to_regclass('public.tour_teams') is not null then
    create index if not exists tour_teams_tour_id_published_idx
      on public.tour_teams(tour_id, published);
  end if;

  if to_regclass('public.matches') is not null then
    create index if not exists matches_tour_id_round_id_published_idx
      on public.matches(tour_id, round_id, published);
  end if;
end $$;

notify pgrst, 'reload schema';

-- Production operator: this migration runs NOTIFY pgrst, 'reload schema' automatically.
