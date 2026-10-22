# GameBook results workflow verification

The 2026 tour uses imported final Stableford totals. Reusable hole-card scoring
remains available for other configurations. Friday and Monday are independent
saved totals under one pair identity. Zero remains a completed result; a blank
remains unentered. The app requires no internal handicap calculation or course
scorecard to accept these GameBook results.

The combined pool now closes Monday 9 November at 10:00 Europe/Lisbon, alongside
the standalone Monday pool. Friday afternoon processing leaves both pools open.
The per-pool minimums remain £5/£10/£10/£10/£5/£5, totalling £45 per person and
£1,080 minimum across 24. Extra stakes remain permitted in £5 increments.

The regression suite checks that saved Friday totals produce 39 provisional
points and no official award rows. The main scoreboard includes the projection
and labels it with hatching and text; confirmed and provisional contributions
cannot double count. During Monday entry, the last complete Friday projection
remains visible until complete Monday totals support a combined ranking.
Finalisation replaces projections with the 39 official points. A correction
invalidates stale official awards. Saturday and Sunday retain matchplay totals.

Every GameBook pool requires explicit winner confirmation, even with a unique
highest total. The selected result must be among the highest completed totals.
Confirmation after cutoff processes outstanding mandatory commitments and
calculates the existing social ledger payouts in the same database transaction.
Score corrections invalidate the winner basis and clear stale payouts until
reconfirmation. No wallet or payment processing is introduced.

Verification: 145 regression tests pass, including fresh Postgres migrations,
full-tour rehearsals, persisted GameBook totals, visible side projections,
automatic shortfalls, winner confirmation, settlement and corrections. TypeScript
and the production build pass. Actual 2026 scores and bets remain unmodified by
these rehearsals. Device installation remains a physical-device check; served
manifest/icon assets and the installation instructions are covered separately.

Authenticated live review confirmed the separate Friday/Monday totals forms,
explicit pool winner checkbox, front-nine settings, 18-hole Par 3 shotgun,
Saturday 10-minute tee slots, and six pool minimums/deadlines. Real pair inputs
remain unassigned as requested, so no invented live totals or bets were saved.
The private seven-page guide and the app-generated current PDF were rendered and
checked. Production shows 24 handicaps and room occupants; all four historical
match/result/bet fingerprints are unchanged. The independent cron job continues
to report successful minute executions.

The review also removed legacy daily-market builders and direct settlement
dropdowns from the 2026 pool workflow. Pool cards show active selections and link
to the GameBook confirmation form. The separate tour-ranking editor no longer
offers the obsolete betting tie-decision path for imported totals. Other tours
retain their existing controls.
