# 2026 tour audit - 22 October

The later GameBook amendment supersedes the hole-card workflow and Friday
combined-pool deadline recorded in this audit. See
[the amended implementation record](../confirmed-2026-implementation.md) and
[the results workflow verification](2026-10-22-gamebook-results.md).

## Betting commitments

The aggregate figure is a minimum, not a fixed pot or cap. Every tourist has six
independent pool commitments: Friday nine £5, Par 3 £10, Saturday £10, Sunday
£10, Monday nine £5 and combined £5. This is £45 each and £1,080 across 24.
Additional stakes increase the total; the regression rehearsal produces £1,085
when one golfer adds £5 above the Friday minimum. Existing bets on other
selections count, but stakes in another pool do not cover a shortfall.

The public betting page now explicitly labels the aggregate as a minimum and
explains that the final total can be higher. Per-person pool coverage and admin
compliance show staked amounts, shortfalls, completion and cutoffs.

## Cutoffs

All six saved deadlines were checked in production using Europe/Lisbon:

| Pool | Cutoff |
| --- | --- |
| Friday nine | 6 November, 14:20 |
| Combined | 6 November, 14:20 |
| Par 3 | 6 November, 19:30 |
| Saturday | 7 November, 10:00 |
| Sunday | 8 November, 11:24 |
| Monday | 9 November, 10:00 |

The deployed cron job is active every minute and successive actual executions
are successful. Since the real cutoffs are in November, today's production runs
correctly add no 2026 bets. Late discretionary writes are rejected against the
database clock even when the market status has not yet been changed by cron.
A new regression covers that delayed-job situation separately for all six pools.
Partial shortfalls, existing other selections, repeated processing, missing own
pairs, edits/void accounting and independent Friday afternoon/evening pools
are covered by the current rehearsals and regression suite.

## Scoring and Friday projections

Friday has individual gross hole cards for both members of each pair. Stableford
uses each agreed session handicap and takes the higher partner points per hole.
Monday has a distinct pair scramble gross card and its own handicap settings.
The same pair identities and saved Friday cards continue into Monday.

After all Friday cards are complete, the combined leaderboard ranks Friday
scores using Friday countback, displays Monday as not started, and shows the
39-point allocation as projected. The regression now explicitly verifies that
the projected allocation sums to 39 while there are zero confirmed award rows.
During incomplete Monday cards, totals and holes completed remain visible;
position points are pending until complete cards support a ranking.

Finalising the combined result records 39 points once. Corrections replace this
contribution. Saturday's six matches add six points, Sunday's twelve matches
add twelve, and Par 3 adds zero. The full rehearsal checks 57 available points,
29 to guarantee victory and a 28.5-28.5 draw. Match results and full-hole
Stableford scoring remain separate after early match finishes or concessions.

## Betting tie ambiguity corrected

An audit found that betting settlement was inheriting a generic competition
countback. The supplied brief confirms the combined competition countback but
does not establish that as the betting tie convention. Betting winner selection
now compares totals and requires a separately recorded betting decision if the
highest totals are tied. No new countback or shared-payout rule is assumed.
The existing single-winning-selection ledger is preserved. The organiser must
confirm the agreed betting tie convention; the recorded decision must explain
its application. Combined competition countback is unchanged.

## Remaining organiser inputs

- Team lists and golf pairs; Saturday matches and Sunday opponents/groups.
- Handicap values and format allowances, including Monday scramble settings.
- Which actual nine holes are played on Friday and Monday, in playing order.
- Par 3 hole count and scorecard; the independent draw still needs publishing.
- Saturday tee interval and remaining group starts.
- The agreed betting tie convention.

Both captains, main-course white tees and all room identities are saved. Every
one of the 24 room occupants is linked to an existing permanent identity.

## Verification boundary

Production configuration, scheduler activity and source/isolated database
rehearsals were checked. The authenticated live phone workflow is still pending
a browser session. No real 2026 bets or scores have been created for testing.
Physical iPhone/iPad and Android home-screen installation has not been tested;
manifest/icon assets and installation guidance were checked separately.
