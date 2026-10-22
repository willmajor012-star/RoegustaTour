# Confirmed 2026 tour implementation

Authoritative brief: 21 October 2026, amended by the organiser on 22 October.
The 22 October amendments below supersede the earlier scoring and combined-pool
deadline. Friday 6 to Monday 9 November, Europe/Lisbon.

## Confirmed amendments, 22 October

- GameBook handles hole scoring, course handicaps and allowances. Roegusta
  records final Stableford totals and separate matchplay outcomes for 2026.
  A blank total is unentered; zero is a saved completed result.
- Friday Faldo and Monday O'Connor Jnr use the front nine, holes 1–9, white tees.
- The separate scratch Par 3 is 18 holes with a 19:30 shotgun start, within
  the 19:30–21:30 booking. No tee selection is needed.
- Saturday's six starts are 10:00–10:50 at 10-minute intervals.
- The combined £5 pool remains open through the weekend and closes Monday
  9 November at 10:00 Portugal local time. The six minimums remain £45 each,
  £1,080 minimum across 24; Friday requires £15 and Monday £10.
- Organisers explicitly select and confirm the actual GameBook pool winner.
  Complete totals are required; a tied highest total may be selected without
  inventing a betting countback. Confirmation after cutoff settles the social
  ledger atomically. Corrections require confirmation again.
- Friday and Monday totals persist separately under stable pair identities.
  The team scoreboard adds hatched provisional combined points to the visible
  standing and retains a separate confirmed figure. Official points are awarded
  only after complete sessions, resolved ranks and finalisation.
- Tied tour positions needing hole detail require a recorded GameBook finishing
  order. The app does not fabricate last-six/last-three/final-hole comparisons.
- All 24 tour handicaps and corrected identities are retained in private live
  configuration. The erroneous extra golfer is excluded from attendance;
  permanent historical profiles remain intact.

Remaining organiser setup: main side lists, competition pairs, Saturday matchups,
Sunday opponents/groups and publication of the independent Par 3 draw. The app
provides the editors and publication checks. Unconfirmed travel or meals are
not invented.

The following describes the original implementation and inspection history.

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
