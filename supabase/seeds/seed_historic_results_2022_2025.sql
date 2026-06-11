-- One-off historic Roegusta Tour backfill for 2022-2025.
-- Supabase-safe DO-block variant: all staging TEMP tables are created and
-- consumed inside this single statement so Supabase SQL Editor cannot lose
-- relation scope between separately submitted statements.
-- Re-runnable/idempotent: data is located by natural keys and upserted where
-- unique constraints exist. Future tours should be created through the admin app,
-- not by extending this CSV seed.

do $$
begin

drop table if exists pg_temp.historic_players;
create temp table historic_players (display_name text primary key) on commit drop;
insert into historic_players (display_name) values
  ('Adam Musikant'),
  ('Alex Tonge'),
  ('Ben Walmsley'),
  ('Brian Crotty'),
  ('Connor Hamilton'),
  ('Dan Birn'),
  ('Dave Birn'),
  ('Finn Begley'),
  ('Henry Dubiel'),
  ('Jack Bamford'),
  ('Josh Conlan'),
  ('Leif Skogland'),
  ('Luke Gorman'),
  ('Martin Horswood'),
  ('Mike Hamblin'),
  ('Nick Wells'),
  ('Niels Verbeek'),
  ('Oliver Hunt'),
  ('Peter Garczewski'),
  ('Remi Worthhalter'),
  ('Robert Findlay'),
  ('Sam Aycock'),
  ('Sam Huxtable'),
  ('Sam Truman'),
  ('Scott Stanley'),
  ('Shaun Feldon'),
  ('Simon Butler'),
  ('Stuart Loggie'),
  ('Tom Reed'),
  ('Will Major');

insert into players (display_name, initials, active)
select hp.display_name,
       upper(left(split_part(hp.display_name, ' ', 1), 1) || left(split_part(hp.display_name, ' ', array_length(string_to_array(hp.display_name, ' '), 1)), 1)) as initials,
       true
from historic_players hp
where not exists (
  select 1 from players p where lower(btrim(p.display_name)) = lower(btrim(hp.display_name))
);

drop table if exists pg_temp.historic_tours;
create temp table historic_tours (year integer primary key, name text, status text) on commit drop;
insert into historic_tours (year, name, status) values
  (2022, 'Roegusta Tour 2022', 'complete'),
  (2023, 'Roegusta Tour 2023', 'complete'),
  (2024, 'Roegusta Tour 2024', 'complete'),
  (2025, 'Roegusta Tour 2025', 'complete')
on conflict (year) do nothing;

insert into tours (year, name, status, description)
select year, name, status, 'Historic match-level backfill from cleaned Roegusta source data.'
from historic_tours
on conflict (year) do update set
  name = excluded.name,
  status = excluded.status,
  description = excluded.description,
  updated_at = now();

drop table if exists pg_temp.historic_team_map;
create temp table historic_team_map (
  year integer,
  side text,
  team_name text,
  final_points numeric(4,1),
  result_status text,
  confirmation_note text,
  primary key (year, side)
) on commit drop;
insert into historic_team_map (year, side, team_name, final_points, result_status, confirmation_note) values
  (2022, 'A', 'Team Truman', 10.5, 'winner', 'confirmed_by_sam_jack_side_presence'),
  (2022, 'B', 'Team Bamford', 9.5, 'runner_up', 'confirmed_by_sam_jack_side_presence'),
  (2023, 'A', 'Team Truman', 12.5, 'winner', 'confirmed_by_sam_jack_side_presence'),
  (2023, 'B', 'Team Bamford', 7.5, 'runner_up', 'confirmed_by_sam_jack_side_presence'),
  (2024, 'A', 'Team Bamford', 8.0, 'runner_up', 'confirmed_bamford_absent_team_name_retained_sam_on_team_truman_side'),
  (2024, 'B', 'Team Truman', 12.0, 'winner', 'confirmed_bamford_absent_team_name_retained_sam_on_team_truman_side'),
  (2025, 'A', 'Team Truman', 13.5, 'winner', 'confirmed_by_sam_jack_side_presence'),
  (2025, 'B', 'Team Bamford', 10.5, 'runner_up', 'confirmed_by_sam_jack_side_presence');

