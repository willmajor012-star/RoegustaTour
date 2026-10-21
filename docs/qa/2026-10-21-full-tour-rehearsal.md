# Full tour rehearsal, 21 October 2026

## Result

The three-round database rehearsal passed both in isolated Postgres and against
the live database functions. The live rehearsal used exception rollback: no QA
tour, player, match, bet, result or audit entry was committed. The 2026 public-tour
selection and the pre-existing 2099 QA tour remain unchanged.

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

The database-only live rehearsal calls the installed SQL functions directly. It
does not verify Netlify's live request routing or a hosted browser session. A
fresh authenticated walkthrough of the hosted Admin screens remains outstanding.

## Result-entry fixes

1. Match drafts previously reset whenever refreshed match data arrived, including
   a refresh caused by saving a prize winner. Unsaved entries now survive refreshes
   and round changes. Successfully saved entries resume following server data.
2. Result margins now use the existing controlled nine- or eighteen-hole choices.
   A/S sets both the halved outcome and AS margin. Choosing a winning side clears
   an incompatible AS margin. Selecting AS as a margin selects the halved outcome.
3. Round selection is disabled during saves, and match controls are disabled while
   result requests run, to keep the save attached to the displayed round/entries.

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

## Reproduction

Run `npm test` for the full regression suite, including the full-tour rehearsal,
or `node --test tests/full-tour-rehearsal.test.mjs` for this workflow alone.
Run `npm run build` for production type checking and bundling.

`scripts/qa/full-tour-rehearsal.sql` is the rollback-only database scenario. It
temporarily changes public-tour selection inside an uncommitted subtransaction,
captures only its own generated QA evidence, then rolls everything back. Errors
abort the statement rather than commit a partial rehearsal. Do not remove its
exception/rollback wrapper when running against a shared database.
