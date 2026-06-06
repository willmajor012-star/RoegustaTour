# Future scorecard stats

This PR keeps Roegusta Tour stats matchplay-only. Do not add scorecard entry, Golf GameBook imports, birdie/bogey awards or stableford calculations until the source of score data is confirmed.

## Individual round score summary

A future table could be `player_round_score_summaries` for individual rounds.

Suggested fields:

- `player_id`
- `tour_id`
- `round_id`
- `gross_score`
- `stableford_points`
- `eagles`
- `birdies`
- `pars`
- `bogeys`
- `doubles`
- `worse_than_double`
- `handicap_used`
- `notes`

## Team/scramble score summary

For scramble or team rounds, use side-level summaries instead of pretending there is an individual scorecard.

A future table could be `team_round_score_summaries`.

Suggested fields:

- `tour_id`
- `round_id`
- `match_id` if applicable
- `side`
- `team_id`
- `player_ids` or linked participants
- `gross_score`
- `stableford_points`
- `eagles`
- `birdies`
- `pars`
- `bogeys`
- `doubles`
- `worse_than_double`
- `handicap_used`
- `notes`

## Important future rules

- Scramble birdies and bogeys should not automatically count toward individual birdie/bogey awards unless explicitly configured later.
- Scramble/team score summaries can count toward separate team or scramble scoring awards.
- Handicap and stableford logic should be handled later once we know whether scores are coming from Golf GameBook, manual entry or spreadsheet import.