insert into tour_teams (tour_id, name, colour, sort_order)
select t.id, htm.team_name,
       case when htm.team_name = 'Team Truman' then '#0f2f24' when htm.team_name = 'Team Bamford' then '#d4a017' else null end,
       case htm.side when 'A' then 1 else 2 end
from historic_team_map htm
join tours t on t.year = htm.year
on conflict (tour_id, name) do update set
  colour = excluded.colour,
  sort_order = excluded.sort_order;

drop table if exists pg_temp.historic_rounds;
create temp table historic_rounds (
  year integer,
  round_number integer,
  format text,
  format_label text,
  course text,
  match_count integer,
  side_a_points numeric(4,1),
  side_b_points numeric(4,1),
  primary key (year, round_number)
) on commit drop;
insert into historic_rounds (year, round_number, format, format_label, course, match_count, side_a_points, side_b_points) values
  (2022, 1, 'better_ball', 'Better ball', 'Faldo Course', 4, 1, 3),
  (2022, 2, 'better_ball', 'Better ball', 'O''Connor Jnr. Course', 4, 1, 3),
  (2022, 3, 'better_ball', 'Better ball', 'O''Connor Jnr. Course (Sun)', 4, 3.0, 1.0),
  (2022, 4, 'singles', 'Singles', 'Faldo Course', 8, 5.5, 2.5),
  (2023, 1, 'better_ball', 'Better ball', 'Old Course', 5, 3.5, 1.5),
  (2023, 2, 'better_ball', 'Better ball', 'Millenium Course', 5, 3, 2),
  (2023, 3, 'singles', 'Singles', 'Victoria Course', 10, 6, 4),
  (2024, 1, 'better_ball', 'Better ball', 'Monte Rei Golf & Country Club', 5, 3, 2),
  (2024, 2, 'scramble', 'Scramble', 'Laranjal Course', 5, 1, 4),
  (2024, 3, 'singles', 'Singles', 'North Course', 10, 4.0, 6.0),
  (2025, 1, 'better_ball', 'Better ball', 'South Course', 6, 2, 4),
  (2025, 2, 'scramble', 'Scramble', 'Laranjal Course', 6, 4, 2),
  (2025, 3, 'singles', 'Singles', 'Ombria Golf Resort', 12, 7.5, 4.5);

insert into rounds (tour_id, round_number, name, course_name, format_label, status, notes)
select t.id, hr.round_number, 'Round ' || hr.round_number, hr.course, hr.format_label, 'complete',
       case when hr.year = 2022 and hr.round_number = 4 then 'Historic 2022 four-round exception retained from source data.' else null end
from historic_rounds hr
join tours t on t.year = hr.year
on conflict (tour_id, round_number) do update set
  name = excluded.name,
  course_name = excluded.course_name,
  format_label = excluded.format_label,
  status = excluded.status,
  notes = excluded.notes,
  updated_at = now();

