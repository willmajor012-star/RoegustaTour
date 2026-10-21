# Confirmed 2026 implementation verification

## Deployment state

Application implementation is complete on `feat/confirmed-2026-tour`, based on
main `f6e69ef` (merged PR 63). The PR 63 mobile workflow remains in place.

The production Supabase schema migrations and the named `pg_cron` job are
installed. The job is active on `* * * * *`; actual independent executions are
recorded as succeeded in `bet_pool_scheduler_runs` (including 20:37 and 20:38 UTC
on 21 October). It calls the SQL function directly; no browser, Netlify visit,
HTTP secret or admin button is needed. Processing scans overdue configured
pools, so a missed attempt catches up at the next successful run.

The actual 2026 configuration is now installed in production: 24 attendees,
five rounds, four competition records, six scoped pools with £45 total minima,
and six accommodation units containing 12 rooms and 24 occupant entries. Sunday
has exactly 24 active individual betting choices. Pair pools remain empty until
confirmed pairs are published. Existing round and market IDs were retained.
Legacy unused choices were marked inactive after market conversion and audited;
no choices, placed bets or historical profiles were deleted.

The complete one-time configuration is retained privately. It refuses to
overwrite saved operations. Subsequent changes belong in the admin editors.

## Verified locally

- Complete portable migration chain executes in isolated Postgres.
- All 141 regression tests pass; TypeScript and the production build pass.
- 24 attending golfers, six independent pool minima: £45 per tourist, £1,080
  aggregate. Extra Friday stakes remain extra; they do not cover other pools.
- Partial £5 commitments in a £10 pool receive £5 on the bettor's own selection.
  Existing picks on other selections are retained. Fully funded pools add zero.
- Missing own pairs produce explicit exceptions, not arbitrary selections.
- Repeated and concurrent processing does not add commitments twice.
- Closing Friday and combined pools does not close the evening Par 3.
- Authoritative database clock rejects late discretionary bets.
- Combined hole records persist by session and stable pair identity. Own-ball
  better ball, zero-point completed holes, pickup, no score and unentered holes
  remain distinct. Nine-hole handicap inputs cannot be treated as 18-hole inputs.
- Combined countback uses Monday nine/last six/last three/final hole followed by
  the corresponding Friday comparisons, in actual playing order. Exact ties
  require a recorded decision. Betting decisions have their own scope.
- Monday ordering requires complete Friday cards, preserves pairs, and uses the
  highest Friday scores first. Friday corrections flag a published order without
  moving it or changing betting selection IDs.
- Finalisation awards exactly 39 points. Correction removes stale confirmed
  contributions; re-finalisation replaces them with 39, never 78.
- Six Saturday and twelve Sunday matches add exactly 18 points. A complete
  28.5–28.5 result is a draw, with exactly 48 player match-result rows; Stableford
  and Par 3 do not inflate matchplay statistics.
- Incomplete Stableford cards cannot settle pools. Correcting a settled combined
  winner replaces payouts while conserving the £120 pool.
- Optimistic versions reject stale admin writes. Room moves are saved atomically;
  duplicate occupants and capacity violations are rejected.
- Existing 16- and 24-player tour rehearsals, public/admin authentication and
  the previous mobile draft-preservation tests continue to pass.

The private PDF reference is generated with the real exported starting records
plus the confirmed configuration inside isolated Postgres. All four rendered
pages were inspected. The app's download route regenerates from actual saved
rounds, itinerary and rooms, behind the existing public access gate.

## Preserved historical fingerprint before deployment

| Records | Count | MD5 of ordered row snapshot |
| --- | ---: | --- |
| Historical/private QA matches outside 2026 | 108 | `4f4b2c3f4c11495eeba7f9af151fb067` |
| Player match results outside 2026 | 328 | `445d84abbb9f68cb44f4d1e6749c0d0d` |
| Tour-side results outside 2026 | 10 | `52075bb49982cdcafe4bfed00f5e87c4` |
| Existing placed bets | 72 | `8221fff7a3d8c9081a487726f1efbaa5` |

## Required confirmed inputs

No valid saved 2026 pairs or side memberships existed; the implementation does
not invent them. Individual handicaps, chosen tees, actual nine-hole playing
orders, Monday scramble settings, and the Par 3 card/hole count remain explicit
setup requirements. Saturday's later tee times remain unconfirmed. Monday keeps
the saved O'Connor Jnr course.

The installed private configuration reconciles exact supplied names and keeps
unresolved aliases as explicit checks without duplicate identities.
Previously saved travel/meal rows are retained as retired data pending
reconfirmation because the Friday arrival conflicted with confirmed 14:20 golf.
Existing cash-prize allocations are preserved, pending reconfirmation against the
new programme; they are not silently relabelled after round renumbering.

The user brief ended at “For iPhone and iPad, explain:”. Standard Apple/Android
installation guidance covers the supplied installation requirement; any omitted
continuation still needs to be supplied.

## Production verification

The production configuration was checked after activation. All four historical
fingerprints below remain identical to the pre-change baseline, including all
72 placed bets. The six existing/new pool IDs and cutoffs are correct; the four
previous market IDs were preserved. The scheduled job remains active and
independent successful runs are recorded every minute.

The application deployment and authenticated live UI checks follow the merge.
Required organiser inputs remain visible: confirmed golf pairs and sides,
handicaps, tees, nine-hole order, scramble settings, the Par 3 card, Saturday's
later tee times, and two unresolved room aliases. These must not be invented.

The repository is public. Automatic approval review rejected uploading real
roster/room data to it. The application PR therefore contains anonymous test
fixtures and generic code only. The supplied configuration and updated PDF are
retained privately, with no room occupant list committed to the public branch.

## Final verification checkpoint

GitHub Actions `verify` passed for PR head
`b131c1fafa2a50e18579352ddc3721120a738cb9`; Netlify's build, header and redirect
checks passed. A final local run also passed all 141 tests. The initial public
bundle is 376 kB before compression, with Admin loaded separately.

The served Apple touch icon returns HTTP 200 with image/png and has the expected
180x180 dimensions; the supplied standard and maskable icons have their declared
192/512 sizes. The current manifest returned HTTP 200 with an octet-stream MIME
type; this PR adds the proper manifest Content-Type header.

Authenticated live UI checks remain outstanding until application deployment
and a browser admin session are available. The live-only review requirement
is preserved. A secure browser sign-in request blocked an earlier run and was
cancelled; database activation subsequently completed through Supabase directly.
