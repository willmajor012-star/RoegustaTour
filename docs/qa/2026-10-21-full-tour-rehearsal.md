# Full tour rehearsal, 21 October 2026

## Result

The three-round database rehearsal passed both in isolated Postgres and against
the live database functions. The live rehearsal used exception rollback: no QA
tour, player, match, bet, result or audit entry was committed. The 2026 public-tour
selection and the pre-existing 2099 QA tour were unchanged by that rollback-only
scenario. A subsequent hosted browser rehearsal populated the private 2099 QA
tour as described below. The real 2026 tour remains the current public tour.

| Scenario | Verified result |
| --- | --- |
| Attendance and teams | 16 attending players, two teams of eight |
| Formats | Better ball, scramble and singles |
| Pairings | Four better-ball matches, four scramble matches, eight singles |
| Scoring | Round totals 3–1, 2–2 and 4–4, final result 9–7 |
| Player statistics | 48 result records, three matches per player |
| Final statistics | Correct team points, eight tour winners, current and all-time match records |
| Betting | All 16 simulated players submit a pick on each round |
| Daily minimum | A £5 pick receives exactly one £5 automatic top-up |
| Editing | Valid token edits succeed; wrong-token edits fail |
| Voiding | Voided picks are excluded, replacement picks settle normally |
| Cutoffs | Closed markets reject new picks |
| Settlement | £160 per round, £480 across the tour, with exactly £480 distributed |
| Corrections | Correcting and restoring a winner recalculates without compounding payouts |
| Result clearing | Removes the relevant player results and recalculates team totals |
| Cumulative balances | All 16 player balances reconcile; aggregate net is zero |

The deterministic example pays Player 1 £340 against £30 staked, for a £310 net
gain. Players 2–8 each finish £10 down, and Players 9–16 each finish £30 down.
This is deliberately predictable test data, not a forecast or real betting ledger.

## Rendered UI and handler coverage

The reusable local UI rehearsal mounts the actual React components in jsdom and
routes their requests through the actual Netlify handlers into isolated Postgres.
Only the Supabase transport is adapted to the local database. Admin session and
public access validation execute with local fixture sessions.

It operates 48 rendered betting forms, selects and publishes all 16 match results,
publishes the three playing winners through the Live desk, settles their linked
markets, and completes the tour. It also opens the full Admin shell and its six
workspaces and available subsections.

The database-only live rehearsal calls the installed SQL functions directly.
The subsequent authenticated hosted rehearsal below also exercises the live
Netlify request routing through the production Admin screens.

## Hosted 24-player rehearsal

Completed on the live site in `QA TEST TOUR 2099`, with `is_test = true` and the
tour kept planned and non-current so it stays outside public tour history.

| Hosted action | Verified result |
| --- | --- |
| Attendance and assignments | 24 attending players, two QA teams of 12, nobody unassigned |
| Round setup | Three saved rounds: scramble, better ball and singles |
| Pairings | Six scramble, six better-ball and 12 singles matches, all saved through the UI |
| Sequential tee times | Eight-minute intervals from 09:00, ending 09:40 for pairs and 10:28 for singles |
| Results | All 24 matches complete and published within the private tour; 72 player result records |
| Scoring | Round scores 4–2, 3–3 and 6–6, final total 13–11 |
| Match correction | Changing the first winner produces 12–12; restoring it returns 13–11, still 72 player results |
| Playing winners | QA Red with 70 gross, Adam Musikant with 40 points, Will Major with 41 points |
| Market guard | Publishing a winner against a draft market is rejected |
| Automatic defaults | Closing each required market produces exactly 24 default picks, 72 in total |
| Settlement | All three pools settled through the Live desk; £240 per round, £720 simulated stake and £720 payouts |
| Settlement correction | Changing the scramble winner to QA Blue retains 24 picks and £240 payouts; restoring QA Red retains the same totals |
| Isolation | Roegusta Tour 2026 remains current public; QA tour remains planned and non-current |

The rounds initially used dates in June 2099. For the cutoff and settlement
phase, only those QA round dates were changed to 1–3 June 2020. Their fixed market
deadlines synchronised automatically to 08:00 UTC, equivalent to 09:00 Lisbon.
Existing market titles retain their original June 2099 date text. All ledger
amounts are simulated test records, with no payment or collection.

