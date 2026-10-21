# Confirmed 2026 tour implementation

Authoritative brief: 21 October 2026. This supersedes earlier 2026 format and
daily betting descriptions. Friday 6 to Monday 9 November, Europe/Lisbon.

Implementation scope:

- Separate Stableford competition records, sessions, stable pair identities,
  playing groups, hole cards, session handicap settings, countback and awards.
- One Friday/Monday competition worth 39 points, six Saturday match points and
  twelve Sunday points. Separate scratch Par 3, zero main-tour points.
- Six pool-specific minimums totalling £45 per tourist. Atomic shortfall-only
  defaults with own-selection lookup, exceptions, audit and deployed scheduling.
- Authoritative attendance and configurable accommodation independent of golf.
- Plan itinerary and rooms, current downloadable PDF, installation guidance.
- Existing admin usability, public/admin gates and historical data preserved.

Initial live inspection: PR 63 merged into main f6e69ef; no open PR. Existing 2026
has no matches or side memberships, no playing handicaps, and no confirmed
competition pairs. Monday course is O'Connor Jnr. No 2026 bets are placed.
Faldo, O'Connor and Old Course guides have pars/stroke indexes. Confirmed tees, nine-hole playing orders and the Par 3 scorecard are missing. Two supplied names require new permanent identities. Two supplied aliases
remain explicit identity checks; no duplicate profiles are created.

Missing inputs are exposed in the application and must block scoring or
finalisation where required. They must not be replaced with invented settings.
