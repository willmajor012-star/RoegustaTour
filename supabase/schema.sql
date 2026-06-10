-- Roegusta Tour future Supabase schema. Enable pgcrypto for UUID generation.
create extension if not exists pgcrypto;

create table players (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  nickname text,
  initials text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tours (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  year integer not null,
  location text,
  start_date date,
  end_date date,
  status text not null check (status in ('planned','active','complete','archived')),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index tours_year_idx on tours(year);

create table tour_players (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  attending boolean not null default true,
  tour_handicap numeric(4,1),
  notes text,
  created_at timestamptz not null default now(),
  unique (tour_id, player_id)
);

create table tour_teams (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  name text not null,
  colour text,
  captain_player_id uuid references players(id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (tour_id, name)
);
create index tour_teams_tour_idx on tour_teams(tour_id);

create table tour_team_members (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  team_id uuid not null references tour_teams(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (tour_id, player_id),
  unique (team_id, player_id)
);
create index tour_team_members_team_idx on tour_team_members(team_id);


create table tour_team_results (
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
create index tour_team_results_tour_idx on tour_team_results(tour_id);

create table tour_handbook_sections (
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
create index tour_handbook_sections_tour_idx on tour_handbook_sections(tour_id);

create table tour_itinerary_items (
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tour_itinerary_items_tour_date_idx on tour_itinerary_items(tour_id, item_date, sort_order);

create table tour_team_day_kit (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  team_id uuid not null references tour_teams(id) on delete cascade,
  kit_date date not null,
  colour_label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (tour_id, team_id, kit_date)
);
create index tour_team_day_kit_tour_idx on tour_team_day_kit(tour_id, kit_date);

create table rounds (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  round_number integer not null,
  name text not null,
  round_date date,
  course_name text,
  tee_time time,
  format_label text,
  notes text,
  status text not null check (status in ('draft','planned','active','complete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tour_id, round_number)
);
create index rounds_tour_idx on rounds(tour_id);

create table matches (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  round_id uuid not null references rounds(id) on delete cascade,
  match_number integer not null,
  format text not null check (format in ('singles','better_ball','foursomes','scramble','custom')),
  status text not null check (status in ('draft','planned','active','complete','void')),
  side_a_team_id uuid not null references tour_teams(id),
  side_b_team_id uuid not null references tour_teams(id),
  side_a_label text,
  side_b_label text,
  points_available numeric(4,1) not null default 1,
  points_side_a numeric(4,1),
  points_side_b numeric(4,1),
  winning_side text check (winning_side in ('A','B','halved','void')),
  result_text text,
  tee_time text,
  published boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, match_number)
);
create index matches_tour_round_idx on matches(tour_id, round_id);
create index matches_status_idx on matches(status);
create index matches_public_idx on matches(tour_id, published, status);

create table match_participants (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  side text not null check (side in ('A','B')),
  team_id uuid not null references tour_teams(id),
  created_at timestamptz not null default now(),
  unique (match_id, player_id)
);
create index match_participants_match_idx on match_participants(match_id);
create index match_participants_player_idx on match_participants(player_id);

create table player_match_results (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  round_id uuid not null references rounds(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  team_id uuid not null references tour_teams(id),
  format text not null check (format in ('singles','better_ball','foursomes','scramble','custom')),
  result text not null check (result in ('win','draw','loss','void')),
  points_for numeric(4,1) not null default 0,
  points_against numeric(4,1) not null default 0,
  created_at timestamptz not null default now(),
  unique (match_id, player_id)
);
create index player_match_results_player_idx on player_match_results(player_id);
create index player_match_results_tour_format_idx on player_match_results(tour_id, format);

create table historical_player_stats (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid references tours(id) on delete set null,
  player_id uuid not null references players(id) on delete cascade,
  source_type text not null default 'legacy_summary' check (source_type in ('legacy_summary')),
  matches integer not null default 0,
  wins integer not null default 0,
  draws integer not null default 0,
  losses integer not null default 0,
  points numeric(6,1) not null default 0,
  win_percent numeric(6,4) not null default 0,
  notes text,
  imported_at timestamptz not null default now()
);
create index historical_player_stats_player_idx on historical_player_stats(player_id);

create table bet_markets (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  round_id uuid references rounds(id) on delete set null,
  match_id uuid references matches(id) on delete set null,
  title text not null,
  description text,
  market_type text not null check (market_type in ('match_winner','player_performance','team_result','over_under','special','custom')),
  status text not null check (status in ('open','closed','settled','void')),
  closes_at timestamptz,
  result_option_id uuid,
  result_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bet_markets_tour_status_idx on bet_markets(tour_id, status);

create table bet_options (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references bet_markets(id) on delete cascade,
  label text not null,
  linked_player_id uuid references players(id) on delete set null,
  linked_team_id uuid references tour_teams(id) on delete set null,
  linked_match_side text check (linked_match_side in ('A','B','halved')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table bet_markets add constraint bet_markets_result_option_fk foreign key (result_option_id) references bet_options(id) on delete set null;
create index bet_options_market_idx on bet_options(market_id);

create table bets (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references bet_markets(id) on delete cascade,
  option_id uuid not null references bet_options(id) on delete cascade,
  bettor_name text not null,
  stake_text text,
  comment text,
  device_id text,
  status text not null check (status in ('active','void')) default 'active',
  created_at timestamptz not null default now()
);
create index bets_market_idx on bets(market_id);
create index bets_device_idx on bets(device_id);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_label text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  payload jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_entity_idx on audit_log(entity_type, entity_id);
