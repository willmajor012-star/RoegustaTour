# Tour win prediction

The 2026 home score card estimates an outright win for either published side
and a final draw. It does not change scores, awards, draws, stakes or payouts.
The endpoint uses the existing public access gate and returns probabilities,
team identifiers and a short basis label only. Private pairings are never used
until published. Both complete 12-player squads are required; confirmed pairs
and opponents refine an estimate that can already run from the squads.

## Model version 1

- 20,000 deterministic Monte Carlo finishes per result snapshot.
- Historical match points are normalized to win = 1, half = 0.5, loss = 0.
  Duplicate match identities and imported summaries of represented editions are
  excluded. Each older edition receives 0.85 to the power of its age in years.
- Six neutral match-equivalents shrink the overall point rate toward 0.5.
  Format-specific rates borrow six observations from the overall rate.
  Pair results contribute half an independent observation per player.
- Each simulation samples shared player-strength uncertainty across the tour.
  Match win preference is logistic(0.6 * the difference of mean player logits).
  The half probability is (weighted halves + 4)/(weighted matches + 40), bounded
  between 5% and 20%. Newcomers get a neutral mean with wider uncertainty.
- The 39-point competition is simulated as twelve pair totals and a ranking,
  never as independent point opportunities. Each remaining net Stableford hole
  has an initial mean of 2.35 on Friday and 2.2 on Monday, with a deliberately
  weak 0.10 player-logit adjustment. Remaining-score noise is 1.15 times the
  square root of remaining holes. These are conservative modelling assumptions,
  not agreed scoring settings or a handicap calculation. Actual entered totals,
  completed holes and zero results replace the relevant simulated portion.
- Friday's performance relative to the field provides a small capped form
  adjustment for remaining play. Par 3 has no influence. No handicap is applied.
- Combined totals use Monday totals as the first tiebreak. Published complete
  ranks respect recorded admin decisions and existing countback. Remaining
  unresolved positions are randomized in the forecast only. Nothing writes an
  ordering decision or tour-point allocation back to the app.
- Confirmed match points and active combined awards are locked once. Provisional
  Friday allocations are excluded. Corrections are read afresh. The remaining
  six pairs matches, twelve singles and combined ranking always conserve 57.
- Unknown partners/opponents are integrated by shuffling within the published
  sides for each simulation; these are hypothetical and never saved as a draw.
- Reported whole percentages sum to 100. Simulation sampling alone cannot
  produce 100% win certainty; confirmed points above 28.5 secure victory.
  A confirmed completed 28.5 each yields a 100% draw.

The UI says **Estimate**. These probabilities have not been calibrated against
an independent sample of comparable tours; history is a useful prior rather
than proof of a golfer's true net Stableford strength. In particular the combined
competition is new. Its actual scores progressively dominate the weak prior.

The card remains a single link to the tour overview, has accessible percentage
text, uses the team's colours and respects reduced-motion settings. It refreshes
through the standard public-data mechanism. Non-2026 rules are unchanged.
