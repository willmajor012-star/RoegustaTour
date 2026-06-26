-- Add per-tour team result and editable handbook data structures.
-- Incremental migration for databases that already have the baseline schema.
-- Fresh databases should apply 0001_initial_schema.sql first; existing manually-created
-- Supabase databases should only need this migration if the baseline tables already exist.

create table if not exists tour_team_results (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  team_id uuid not null references tour_teams(id) on delete cascade,
  final_points numeric(4,1),
  position integer,
  result_status text not null default 'tbd' check (result_status in ('winner','runner_up','draw','tbd')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tour_id, team_id)
);
create index if not exists tour_team_results_tour_idx on tour_team_results(tour_id);

create table if not exists tour_handbook_sections (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  section_key text not null,
  title text not null,
  body text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tour_id, section_key)
);
create index if not exists tour_handbook_sections_tour_idx on tour_handbook_sections(tour_id);

create table if not exists tour_itinerary_items (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  item_date date,
  day_label text,
  time_label text,
  activity text not null,
  location text,
  notes text,
  is_placeholder boolean not null default false,
  sort_order integer not null default 0,
  source_type text,
  source_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tour_itinerary_items_tour_date_idx on tour_itinerary_items(tour_id, item_date, sort_order);
create index if not exists tour_itinerary_items_source_idx on tour_itinerary_items(tour_id, source_type, source_id);

create table if not exists tour_team_day_kit (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  team_id uuid not null references tour_teams(id) on delete cascade,
  kit_date date not null,
  colour_label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (tour_id, team_id, kit_date)
);
create index if not exists tour_team_day_kit_tour_idx on tour_team_day_kit(tour_id, kit_date);
