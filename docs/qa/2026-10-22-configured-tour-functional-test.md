# Configured 2026 tour functional test

The complete saved 2026 configuration was copied read-only into an ephemeral
PGlite database. All migrations were applied before loading that copy. Real
attendance, accommodation, programme and existing identities were retained;
temporary team lists, pairings, scores and betting entries existed only in the
isolated rehearsal. No test results or bets were added to production.

## Results

- Full regression suite: 150 passed, zero failures; production build passed.
- Configured-tour rehearsal: 34 scenarios passed through 85 endpoint requests
  plus the authoritative SQL operations.
- Friday: 39 provisional combined points; zero confirmed combined points;
  Monday not started. Partial Monday completion remained visible.
- Final main tour: 39 combined points plus six Saturday and 12 Sunday points.
  The rehearsed 28.5–28.5 finish was a draw, with no duplicated contributions.
- Six pools: £1,080 minimum commitments plus £15 extra stakes produced £1,095.
  All six settlements conserved the ledger. Editing, cancellation, partial
  commitments, automatic own-selection shortfalls, retries, independent Friday
  and combined settlement, and corrected winners were exercised.
- Missing pairs prevented arbitrary defaults. Incomplete results prevented
  finalisation and settlement. Completed zero totals survived reopening.
- Monday preserved the pair identities, used highest Friday scores first and
  required explicit republishing after relevant Friday corrections.
- Par 3 remained independent, with 18-hole totals, shotgun groups and zero tour
  points. Sunday selections and results remained individual.
- Early matchplay finishes did not prevent full Stableford totals. Only the
  Saturday and Sunday matches produced player match statistics.
- Room moves, flexible accommodation, capacity/duplicate checks and stale-admin
  save protection passed.

## Defects found and corrected

1. The current-tour statistics query combined completed matches with the
   current-tour query, so completed current matches appeared twice in the
   overview score. Deduplicating by stable match ID restores the 57-point
   overview. The authoritative database totals were already correct.
2. Public bet editing included retired options in its selection list. New and
   edited picks now offer current options while preserving old labels for
   existing history.
3. The admin market summary treated configured draft pools as already complete.
   These tour-scoped obligations now remain outstanding before opening, while
   historical draft-market rules remain unchanged.

All three defects have regression checks. The scoring check compares the public
overview against a fully completed 57-point database result.

## Repeat the private configuration rehearsal

Run from the repository root:

```
node scripts/qa/rehearse-configured-2026.mjs PRIVATE_SNAPSHOT.json PRIVATE_REPORT.json
```

The input contains a `snapshot` object keyed by business table name. It must
never include authentication settings, session tokens or payment details.
Neither the input nor output belongs in the public repository. The script has
no production connection and closes its isolated database after the run.

The PGlite request-overlap test uses its serialized query queue. PostgreSQL
advisory transaction locks provide the production concurrency protection; this
is not a multi-connection production load test.

## Remaining real-tour setup and verification limits

Full team lists, confirmed competition pairings, cash prize amounts and dinner
arrangements remain organiser input. Draft betting pools stay hidden until
explicitly opened. Device installation still needs a physical iPhone/Android
check; the web manifest, icons and installation guidance can be checked without
installing the app on a phone.
