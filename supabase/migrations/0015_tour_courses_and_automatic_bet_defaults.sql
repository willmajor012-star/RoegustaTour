-- Tour-scoped course guides, tour timezone support and idempotent Bet Punto defaults.
-- Safe to run repeatedly.

create extension if not exists pgcrypto;

alter table public.tours
  add column if not exists timezone text not null default 'Europe/London';

create table if not exists public.tour_courses (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references public.tours(id) on delete cascade,
  slug text not null,
  name text not null,
  short_name text not null,
  resort text,
  location text,
  architect text,
  opened text,
  overview text,
  note_availability text not null default 'course-only'
    check (note_availability in ('course-only', 'hole-by-hole')),
  official_page_url text,
  scorecard_url text,
  hero_image_url text,
  hero_position text,
  tees jsonb not null default '[]'::jsonb,
  holes jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tour_id, slug)
);

create index if not exists tour_courses_tour_order_idx
  on public.tour_courses(tour_id, sort_order);

create index if not exists tour_courses_public_idx
  on public.tour_courses(tour_id, published, sort_order);

alter table public.rounds
  add column if not exists course_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rounds_course_id_fk'
      and conrelid = 'public.rounds'::regclass
  ) then
    alter table public.rounds
      add constraint rounds_course_id_fk
      foreign key (course_id) references public.tour_courses(id) on delete set null;
  end if;
end $$;

create index if not exists rounds_course_id_idx on public.rounds(course_id);

alter table public.bets
  add column if not exists entry_source text not null default 'public';

update public.bets
set entry_source = 'admin'
where admin_entered = true
  and entry_source = 'public';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bets_entry_source_check'
      and conrelid = 'public.bets'::regclass
  ) then
    alter table public.bets
      add constraint bets_entry_source_check
      check (entry_source in ('public', 'admin', 'automatic_default'));
  end if;
end $$;

create unique index if not exists bets_one_active_automatic_default_idx
  on public.bets(market_id, bettor_player_id)
  where entry_source = 'automatic_default'
    and status = 'active'
    and bettor_player_id is not null;

notify pgrst, 'reload schema';
