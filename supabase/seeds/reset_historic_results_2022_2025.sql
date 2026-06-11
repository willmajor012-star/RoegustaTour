-- Reset only tour-scoped historic child data for the 2022-2025 Roegusta Tours.
-- This is intended only for clearing a previous bad historic seed before rerunning
-- seed_historic_results_2022_2025.sql.
--
-- Safety notes:
-- - Does not delete players.
-- - Does not delete tours.
-- - Does not touch 2026/current/future tour data.

begin;

delete from player_match_results pmr
using tours t
where pmr.tour_id = t.id
  and t.year between 2022 and 2025;

delete from match_participants mp
using matches m, tours t
where mp.match_id = m.id
  and m.tour_id = t.id
  and t.year between 2022 and 2025;

delete from matches m
using tours t
where m.tour_id = t.id
  and t.year between 2022 and 2025;

delete from rounds r
using tours t
where r.tour_id = t.id
  and t.year between 2022 and 2025;

delete from tour_team_results ttr
using tours t
where ttr.tour_id = t.id
  and t.year between 2022 and 2025;

delete from tour_team_members ttm
using tours t
where ttm.tour_id = t.id
  and t.year between 2022 and 2025;

delete from tour_players tp
using tours t
where tp.tour_id = t.id
  and t.year between 2022 and 2025;

delete from tour_teams tt
using tours t
where tt.tour_id = t.id
  and t.year between 2022 and 2025;

delete from historical_player_stats hps
using tours t
where hps.tour_id = t.id
  and t.year between 2022 and 2025;

commit;
