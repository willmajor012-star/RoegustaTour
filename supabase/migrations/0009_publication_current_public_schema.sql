-- Add missing publication/current-public columns for deployed public visibility flows.
-- Safe to run repeatedly; new flags default private and do not backfill historic rows as public.

alter table tours
  add column if not exists is_current_public boolean not null default false;

alter table rounds
  add column if not exists published boolean not null default false;

alter table tour_teams
  add column if not exists published boolean not null default false;

alter table matches
  add column if not exists published boolean not null default false;

-- Some deployments may have a legacy/publication results table. Add the flag only when it exists.
do $$
begin
  if to_regclass('public.results') is not null then
    alter table public.results
      add column if not exists published boolean not null default false;
  end if;
end $$;

create index if not exists tours_is_current_public_idx
  on tours(is_current_public);

create index if not exists rounds_tour_id_published_idx
  on rounds(tour_id, published);

create index if not exists tour_teams_tour_id_published_idx
  on tour_teams(tour_id, published);

create index if not exists matches_tour_id_round_id_published_idx
  on matches(tour_id, round_id, published);

-- Production operator: after applying this migration, run: NOTIFY pgrst, 'reload schema';
