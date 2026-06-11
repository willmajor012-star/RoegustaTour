# Roegusta Historic Data Notes

Generated from uploaded workbook `golf_results_summary (2).xlsx`.

## Key notes

- The workbook's `Round` column currently means match format, not round number.
- Round numbers have been inferred from year + course + format.
- 2022 has four rounds. This is a genuine exception: Better Ball Faldo, Better Ball O'Connor Jnr., Sunday Better Ball O'Connor Jnr. Course (Sun), and Singles Faldo.
- 2023, 2024, 2025 and expected future editions use three rounds unless explicitly configured otherwise in admin.
- Do not hardcode three rounds globally. The app and seed should use the `rounds` rows.
- Do not seed the `Records` sheet as `historical_player_stats` if match-level rows are seeded, otherwise all-time stats will double-count.
- Teams for the historic editions are Team Truman and Team Bamford. Team naming is retained even where a namesake organiser/player missed the tour.
- 2024 team-name mapping is now confirmed: Side A = Team Bamford and Side B = Team Truman. Bamford missed the 2024 tour, but the team name was retained.

## Data cleanups applied

- Source row 31: Outcome typo `lot to` normalized as `lost to`.
- Source row 59: Year corrected from 2022 to 2023 based on Victoria Course / surrounding singles block.

## CSV files

- `roegusta_historic_matches_cleaned.csv`
- `roegusta_round_map.csv`
- `roegusta_tour_team_map.csv`

## Future data model notes

- Historic rows should be seeded once into Supabase using an idempotent SQL seed.
- Future editions should be created and maintained through the app admin UI. App admin writes should create/update the Supabase rows directly; future tours should not need manual CSV import unless data is being backfilled.
- Player match records should be derived from `player_match_results`.
- Player tour records should be derived from `tour_team_members` plus `tour_team_results`, not manually maintained.
- Player profile/headshot data should live in the permanent `players` table. Tour-specific profile details should live in tour-scoped tables so historic tour pages can preserve the player context for that edition.
