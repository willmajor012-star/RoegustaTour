# Roegusta historic data sources

These files support a one-off historic Supabase backfill for the 2022, 2023, 2024 and 2025 Roegusta Tours.

## Files

- `roegusta_historic_matches_cleaned.csv` — cleaned match-level rows used to seed matches, participants and player match results.
- `roegusta_round_map.csv` — the source of truth for historic round numbers, courses, formats and per-round point totals.
- `roegusta_tour_team_map.csv` — the source of truth for side-to-team mapping and final team results.
- `roegusta_historic_data_notes.md` — notes from the workbook clean-up and modelling decisions.
- `supabase/seeds/seed_historic_results_2022_2025.sql` — Supabase-safe DO-block seed for the historic match-level backfill.
- `supabase/seeds/reset_historic_results_2022_2025.sql` — optional reset utility for clearing only tour-scoped historic child rows from a previous bad seed.
- `supabase/seeds/verify_historic_results_2022_2025.sql` — verification queries for counts, duplicate guards and derived record checks.

## Known cleanups and modelling rules

- The workbook's original `Round` column described the match format, not the round number, so round numbers are inferred through `roegusta_round_map.csv`.
- 2022 intentionally has four rounds and must not be normalised down to three rounds.
- 2023, 2024 and 2025 each have three rounds in the cleaned source.
- The app must derive a tour's round count from `rounds` rows; do not hardcode three rounds globally.
- Historic team names are `Team Truman` and `Team Bamford`.
- The 2024 mapping is confirmed as Side A = `Team Bamford` and Side B = `Team Truman`; Jack Bamford missed that tour, but the team name was retained.
- Source row 31 had an outcome typo (`lot to`) normalised to `lost to`.
- Source row 59 had its year corrected from 2022 to 2023 based on the Victoria Course singles block.
- Exact match margins are not invented. Rows without source margin text should keep `result_text` blank/null and let the app use a generic score fallback.

## Supabase SQL run order

Run these SQL files manually in the Supabase SQL Editor when applying or repairing the historic backfill:

1. Run the foursomes migration if it has not already been applied in the target database.
2. Run `supabase/seeds/reset_historic_results_2022_2025.sql` **only** if you need to clear tour-scoped child rows from a previous bad historic seed. The reset utility does not delete `players`, `tours`, or any 2026/current/future tour data.
3. Run `supabase/seeds/seed_historic_results_2022_2025.sql`. This is the Supabase-safe DO-block seed; it does not rely on temporary staging tables persisting across separate SQL statements in the SQL Editor.
4. Run `supabase/seeds/verify_historic_results_2022_2025.sql` to check expected counts, final team scores, duplicate guards and leaderboard/tour-record derivations.

## Verified live database counts

After the Supabase-safe seed was run and verified in the live database, the expected historic counts are:

| Year | Rounds | Matches | Points | Player match results |
| --- | ---: | ---: | ---: | ---: |
| 2022 | 4 | 20 | 20 | 64 |
| 2023 | 3 | 20 | 20 | 60 |
| 2024 | 3 | 20 | 20 | 60 |
| 2025 | 3 | 24 | 24 | 72 |

The same verification should report `duplicate_match_participants = 0`, `duplicate_player_match_results = 0`, and `historical_player_stats_rows_2022_2025 = 0`.

## How to use the seed

Run `supabase/seeds/seed_historic_results_2022_2025.sql` only as a one-off backfill for historic tours from 2022 through 2025. The seed is designed to be idempotent and uses natural lookups/upserts for tours, teams, rounds, matches, participants, player match results and tour team results.

Do **not** extend this into a recurring CSV import workflow. Future tours, starting with 2026, should be created and managed through the app/admin lifecycle: create the tour, add/select players, assign attendance, assign teams, create rounds, create pairings, enter results, then complete/archive the tour.

Do **not** seed the workbook `Records` sheet into `historical_player_stats` when match-level rows are seeded, because all-time match stats are derived from `player_match_results` and would be double-counted.