drop table if exists pg_temp.historic_matches;
create temp table historic_matches (
  year integer,
  round_number integer,
  match_number integer,
  format text,
  format_label text,
  course text,
  match_type text,
  side_a_team text,
  side_a_players text,
  result_text text,
  side_b_team text,
  side_b_players text,
  points_available numeric(4,1),
  points_side_a numeric(4,1),
  points_side_b numeric(4,1),
  winning_side text,
  primary key (year, round_number, match_number)
) on commit drop;
insert into historic_matches (year, round_number, match_number, format, format_label, course, match_type, side_a_team, side_a_players, result_text, side_b_team, side_b_players, points_available, points_side_a, points_side_b, winning_side) values
  (2025, 1, 1, 'better_ball', 'Better ball', 'South Course', 'team', 'Team Truman', 'Dave Birn, Sam Truman', null, 'Team Bamford', 'Tom Reed, Niels Verbeek', 1, 0, 1, 'B'),
  (2025, 1, 2, 'better_ball', 'Better ball', 'South Course', 'team', 'Team Truman', 'Alex Tonge, Martin Horswood', null, 'Team Bamford', 'Finn Begley, Nick Wells', 1, 0, 1, 'B'),
  (2025, 1, 3, 'better_ball', 'Better ball', 'South Course', 'team', 'Team Truman', 'Remi Worthhalter, Shaun Feldon', null, 'Team Bamford', 'Connor Hamilton, Oliver Hunt', 1, 0, 1, 'B'),
  (2025, 1, 4, 'better_ball', 'Better ball', 'South Course', 'team', 'Team Truman', 'Josh Conlan, Luke Gorman', null, 'Team Bamford', 'Will Major, Henry Dubiel', 1, 1, 0, 'A'),
  (2025, 1, 5, 'better_ball', 'Better ball', 'South Course', 'team', 'Team Truman', 'Adam Musikant, Sam Aycock', null, 'Team Bamford', 'Ben Walmsley, Leif Skogland', 1, 0, 1, 'B'),
  (2025, 1, 6, 'better_ball', 'Better ball', 'South Course', 'team', 'Team Truman', 'Robert Findlay, Scott Stanley', null, 'Team Bamford', 'Sam Huxtable, Jack Bamford', 1, 1, 0, 'A'),
  (2025, 2, 1, 'scramble', 'Scramble', 'Laranjal Course', 'team', 'Team Truman', 'Alex Tonge, Martin Horswood', null, 'Team Bamford', 'Finn Begley, Sam Huxtable', 1, 1, 0, 'A'),
  (2025, 2, 2, 'scramble', 'Scramble', 'Laranjal Course', 'team', 'Team Truman', 'Scott Stanley, Remi Worthhalter', null, 'Team Bamford', 'Tom Reed, Nick Wells', 1, 1, 0, 'A'),
  (2025, 2, 3, 'scramble', 'Scramble', 'Laranjal Course', 'team', 'Team Truman', 'Shaun Feldon, Sam Aycock', null, 'Team Bamford', 'Ben Walmsley, Connor Hamilton', 1, 0, 1, 'B'),
  (2025, 2, 4, 'scramble', 'Scramble', 'Laranjal Course', 'team', 'Team Truman', 'Dave Birn, Adam Musikant', null, 'Team Bamford', 'Will Major, Leif Skogland', 1, 0, 1, 'B'),
  (2025, 2, 5, 'scramble', 'Scramble', 'Laranjal Course', 'team', 'Team Truman', 'Robert Findlay, Luke Gorman', null, 'Team Bamford', 'Niels Verbeek, Jack Bamford', 1, 1, 0, 'A'),
  (2025, 2, 6, 'scramble', 'Scramble', 'Laranjal Course', 'team', 'Team Truman', 'Josh Conlan, Sam Truman', null, 'Team Bamford', 'Oliver Hunt, Henry Dubiel', 1, 1, 0, 'A'),
  (2025, 3, 1, 'singles', 'Singles', 'Ombria Golf Resort', 'single', 'Team Truman', 'Scott Stanley', null, 'Team Bamford', 'Connor Hamilton', 1, 1, 0, 'A'),
  (2025, 3, 2, 'singles', 'Singles', 'Ombria Golf Resort', 'single', 'Team Truman', 'Sam Truman', null, 'Team Bamford', 'Jack Bamford', 1, 1, 0, 'A'),
  (2025, 3, 3, 'singles', 'Singles', 'Ombria Golf Resort', 'single', 'Team Truman', 'Alex Tonge', null, 'Team Bamford', 'Tom Reed', 1, 1, 0, 'A'),
  (2025, 3, 4, 'singles', 'Singles', 'Ombria Golf Resort', 'single', 'Team Truman', 'Shaun Feldon', null, 'Team Bamford', 'Leif Skogland', 1, 0, 1, 'B'),
  (2025, 3, 5, 'singles', 'Singles', 'Ombria Golf Resort', 'single', 'Team Truman', 'Luke Gorman', null, 'Team Bamford', 'Oliver Hunt', 1, 0, 1, 'B'),
  (2025, 3, 6, 'singles', 'Singles', 'Ombria Golf Resort', 'single', 'Team Truman', 'Josh Conlan', null, 'Team Bamford', 'Finn Begley', 1, 0, 1, 'B'),
  (2025, 3, 7, 'singles', 'Singles', 'Ombria Golf Resort', 'single', 'Team Truman', 'Dave Birn', null, 'Team Bamford', 'Ben Walmsley', 1, 1, 0, 'A'),
  (2025, 3, 8, 'singles', 'Singles', 'Ombria Golf Resort', 'single', 'Team Truman', 'Sam Aycock', null, 'Team Bamford', 'Will Major', 1, 1, 0, 'A'),
  (2025, 3, 9, 'singles', 'Singles', 'Ombria Golf Resort', 'single', 'Team Truman', 'Remi Worthhalter', null, 'Team Bamford', 'Sam Huxtable', 1, 1, 0, 'A'),
  (2025, 3, 10, 'singles', 'Singles', 'Ombria Golf Resort', 'single', 'Team Truman', 'Adam Musikant', 'AS', 'Team Bamford', 'Nick Wells', 1, 0.5, 0.5, 'halved'),
  (2025, 3, 11, 'singles', 'Singles', 'Ombria Golf Resort', 'single', 'Team Truman', 'Robert Findlay', null, 'Team Bamford', 'Niels Verbeek', 1, 0, 1, 'B'),
  (2025, 3, 12, 'singles', 'Singles', 'Ombria Golf Resort', 'single', 'Team Truman', 'Martin Horswood', null, 'Team Bamford', 'Henry Dubiel', 1, 1, 0, 'A'),
  (2022, 1, 1, 'better_ball', 'Better ball', 'Faldo Course', 'team', 'Team Truman', 'Luke Gorman, Josh Conlan', null, 'Team Bamford', 'Finn Begley, Robert Findlay', 1, 0, 1, 'B'),
  (2022, 1, 2, 'better_ball', 'Better ball', 'Faldo Course', 'team', 'Team Truman', 'Connor Hamilton, Niels Verbeek', null, 'Team Bamford', 'Jack Bamford, Nick Wells', 1, 0, 1, 'B'),
  (2022, 1, 3, 'better_ball', 'Better ball', 'Faldo Course', 'team', 'Team Truman', 'Leif Skogland, Oliver Hunt', null, 'Team Bamford', 'Dave Birn, Brian Crotty', 1, 0, 1, 'B'),
  (2022, 1, 4, 'better_ball', 'Better ball', 'Faldo Course', 'team', 'Team Truman', 'Sam Truman, Will Major', null, 'Team Bamford', 'Alex Tonge, Adam Musikant', 1, 1, 0, 'A'),
  (2022, 2, 1, 'better_ball', 'Better ball', 'O''Connor Jnr. Course', 'team', 'Team Truman', 'Sam Truman, Josh Conlan', null, 'Team Bamford', 'Jack Bamford, Robert Findlay', 1, 1, 0, 'A'),
  (2022, 2, 2, 'better_ball', 'Better ball', 'O''Connor Jnr. Course', 'team', 'Team Truman', 'Luke Gorman, Oliver Hunt', null, 'Team Bamford', 'Brian Crotty, Alex Tonge', 1, 0, 1, 'B'),
  (2022, 2, 3, 'better_ball', 'Better ball', 'O''Connor Jnr. Course', 'team', 'Team Truman', 'Leif Skogland, Niels Verbeek', null, 'Team Bamford', 'Dave Birn, Adam Musikant', 1, 0, 1, 'B'),
  (2022, 2, 4, 'better_ball', 'Better ball', 'O''Connor Jnr. Course', 'team', 'Team Truman', 'Connor Hamilton, Will Major', null, 'Team Bamford', 'Nick Wells, Finn Begley', 1, 0, 1, 'B'),
  (2022, 3, 1, 'better_ball', 'Better ball', 'O''Connor Jnr. Course (Sun)', 'team', 'Team Truman', 'Sam Truman, Oliver Hunt', 'AS', 'Team Bamford', 'Brian Crotty, Finn Begley', 1, 0.5, 0.5, 'halved'),
  (2022, 3, 2, 'better_ball', 'Better ball', 'O''Connor Jnr. Course (Sun)', 'team', 'Team Truman', 'Niels Verbeek, Connor Hamilton', null, 'Team Bamford', 'Dave Birn, Jack Bamford', 1, 1, 0, 'A'),
  (2022, 3, 3, 'better_ball', 'Better ball', 'O''Connor Jnr. Course (Sun)', 'team', 'Team Truman', 'Luke Gorman, Josh Conlan', null, 'Team Bamford', 'Adam Musikant, Nick Wells', 1, 1, 0, 'A'),
  (2022, 3, 4, 'better_ball', 'Better ball', 'O''Connor Jnr. Course (Sun)', 'team', 'Team Truman', 'Leif Skogland, Will Major', 'AS', 'Team Bamford', 'Alex Tonge, Robert Findlay', 1, 0.5, 0.5, 'halved'),
  (2022, 4, 1, 'singles', 'Singles', 'Faldo Course', 'single', 'Team Truman', 'Niels Verbeek', null, 'Team Bamford', 'Finn Begley', 1, 0, 1, 'B'),
  (2022, 4, 2, 'singles', 'Singles', 'Faldo Course', 'single', 'Team Truman', 'Oliver Hunt', null, 'Team Bamford', 'Robert Findlay', 1, 0, 1, 'B'),
  (2022, 4, 3, 'singles', 'Singles', 'Faldo Course', 'single', 'Team Truman', 'Luke Gorman', null, 'Team Bamford', 'Dave Birn', 1, 1, 0, 'A'),
  (2022, 4, 4, 'singles', 'Singles', 'Faldo Course', 'single', 'Team Truman', 'Leif Skogland', 'AS', 'Team Bamford', 'Jack Bamford', 1, 0.5, 0.5, 'halved'),
  (2022, 4, 5, 'singles', 'Singles', 'Faldo Course', 'single', 'Team Truman', 'Josh Conlan', null, 'Team Bamford', 'Adam Musikant', 1, 1, 0, 'A'),
  (2022, 4, 6, 'singles', 'Singles', 'Faldo Course', 'single', 'Team Truman', 'Sam Truman', null, 'Team Bamford', 'Nick Wells', 1, 1, 0, 'A'),
  (2022, 4, 7, 'singles', 'Singles', 'Faldo Course', 'single', 'Team Truman', 'Will Major', null, 'Team Bamford', 'Alex Tonge', 1, 1, 0, 'A'),
  (2022, 4, 8, 'singles', 'Singles', 'Faldo Course', 'single', 'Team Truman', 'Connor Hamilton', null, 'Team Bamford', 'Brian Crotty', 1, 1, 0, 'A'),
  (2023, 1, 1, 'better_ball', 'Better ball', 'Old Course', 'team', 'Team Truman', 'Tom Reed, Adam Musikant', null, 'Team Bamford', 'Ben Walmsley, Leif Skogland', 1, 1, 0, 'A'),
  (2023, 1, 2, 'better_ball', 'Better ball', 'Old Course', 'team', 'Team Truman', 'Alex Tonge, Robert Findlay', null, 'Team Bamford', 'Scott Stanley, Dan Birn', 1, 1, 0, 'A'),
  (2023, 1, 3, 'better_ball', 'Better ball', 'Old Course', 'team', 'Team Truman', 'Nick Wells, Luke Gorman', null, 'Team Bamford', 'Josh Conlan, Dave Birn', 1, 0, 1, 'B'),
  (2023, 1, 4, 'better_ball', 'Better ball', 'Old Course', 'team', 'Team Truman', 'Niels Verbeek, Mike Hamblin', 'AS', 'Team Bamford', 'Brian Crotty, Jack Bamford', 1, 0.5, 0.5, 'halved'),
  (2023, 1, 5, 'better_ball', 'Better ball', 'Old Course', 'team', 'Team Truman', 'Simon Butler, Sam Truman', null, 'Team Bamford', 'Connor Hamilton, Oliver Hunt', 1, 1, 0, 'A'),
  (2023, 2, 1, 'better_ball', 'Better ball', 'Millenium Course', 'team', 'Team Truman', 'Luke Gorman, Niels Verbeek', null, 'Team Bamford', 'Josh Conlan, Jack Bamford', 1, 1, 0, 'A'),
  (2023, 2, 2, 'better_ball', 'Better ball', 'Millenium Course', 'team', 'Team Truman', 'Tom Reed, Simon Butler', null, 'Team Bamford', 'Scott Stanley, Ben Walmsley', 1, 0, 1, 'B'),
  (2023, 2, 3, 'better_ball', 'Better ball', 'Millenium Course', 'team', 'Team Truman', 'Sam Truman, Adam Musikant', null, 'Team Bamford', 'Dave Birn, Dan Birn', 1, 1, 0, 'A'),
  (2023, 2, 4, 'better_ball', 'Better ball', 'Millenium Course', 'team', 'Team Truman', 'Mike Hamblin, Robert Findlay', null, 'Team Bamford', 'Connor Hamilton, Brian Crotty', 1, 0, 1, 'B'),
  (2023, 2, 5, 'better_ball', 'Better ball', 'Millenium Course', 'team', 'Team Truman', 'Alex Tonge, Nick Wells', null, 'Team Bamford', 'Oliver Hunt, Leif Skogland', 1, 1, 0, 'A'),
  (2023, 3, 1, 'singles', 'Singles', 'Victoria Course', 'single', 'Team Truman', 'Nick Wells', null, 'Team Bamford', 'Dave Birn', 1, 0, 1, 'B'),
  (2023, 3, 2, 'singles', 'Singles', 'Victoria Course', 'single', 'Team Truman', 'Luke Gorman', null, 'Team Bamford', 'Brian Crotty', 1, 1, 0, 'A'),
  (2023, 3, 3, 'singles', 'Singles', 'Victoria Course', 'single', 'Team Truman', 'Robert Findlay', null, 'Team Bamford', 'Leif Skogland', 1, 0, 1, 'B'),
  (2023, 3, 4, 'singles', 'Singles', 'Victoria Course', 'single', 'Team Truman', 'Adam Musikant', null, 'Team Bamford', 'Josh Conlan', 1, 1, 0, 'A'),
  (2023, 3, 5, 'singles', 'Singles', 'Victoria Course', 'single', 'Team Truman', 'Alex Tonge', null, 'Team Bamford', 'Jack Bamford', 1, 1, 0, 'A'),
  (2023, 3, 6, 'singles', 'Singles', 'Victoria Course', 'single', 'Team Truman', 'Tom Reed', null, 'Team Bamford', 'Ben Walmsley', 1, 1, 0, 'A'),
  (2023, 3, 7, 'singles', 'Singles', 'Victoria Course', 'single', 'Team Truman', 'Sam Truman', null, 'Team Bamford', 'Connor Hamilton', 1, 0, 1, 'B'),
  (2023, 3, 8, 'singles', 'Singles', 'Victoria Course', 'single', 'Team Truman', 'Niels Verbeek', null, 'Team Bamford', 'Dan Birn', 1, 1, 0, 'A'),
  (2023, 3, 9, 'singles', 'Singles', 'Victoria Course', 'single', 'Team Truman', 'Mike Hamblin', null, 'Team Bamford', 'Oliver Hunt', 1, 1, 0, 'A'),
  (2023, 3, 10, 'singles', 'Singles', 'Victoria Course', 'single', 'Team Truman', 'Simon Butler', null, 'Team Bamford', 'Scott Stanley', 1, 0, 1, 'B'),
  (2024, 2, 1, 'scramble', 'Scramble', 'Laranjal Course', 'team', 'Team Bamford', 'Robert Findlay, Mike Hamblin', null, 'Team Truman', 'Josh Conlan, Sam Truman', 1, 0, 1, 'B'),
  (2024, 2, 2, 'scramble', 'Scramble', 'Laranjal Course', 'team', 'Team Bamford', 'Niels Verbeek, Nick Wells', null, 'Team Truman', 'Dave Birn, Adam Musikant', 1, 0, 1, 'B'),
  (2024, 2, 3, 'scramble', 'Scramble', 'Laranjal Course', 'team', 'Team Bamford', 'Oliver Hunt, Luke Gorman', null, 'Team Truman', 'Simon Butler, Tom Reed', 1, 0, 1, 'B'),
  (2024, 2, 4, 'scramble', 'Scramble', 'Laranjal Course', 'team', 'Team Bamford', 'Ben Walmsley, Connor Hamilton', null, 'Team Truman', 'Stuart Loggie, Shaun Feldon', 1, 1, 0, 'A'),
  (2024, 2, 5, 'scramble', 'Scramble', 'Laranjal Course', 'team', 'Team Bamford', 'Scott Stanley, Peter Garczewski', null, 'Team Truman', 'Alex Tonge, Will Major', 1, 0, 1, 'B'),
  (2024, 3, 1, 'singles', 'Singles', 'North Course', 'single', 'Team Bamford', 'Connor Hamilton', null, 'Team Truman', 'Alex Tonge', 1, 0, 1, 'B'),
  (2024, 3, 2, 'singles', 'Singles', 'North Course', 'single', 'Team Bamford', 'Peter Garczewski', null, 'Team Truman', 'Sam Truman', 1, 1, 0, 'A'),
  (2024, 3, 3, 'singles', 'Singles', 'North Course', 'single', 'Team Bamford', 'Ben Walmsley', null, 'Team Truman', 'Shaun Feldon', 1, 0, 1, 'B'),
  (2024, 3, 4, 'singles', 'Singles', 'North Course', 'single', 'Team Bamford', 'Oliver Hunt', null, 'Team Truman', 'Adam Musikant', 1, 0, 1, 'B'),
  (2024, 3, 5, 'singles', 'Singles', 'North Course', 'single', 'Team Bamford', 'Mike Hamblin', null, 'Team Truman', 'Josh Conlan', 1, 1, 0, 'A'),
  (2024, 3, 6, 'singles', 'Singles', 'North Course', 'single', 'Team Bamford', 'Niels Verbeek', 'AS', 'Team Truman', 'Simon Butler', 1, 0.5, 0.5, 'halved'),
  (2024, 3, 7, 'singles', 'Singles', 'North Course', 'single', 'Team Bamford', 'Luke Gorman', null, 'Team Truman', 'Dave Birn', 1, 0, 1, 'B'),
  (2024, 3, 8, 'singles', 'Singles', 'North Course', 'single', 'Team Bamford', 'Nick Wells', null, 'Team Truman', 'Stuart Loggie', 1, 1, 0, 'A'),
  (2024, 3, 9, 'singles', 'Singles', 'North Course', 'single', 'Team Bamford', 'Scott Stanley', 'AS', 'Team Truman', 'Tom Reed', 1, 0.5, 0.5, 'halved'),
  (2024, 3, 10, 'singles', 'Singles', 'North Course', 'single', 'Team Bamford', 'Robert Findlay', null, 'Team Truman', 'Will Major', 1, 0, 1, 'B'),
  (2024, 1, 1, 'better_ball', 'Better ball', 'Monte Rei Golf & Country Club', 'team', 'Team Bamford', 'Scott Stanley, Ben Walmsley', null, 'Team Truman', 'Alex Tonge, Adam Musikant', 1, 0, 1, 'B'),
  (2024, 1, 2, 'better_ball', 'Better ball', 'Monte Rei Golf & Country Club', 'team', 'Team Bamford', 'Mike Hamblin, Peter Garczewski', null, 'Team Truman', 'Dave Birn, Stuart Loggie', 1, 1, 0, 'A'),
  (2024, 1, 3, 'better_ball', 'Better ball', 'Monte Rei Golf & Country Club', 'team', 'Team Bamford', 'Niels Verbeek, Luke Gorman', null, 'Team Truman', 'Will Major, Sam Truman', 1, 0, 1, 'B'),
  (2024, 1, 4, 'better_ball', 'Better ball', 'Monte Rei Golf & Country Club', 'team', 'Team Bamford', 'Robert Findlay, Nick Wells', null, 'Team Truman', 'Simon Butler, Shaun Feldon', 1, 1, 0, 'A'),
  (2024, 1, 5, 'better_ball', 'Better ball', 'Monte Rei Golf & Country Club', 'team', 'Team Bamford', 'Connor Hamilton, Oliver Hunt', null, 'Team Truman', 'Josh Conlan, Tom Reed', 1, 1, 0, 'A');

