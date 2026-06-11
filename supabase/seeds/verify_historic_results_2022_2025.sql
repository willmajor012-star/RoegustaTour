-- Verification queries for the one-off 2022-2025 historic match-level seed.

-- Count tours by year. Expected: one row each for 2022, 2023, 2024 and 2025.
select year, count(*) as tour_count
from tours
where year between 2022 and 2025
group by year
order by year;

-- Count rounds by year. Expected: 2022 = 4; 2023/2024/2025 = 3.
select t.year, count(r.id) as round_count
from tours t
left join rounds r on r.tour_id = t.id
where t.year between 2022 and 2025
group by t.year
order by t.year;

-- Count matches by year. Expected: 2022 = 20; 2023 = 20; 2024 = 20; 2025 = 24.
select t.year, count(m.id) as match_count
from tours t
left join matches m on m.tour_id = t.id
where t.year between 2022 and 2025
group by t.year
order by t.year;

-- Sum available points by year. Expected: 2022 = 20; 2023 = 20; 2024 = 20; 2025 = 24.
select t.year, coalesce(sum(m.points_available), 0) as available_points
from tours t
left join matches m on m.tour_id = t.id
where t.year between 2022 and 2025
group by t.year
order by t.year;

-- Team final score by year, including 2024's confirmed Team Bamford side A / Team Truman side B mapping.
select t.year, tt.name as team_name, htm.side as historic_side, ttr.final_points, ttr.result_status
from tours t
join tour_teams tt on tt.tour_id = t.id
left join tour_team_results ttr on ttr.tour_id = t.id and ttr.team_id = tt.id
left join (values
  (2022, 'A', 'Team Truman'), (2022, 'B', 'Team Bamford'),
  (2023, 'A', 'Team Truman'), (2023, 'B', 'Team Bamford'),
  (2024, 'A', 'Team Bamford'), (2024, 'B', 'Team Truman'),
  (2025, 'A', 'Team Truman'), (2025, 'B', 'Team Bamford')
) as htm(year, side, team_name) on htm.year = t.year and htm.team_name = tt.name
where t.year between 2022 and 2025
order by t.year, htm.side;

-- Player match result row count by year.
select t.year, count(pmr.id) as player_match_results_count
from tours t
left join player_match_results pmr on pmr.tour_id = t.id
where t.year between 2022 and 2025
group by t.year
order by t.year;

-- All-time match leaderboard top 10, derived from player_match_results only.
select p.display_name,
       count(*) as matches,
       count(*) filter (where pmr.result = 'win') as wins,
       count(*) filter (where pmr.result = 'draw') as draws,
       count(*) filter (where pmr.result = 'loss') as losses,
       sum(pmr.points_for) as points_for,
       round((sum(pmr.points_for) / nullif(count(*), 0))::numeric, 3) as points_per_match
from player_match_results pmr
join players p on p.id = pmr.player_id
join tours t on t.id = pmr.tour_id
where t.year between 2022 and 2025
  and pmr.result <> 'void'
group by p.id, p.display_name
order by points_for desc, wins desc, p.display_name
limit 10;

-- Tour record top 10 by wins, derived from tour_team_members + tour_team_results.
select p.display_name,
       count(*) as tour_appearances,
       count(*) filter (where ttr.result_status = 'winner') as tour_wins,
       count(*) filter (where ttr.result_status = 'runner_up') as tour_losses,
       count(*) filter (where ttr.result_status = 'draw') as tour_halves
from tour_team_members ttm
join tour_team_results ttr on ttr.tour_id = ttm.tour_id and ttr.team_id = ttm.team_id
join tours t on t.id = ttm.tour_id
join players p on p.id = ttm.player_id
where t.year between 2022 and 2025
group by p.id, p.display_name
order by tour_wins desc, tour_appearances desc, p.display_name
limit 10;

-- Check for duplicate players by normalised display name. Expected: zero rows.
select lower(btrim(display_name)) as normalised_display_name, count(*) as duplicate_count, array_agg(display_name order by display_name) as display_names
from players
group by lower(btrim(display_name))
having count(*) > 1
order by normalised_display_name;

-- Check for duplicate match_participants by match/player. Expected: zero rows.
select match_id, player_id, count(*) as duplicate_count
from match_participants
group by match_id, player_id
having count(*) > 1
order by duplicate_count desc, match_id, player_id;

-- Check for duplicate player_match_results by match/player. Expected: zero rows.
select match_id, player_id, count(*) as duplicate_count
from player_match_results
group by match_id, player_id
having count(*) > 1
order by duplicate_count desc, match_id, player_id;

-- Guard against historical_player_stats double-counting for the backfilled tours. Expected: zero rows.
select t.year, count(hps.id) as historical_player_stats_rows
from tours t
join historical_player_stats hps on hps.tour_id = t.id
where t.year between 2022 and 2025
group by t.year
having count(hps.id) > 0
order by t.year;
