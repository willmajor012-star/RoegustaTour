# Roegusta historic data sources

These files support a one-off historic Supabase backfill for the 2022, 2023, 2024 and 2025 Roegusta Tours.

## Files

- `roegusta_historic_matches_cleaned.csv` — cleaned match-level rows used to seed matches, participants and player match results.
- `roegusta_round_map.csv` — the source of truth for historic round numbers, courses, formats and per-round point totals.
- `roegusta_tour_team_map.csv` — the source of truth for side-to-team mapping and final team results.
- `roegusta_historic_data_notes.md` — notes from the workbook clean-up and modelling decisions.

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

## How to use the seed

Run `supabase/seeds/seed_historic_results_2022_2025.sql` only as a one-off backfill for historic tours from 2022 through 2025. The seed is designed to be idempotent and uses natural lookups/upserts for tours, teams, rounds, matches, participants, player match results and tour team results.

Do **not** extend this into a recurring CSV import workflow. Future tours, starting with 2026, should be created and managed through the app/admin lifecycle: create the tour, add/select players, assign attendance, assign teams, create rounds, create pairings, enter results, then complete/archive the tour.

Do **not** seed the workbook `Records` sheet into `historical_player_stats` when match-level rows are seeded, because all-time match stats are derived from `player_match_results` and would be double-counted.

After applying the seed, run `supabase/seeds/verify_historic_results_2022_2025.sql` to check expected counts, final team scores, duplicate guards and leaderboard/tour-record derivations.