insert into matches (tour_id, round_id, match_number, format, status, side_a_team_id, side_b_team_id, side_a_label, side_b_label, points_available, points_side_a, points_side_b, winning_side, result_text, published, notes)
select t.id, r.id, hm.match_number, hm.format, 'complete', side_a.id, side_b.id,
       hm.side_a_team, hm.side_b_team, hm.points_available, hm.points_side_a, hm.points_side_b, hm.winning_side,
       nullif(btrim(hm.result_text), ''), true, 'Historic match-level backfill.'
from historic_matches hm
join tours t on t.year = hm.year
join rounds r on r.tour_id = t.id and r.round_number = hm.round_number
join tour_teams side_a on side_a.tour_id = t.id and side_a.name = hm.side_a_team
join tour_teams side_b on side_b.tour_id = t.id and side_b.name = hm.side_b_team
on conflict (round_id, match_number) do update set
  tour_id = excluded.tour_id,
  format = excluded.format,
  status = excluded.status,
  side_a_team_id = excluded.side_a_team_id,
  side_b_team_id = excluded.side_b_team_id,
  side_a_label = excluded.side_a_label,
  side_b_label = excluded.side_b_label,
  points_available = excluded.points_available,
  points_side_a = excluded.points_side_a,
  points_side_b = excluded.points_side_b,
  winning_side = excluded.winning_side,
  result_text = excluded.result_text,
  published = excluded.published,
  notes = excluded.notes,
  updated_at = now();