The hosted production desk returns to Round 1 after a save-triggered refresh.
This independently confirms the loading-boundary behaviour addressed in this PR.
The hosted walkthrough used the current live version; the new controlled margin
inputs and refresh fix were verified locally and in the deployment build, and
are not yet deployed to the main live site.

Public bettor entry/token editing and marking a tour complete were exercised in
the isolated rehearsals, not on the hosted QA tour. Public bettor entry requires
the current public tour, and completing the QA tour would expose it in public
history. Neither was needed to test the hosted defaults and settlement flow.
The private QA records are retained for inspection.

## Result-entry fixes

1. Match drafts previously reset whenever refreshed match data arrived, including
   a refresh caused by saving a prize winner. Unsaved entries now survive refreshes
   and round changes. Successfully saved entries resume following server data.
2. Result margins now use the existing controlled nine- or eighteen-hole choices.
   A/S sets both the halved outcome and AS margin. Choosing a winning side clears
   an incompatible AS margin. Selecting AS as a margin selects the halved outcome.
3. Round selection is disabled during saves, and match controls are disabled while
   result requests run, to keep the save attached to the displayed round/entries.
4. Admin now keeps the Live desk mounted while data refreshes and after a refresh
   failure. Editing is disabled until the refresh succeeds, with an explicit retry
   control after failure. Changing tours resets the desk to the new tour. The
   production Admin shell test saves a prize while a match has unsaved edits,
   holds its data request open, then tests both successful refresh and failed
   refresh/retry. The same test fails against the previous loading behaviour.

## Usability assessment

| Task | What works | Remaining improvement |
| --- | --- | --- |
| Team setup | Bulk attendance and team assignment; pairing protections | Review tomorrow's final roster before creating pairings |
| Match setup | Duplicate-player protection, format limits, sequential tee times | A future grid editor could speed initial pairings; the existing tools are usable |
| Results | One round selection, visible teams and players, grouped save/publish | The fixes remove free typing and lost unsaved work |
| Betting setup | Create missing daily markets, generated player/team options, timezone-aware first tee | Keep advanced market settings secondary during operation |
| Prize results | One playing-winner save settles the linked pool | Check market linkage and options before the first tee |
| Final accounts | Whole-tour stake, payout and net totals reconcile | Payment collection remains an offline organiser task |

Round publication currently issues separate atomic match saves followed by the
round-publication request. It is not one transaction for the entire round. A
connection failure can therefore leave a partially published set of matches;
retrying the saved entries is safe. Do not present the round publish button as an
all-or-nothing database operation.

Tomorrow's actual venues, dates, formats, team assignments and tee times still
need entering and checking. This rehearsal verifies the supported workflow; it
does not validate details that have not yet been supplied.

## Hosted setup check: unscheduled rounds

On the live admin site, the private `QA TEST TOUR 2099` was given 24 attending
players and two QA teams. Creating three planned rounds then reported
“Set the round date before opening its Bet Punto market.” The first round had
already been saved: automatic market creation interrupted the remaining setup.
The real 2026 tour was not edited.

Automatic daily-market creation now waits until the round has a date and valid
first tee time. This also covers saving an individual unscheduled round. The
full Admin regression creates two additional unscheduled rounds with eligible
betting options already present and checks that both save without new markets.
It failed before the fix (four rounds instead of five) in both the 16-player
and 24-player rehearsals. The hosted walkthrough then continued using scheduled
individual round creation and completed the operational checks recorded above.

## Reproduction commands

Run `npm test` for the full regression suite, including the full-tour rehearsal,
or `node --test tests/full-tour-rehearsal.test.mjs` for this workflow alone.
Run `npm run build` for production type checking and bundling.

`scripts/qa/full-tour-rehearsal.sql` is the rollback-only database scenario. It
temporarily changes public-tour selection inside an uncommitted subtransaction,
captures only its own generated QA evidence, then rolls everything back. Errors
abort the statement rather than commit a partial rehearsal. Do not remove its
exception/rollback wrapper when running against a shared database.