drop table if exists pg_temp.historic_match_players;
create temp table historic_match_players as
select hm.year, hm.round_number, hm.match_number, hm.format, hm.winning_side,
       hm.points_side_a, hm.points_side_b, 'A'::text as side, hm.side_a_team as team_name, btrim(player_name) as display_name
from historic_matches hm, regexp_split_to_table(hm.side_a_players, ',') as player_name
union all
select hm.year, hm.round_number, hm.match_number, hm.format, hm.winning_side,
       hm.points_side_a, hm.points_side_b, 'B'::text as side, hm.side_b_team as team_name, btrim(player_name) as display_name
from historic_matches hm, regexp_split_to_table(hm.side_b_players, ',') as player_name;

insert into tour_players (tour_id, player_id, attending)
select distinct t.id, p.id, true
from historic_match_players hmp
join tours t on t.year = hmp.year
join players p on lower(btrim(p.display_name)) = lower(btrim(hmp.display_name))
on conflict (tour_id, player_id) do update set attending = true;

insert into tour_team_members (tour_id, team_id, player_id)
select distinct t.id, tt.id, p.id
from historic_match_players hmp
join tours t on t.year = hmp.year
join tour_teams tt on tt.tour_id = t.id and tt.name = hmp.team_name
join players p on lower(btrim(p.display_name)) = lower(btrim(hmp.display_name))
on conflict (tour_id, player_id) do update set team_id = excluded.team_id;

insert into match_participants (match_id, player_id, side, team_id)
select m.id, p.id, hmp.side, tt.id
from historic_match_players hmp
join tours t on t.year = hmp.year
join rounds r on r.tour_id = t.id and r.round_number = hmp.round_number
join matches m on m.round_id = r.id and m.match_number = hmp.match_number
join tour_teams tt on tt.tour_id = t.id and tt.name = hmp.team_name
join players p on lower(btrim(p.display_name)) = lower(btrim(hmp.display_name))
on conflict (match_id, player_id) do update set
  side = excluded.side,
  team_id = excluded.team_id;

insert into player_match_results (tour_id, round_id, match_id, player_id, team_id, format, result, points_for, points_against)
select t.id, r.id, m.id, p.id, tt.id, hmp.format,
       case
         when hmp.winning_side = 'halved' then 'draw'
         when hmp.winning_side = hmp.side then 'win'
         else 'loss'
       end as result,
       case
         when hmp.winning_side = 'halved' then 0.5
         when hmp.winning_side = hmp.side then 1
         else 0
       end as points_for,
       case
         when hmp.winning_side = 'halved' then 0.5
         when hmp.winning_side = hmp.side then 0
         else 1
       end as points_against
from historic_match_players hmp
join tours t on t.year = hmp.year
join rounds r on r.tour_id = t.id and r.round_number = hmp.round_number
join matches m on m.round_id = r.id and m.match_number = hmp.match_number
join tour_teams tt on tt.tour_id = t.id and tt.name = hmp.team_name
join players p on lower(btrim(p.display_name)) = lower(btrim(hmp.display_name))
on conflict (match_id, player_id) do update set
  tour_id = excluded.tour_id,
  round_id = excluded.round_id,
  team_id = excluded.team_id,
  format = excluded.format,
  result = excluded.result,
  points_for = excluded.points_for,
  points_against = excluded.points_against;

insert into tour_team_results (tour_id, team_id, final_points, position, result_status, notes)
select t.id, tt.id, htm.final_points,
       case htm.result_status when 'winner' then 1 when 'runner_up' then 2 else null end,
       htm.result_status,
       htm.confirmation_note
from historic_team_map htm
join tours t on t.year = htm.year
join tour_teams tt on tt.tour_id = t.id and tt.name = htm.team_name
on conflict (tour_id, team_id) do update set
  final_points = excluded.final_points,
  position = excluded.position,
  result_status = excluded.result_status,
  notes = excluded.notes,
  updated_at = now();

-- Match-level rows are seeded above, so do not insert historical_player_stats
-- from the legacy Records sheet; that would double-count all-time stats.
end $$;
