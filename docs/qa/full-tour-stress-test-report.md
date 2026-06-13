# Roegusta Tour full end-to-end stress test and QA audit

Date: 2026-06-12  
Repository: `willmajor012-star/RoegustaTour`  
Scope: public React/Vite app, admin workflows, Netlify Functions, Supabase schema/migrations/seeds, and safe read-only load-test harness.

## 1. Executive summary

**Live-tour readiness: not ready without fixes.** The app has a solid foundation for public display, admin-created future tours, team membership, round setup, match setup, public stats, and Bet Punto logging. However, several core live-tour risks remain:

1. **Public data leaks draft/planned round information in multiple bundles.** `public-score`, `public-summary`, `public-tour-info`, `public-bet-markets`, and advanced stats can expose round rows before they are truly published.
2. **Bet Punto public endpoint returns all non-void markets, all options, and all active bet rows for those markets.** Closed/settled visibility is intentional, but admin-only planning metadata and bettor-level private comments/stakes are fully public.
3. **Bet Punto market deletion and bet deletion are unsafe for history.** Admin can delete markets and bets directly, while the rest of the code treats Bet Punto history as protected.
4. **Result entry is only partially implemented through the match editor.** It writes `matches` and `player_match_results`, but there is no dedicated result-entry UX, no `tour_team_results` generation/update, no audit trail, and no completed admin result function.
5. **Admin settlement endpoint is a placeholder.** Settlement works only via `admin-save-bet-market` status/result changes; `admin-settle-bet-market` returns a placeholder response.
6. **Public/user duplicate Bet Punto submissions are not prevented server-side.** The UI disables while submitting, but refresh/double-device/retry duplicates can be inserted.
7. **Tour completion/archival lifecycle is manual and under-guarded.** A future active/planned tour can become default and supersede historical/current public selection; no single-current constraint exists.
8. **Team/member and match safe-delete protections are stronger than before, but not transactional.** Multi-step admin writes can partially complete if a later operation fails.
9. **No true browser E2E test suite exists.** This audit is a code/schema/static/manual-flow review plus build checks and a lightweight read-only load harness; live Supabase writes were not executed.
10. **The repo builds and type-checks.** There is no lint or test script.

## 2. Commands run

| Command | Result | Notes |
| --- | --- | --- |
| `git diff --check` | Pass | No whitespace errors before changes. |
| `if [ ! -d node_modules ]; then npm install; else echo 'node_modules present; skipping npm install'; fi` | Pass | `node_modules` already present, so install was skipped. |
| `npm run build` | Pass | `tsc && vite build`; Vite output: `dist/assets/index-CReGl8vn.js` 328.98 kB / gzip 94.15 kB. npm warned: `Unknown env config "http-proxy"`. |
| `npx tsc --noEmit` | Pass | No type errors. npm warned: `Unknown env config "http-proxy"`. |
| `npm run lint` | Fail / unavailable | Missing script: `lint`. |
| `npm test` | Fail / unavailable | Missing script: `test`. |
| `npm run qa:public-load-smoke -- --dry-run` | Pass | Prints the planned read-only endpoint load profile without making requests. |

## 3. Environment assumptions

- No production writes were performed.
- No production data was deleted or modified.
- No Supabase local database was started in this task.
- No admin PIN/session was available for live write testing.
- The lifecycle and stress results below are based on code/schema review, static checks, and safe reasoning through the admin/public paths.
- The load harness is intentionally read-only and defaults to local Netlify dev (`http://localhost:8888`).

## 4. Front-end route coverage

Public navigation is defined as:

- `/` → Overview (`Dashboard`)
- `/matches` → Golf (`Matches`)
- `/tours` → Tours (`Tours`)
- `/stats` → Stats (`Stats`)
- `/betting` → Bet Punto (`Betting`)
- `/info` → Info (`TourInfo`)

Additional public routes exist:

- `/teams` → Teams (`Teams`), linked from page content rather than bottom navigation.
- `/players` → Players (`Players`), linked from page content rather than bottom navigation.
- `/score` → Score (`TourScore`), linked from overview/score content rather than bottom navigation.

Admin route:

- `/admin` → `Admin`, guarded by a PIN-created browser session and admin Netlify Function auth headers.

## 5. Admin workflow coverage

Admin tabs currently visible:

- Overview
- Tour setup
- Player library
- Squads & teams
- Rounds & tee times
- Matches & pairings
- Bet Punto
- Coming next

Admin API helpers and write functions covered:

- `fetchAdminData`
- `savePlayer`
- `saveTour`
- `deleteTour`
- `saveTourPlayer`
- `saveTourTeam`
- `deleteTeam`
- `saveTourTeamMembers`
- `saveRound`
- `deleteRound`
- `saveMatch`
- `deleteMatch`
- `saveBetMarket`
- `deleteBetMarket`
- `updateBet`
- `deleteBet`

Observed positives:

- Admin sessions are required for admin write/read functions.
- Admin session token is HMAC signed and expires.
- Admin write functions use the server-side Supabase secret, not browser Supabase credentials.
- Team deletion protects completed matches, participant rows, `player_match_results`, linked Bet Punto options, and `tour_team_results`.
- Round deletion protects complete/active rounds, completed matches, player results, non-void markets, bets, and any remaining matches.
- Match deletion protects complete matches, published matches, player results, non-void linked markets, and bets.
- Match save validates duplicate players, team membership, attendance, active players, match number uniqueness, match format max players, and complete-result point totals.
- Admin match form blocks the same player from being selected on both sides.
- `runSave` captures `window.scrollY` and restores it after reload, which directly targets the save-jumps-to-top issue.

Observed gaps:

- There is no route-level admin guard; the route renders admin UI and then gates actions by session.
- Admin writes do not insert audit log rows despite `audit_log` existing in schema.
- Multi-call admin flows are not transactional. Example: saving attendance then updating team membership loops through teams one function call at a time.
- Two-admin edit conflict behavior is not implemented beyond last-write-wins.
- The admin result function is a placeholder.
- Bet Punto delete functions allow hard deletion of markets and bets.

## 6. Full tour lifecycle findings

### What works or appears supported

- Create a new tour from admin with name, year, location, date range, status, and description.
- Select a tour in admin via `admin-data?tourId=...`.
- Edit tour details.
- Create up to 8 rounds from the admin planning helper, so both 3-round normal and 4-round exception flows are supported.
- Add/select players and mark attendance through `tour_players`.
- Create teams and assign players.
- Enforce one team membership per player at schema level with `unique (tour_id, player_id)` and in code by deleting duplicate membership before insert.
- Remove a non-attending player from team membership when attendance is set false.
- Preserve historical tours by using per-tour foreign keys and a unique tour year.
- Current/all-time stat separation is supported in advanced stats calculations using current tour ID versus all-time records.

### Broken/missing/risky

- No explicit **single current tour** field or constraint. Default tour selection sorts by status rank (`active`, `planned`, `complete`, `archived`) then year. If a future planned tour is created while the current live tour is complete/archived, public pages can switch to the future tour unexpectedly.
- Archiving/completing old tours is just editing `status`; there is no guided end-of-tour checklist, result lock, Bet Punto settlement lock, or protected historical freeze.
- Public Teams view pulls advanced stats and shows teams/members for the selected current/default tour. There is no publish flag for teams, so roster planning can become public as soon as the tour is default.
- Attendance/team assignment is clear enough for an operator, but it is clunky because saving one player may trigger several team-member saves.
- Inactive/absent player removals are handled for future team membership, but existing match participants are not automatically revalidated or removed if a player is later marked inactive/absent after matches exist.

## 7. Round/tee-time findings

### What works or appears supported

- Round formats accepted: `singles`, `better_ball`, `foursomes`, `scramble`, `custom`.
- Round statuses accepted: `draft`, `planned`, `active`, `complete`.
- Duplicate `tour_id + round_number` is blocked in code and schema.
- Round save accepts `teeTime` as free text, so `08:10`, `9:00`, `09:00`, `13:40`, and `TBC` can be stored.
- Safe-delete blocks active/complete/protected rounds.

### Broken/missing/risky

- There is no normalized tee-time type or sorting helper for mixed text/time values. Rounds sort by round number, while matches sort by match number; tee-time sort correctness is not guaranteed for `9:00` versus `09:00` unless the UI does not rely on lexicographic time ordering.
- Public score/summary/tour-info bundles return all rounds for the default tour, including draft/planned rows.
- Public Bet Punto bundle returns draft rounds if a market references that round, even if that market is a hidden/void planning market excluded later from visible markets in some flows.
- Draft/planned/active/complete semantics are inconsistent across public endpoints: matches are filtered by `published OR complete`, but rounds are mostly not filtered.
- Planning rounds auto-create hidden void Stableford markets, which is useful, but any later public bundle logic tied to market round IDs must be handled carefully.

## 8. Match-builder findings

### What works or appears supported

- Match formats include Better Ball, Scramble, Singles, Foursomes, and Custom.
- Singles maxes at one player per side; Better Ball/Scramble/Foursomes max at two per side; Custom allows more.
- Duplicate `round_id + match_number` is blocked before insert and converted from database duplicate errors to a friendly message.
- New match form calculates next available match number.
- Existing match edits carry `id`, so update path is used rather than insert path.
- Same player on both sides is blocked in UI and backend.
- Backend validates each player is active, attending, and assigned to the correct side team.
- Complete matches require points for both sides and require point totals to add to `points_available`.
- Complete matches generate `player_match_results` rows.
- Draft/unpublished matches are not returned from the main public match bundle unless complete or published.
- Deleting draft unpublished matches is supported when no protected result/bet data exists.

### Broken/missing/risky

- Match status can be set complete directly from the generic match editor. This is powerful but risky without a dedicated result entry workflow.
- Match edits are not transactional with participant/result replacement. The function updates/inserts the match, deletes participants, inserts participants, deletes stale results, then inserts result rows. A failure mid-flow could leave an inconsistent match.
- Complete-match result generation does not update `tour_team_results`; team score display is currently calculated from matches, not persisted tour result rows.
- Changing team assignment after match creation is validated against player team membership, but existing match participants are not automatically reconciled when team membership changes elsewhere.
- Public sorting is by `match_number`; tee-time edge cases (`9:00` versus `09:00`) are not tested by code.
- Publishing/unpublishing is a boolean on the match editor; there is no separate publish workflow or confirmation for leaking pairings.

## 9. Result-entry findings

**Result entry is not fully ready. It is partial.**

What exists:

- Match editor has fields for `status`, `pointsSideA`, `pointsSideB`, `resultText`, and `published`.
- `admin-save-match` writes `matches.points_side_a`, `matches.points_side_b`, `matches.winning_side`, `matches.result_text`, and `matches.status`.
- `admin-save-match` deletes stale `player_match_results` and regenerates them when `status === 'complete'`.
- Public score and stats can derive score/stat rows from complete matches and `player_match_results`.

What is missing:

- `admin-submit-result.ts` is a placeholder and does not save results.
- There is no dedicated result-entry admin UX for common result texts (`1UP`, `2&1`, `3&2`, `4&3`, `AS`) with validation against format/points.
- `tour_team_results` is not updated/generated when match results are entered or corrected.
- No audit log is written for result entry/correction.
- No end-of-round or end-of-tour recalculation/check command exists.
- There is no lock/confirmation around changing a complete match back to non-complete, which removes `player_match_results`.
- No explicit head-to-head generation table exists; H2H is calculated from available match/player result data.

Tables written by current result path:

- `matches`
- `match_participants`
- `player_match_results`

Tables not written by current result path but required/expected for full lifecycle:

- `tour_team_results`
- `audit_log`

Next feature PR must build:

1. Dedicated `admin-submit-result` implementation.
2. Result-entry UI separated from pairing creation.
3. Transaction/RPC for updating match result, participants if needed, player results, team result aggregates, and audit log.
4. Recalculation/verification SQL for team scores and player stats.

## 10. Bet Punto findings

### What works or appears supported

Admin can create/edit markets with:

- Market types: match winner, player performance, team result, over/under, special, custom.
- Scopes: `general_pot`, `special`.
- Statuses: open, closed, settled, void.
- Links to tour, round, match, player, team, and match side through market/option columns.
- 2 options, 4 options, or 30 player options.
- Decimal odds on options.
- Blank odds where allowed.
- Close time.
- Result option and result text.
- Option removal is blocked if bets exist.
- Settlement through `admin-save-bet-market` updates bet outcome and payout fields.
- Void market through `admin-save-bet-market` voids active bets.
- Public submission blocks non-open or past-close markets.
- UI wording repeatedly states no wallet/payment/money transfer.

### Broken/missing/risky

- `admin-settle-bet-market` is a placeholder; the actual settlement path is hidden inside `admin-save-bet-market`.
- `admin-delete-bet-market` hard-deletes markets and cascades options/bets via schema. That conflicts with Bet Punto history protection.
- `admin-delete-bet` hard-deletes bets. There is a safer `updateBet` path to void, but delete remains exposed in admin UI.
- Public `public-bet-markets` returns all non-void markets and all bets for them. It is not limited to open/public-safe fields.
- Public `public-bet-markets` includes closed and settled market bets, including bettor names, comments, stake amounts, outcomes, payout status, and payout notes if mapped.
- Duplicate/conflicting bets are not prevented server-side. A player/device can submit repeatedly to the same market/option or multiple options in the same market.
- Device ID uses `x-nf-client-connection-ip`, which is not a reliable per-device ID and may be absent/shared.
- `market_scope` migration exists twice (`0004` and `0005`), and `admin-save-bet-market` catches a Supabase schema-cache error for a clearer admin message. This is good, but live schema drift can still make public market reads fail unless migrations are applied.

## 11. 30-user/load/concurrency findings

A read-only load harness was added at `scripts/qa/public-load-smoke.mjs` and exposed as `npm run qa:public-load-smoke`. The harness validates numeric inputs and base URL configuration before sending requests.

Suggested safe runs:

```bash
npm run qa:public-load-smoke -- --base-url http://localhost:8888 --concurrency 5 --requests 30
npm run qa:public-load-smoke -- --base-url http://localhost:8888 --concurrency 15 --requests 60
npm run qa:public-load-smoke -- --base-url http://localhost:8888 --concurrency 30 --requests 60
```

Covered endpoints:

- `/.netlify/functions/public-summary`
- `/.netlify/functions/public-score`
- `/.netlify/functions/public-matches`
- `/.netlify/functions/public-bet-markets`
- `/.netlify/functions/public-advanced-stats`
- `/.netlify/functions/public-tour-info`

Expected 30-user behavior from code review:

- Concurrent reads should probably be acceptable for 30 private users because payloads are modest and functions are read-only.
- `public-advanced-stats` is the heaviest endpoint because it loads all tours, teams, tour players, team members, rounds, complete matches, public current matches, participants, and player match results.
- Public polling exists in Bet Punto every 10 seconds; other public pages depend on `usePublicData` defaults.
- Double-submitted Bet Punto picks are the highest concurrency/race risk because the server has no uniqueness/idempotency key.
- Public stale data is possible until polling/refresh; there is no push/realtime invalidation.
- Poor/offline connection handling is basic: errors render friendly messages, but no PWA/offline cache behavior was found in this audit.

## 12. Data integrity findings

Recommended SQL verification queries before and after any future-tour dry run:

```sql
-- Tours: no duplicate current/default candidates by year/status review.
select status, count(*) from tours group by status order by status;
select year, count(*) from tours group by year having count(*) > 1;

-- Players: duplicate display names after normalisation.
select lower(trim(display_name)) as normalized_name, count(*)
from players
group by lower(trim(display_name))
having count(*) > 1;

-- Attendance/team assignment: absent players assigned to teams.
select ttm.*
from tour_team_members ttm
left join tour_players tp on tp.tour_id = ttm.tour_id and tp.player_id = ttm.player_id
where coalesce(tp.attending, false) = false;

-- Teams: each attending player assigned to max one team per tour.
select tour_id, player_id, count(*)
from tour_team_members
group by tour_id, player_id
having count(*) > 1;

-- Team member counts.
select tt.tour_id, tt.name, count(ttm.player_id) as member_count
from tour_teams tt
left join tour_team_members ttm on ttm.team_id = tt.id
group by tt.tour_id, tt.name
order by tt.tour_id, tt.name;

-- Rounds: no duplicate round numbers per tour.
select tour_id, round_number, count(*)
from rounds
group by tour_id, round_number
having count(*) > 1;

-- Public leak candidates: draft rounds on active/planned default tours.
select t.year, t.status as tour_status, r.round_number, r.name, r.status as round_status
from rounds r
join tours t on t.id = r.tour_id
where r.status = 'draft'
order by t.year desc, r.round_number;

-- Matches: no duplicate round_id + match_number.
select round_id, match_number, count(*)
from matches
group by round_id, match_number
having count(*) > 1;

-- Matches: no player on both sides.
select match_id, player_id, count(distinct side)
from match_participants
group by match_id, player_id
having count(distinct side) > 1;

-- Complete matches missing result data.
select * from matches
where status = 'complete'
  and (points_side_a is null or points_side_b is null or winning_side is null or result_text is null);

-- Player result uniqueness.
select match_id, player_id, count(*)
from player_match_results
group by match_id, player_id
having count(*) > 1;

-- Team scores from completed matches.
select tour_id, side_team_id, sum(points) as points
from (
  select tour_id, side_a_team_id as side_team_id, coalesce(points_side_a, 0) as points from matches where status = 'complete'
  union all
  select tour_id, side_b_team_id as side_team_id, coalesce(points_side_b, 0) as points from matches where status = 'complete'
) scores
group by tour_id, side_team_id;

-- Bet Punto: invalid market statuses/types/scopes.
select * from bet_markets
where market_type not in ('match_winner', 'player_performance', 'team_result', 'over_under', 'special', 'custom')
   or status not in ('open', 'closed', 'settled', 'void')
   or market_scope not in ('general_pot', 'special');

-- Bet Punto: options without a market.
select bo.* from bet_options bo left join bet_markets bm on bm.id = bo.market_id where bm.id is null;

-- Bet Punto: bets without valid options.
select b.* from bets b left join bet_options bo on bo.id = b.option_id where bo.id is null;

-- Bet Punto: settled markets without result option.
select * from bet_markets where status = 'settled' and result_option_id is null;
```

## 13. Security/privacy findings

Positives:

- Admin PIN is compared as SHA-256 hash in constant time.
- Admin sessions are signed with HMAC and expire after 12 hours.
- Admin write functions require bearer admin session.
- Supabase service/secret key is imported only in Netlify Function server helpers, not in browser code.
- Public functions use curated mappers rather than returning raw Supabase rows.

Risks:

- Public functions still use the server-side secret key, so application-level filtering is the only privacy boundary. Any filtering bug leaks data.
- Public endpoints leak some draft/planning data because several bundles return all rounds or all current tour roster/team data.
- Public Bet Punto bundle exposes individual stake ledger rows to everyone. That may be acceptable for a private group, but it should be a deliberate privacy decision.
- Admin hard-delete of Bet Punto markets/bets conflicts with historical integrity.
- No audit log is written even though schema includes `audit_log`.
- No rate limiting or idempotency exists for public bet submission.
- No CSRF-style boundary is needed for bearer admin functions if tokens stay in localStorage, but localStorage tokens can be stolen by XSS. Avoid adding any dynamic HTML injection.

## 14. Issues found

### QA-001 — Public round bundles leak draft/planned round data

- Severity: P1
- Area: Public / Golf / Tours / Netlify
- Reproduction steps:
  1. Create a future/current tour.
  2. Add draft rounds with dates/tee times.
  3. Keep matches unpublished.
  4. Open Overview, Score, Info, Tours/Stats-linked pages, and Bet Punto.
- Expected behavior: draft planning details remain admin-only until explicitly published.
- Actual behavior: multiple public bundles return all rounds for the current/default tour, regardless of round status.
- Likely cause: `getScoreBundle`, `getSummaryBundle`, `getTourInfoBundle`, and advanced stats query all rounds without a public filter.
- Suggested fix: Add a shared `isPublicRound` policy or `published` field for rounds; filter all public bundles consistently.
- Files/functions likely affected: `netlify/functions/_publicData.ts`, `src/pages/TourInfo.tsx`, `src/pages/TourScore.tsx`, `src/pages/Dashboard.tsx`, `src/pages/Stats.tsx`.
- Blocks tour readiness: Yes.

### QA-002 — Team rosters publish immediately when a tour becomes default

- Severity: P1
- Area: Public / Admin / Tours
- Reproduction steps:
  1. Create future planned tour.
  2. Add teams and test roster assignments.
  3. Ensure the future tour is selected as default by status/year.
  4. Open Teams page.
- Expected behavior: draft squad planning remains private until explicitly published.
- Actual behavior: Teams page renders current/default tour teams and members without a publish flag.
- Likely cause: no `tour_teams.published` or tour-level roster-public flag.
- Suggested fix: Add explicit roster publication state, or filter Teams page until tour/team publication.
- Files/functions likely affected: `src/pages/Teams.tsx`, `netlify/functions/_publicData.ts`, `supabase/schema.sql`.
- Blocks tour readiness: Yes for private planning.

### QA-003 — Bet Punto hard-delete can destroy betting history

- Severity: P1
- Area: Admin / Bet Punto / Supabase
- Reproduction steps:
  1. Create an open market.
  2. Place one or more public bets.
  3. In admin, click Delete market.
- Expected behavior: market delete is blocked once bets/options/history exist; admin should close/void instead.
- Actual behavior: `admin-delete-bet-market` deletes the market; schema cascades options and bets.
- Likely cause: delete function checks only existence and tour ID.
- Suggested fix: Block delete if any options/bets exist; allow only void/close for live history. Consider soft-delete field.
- Files/functions likely affected: `netlify/functions/admin-delete-bet-market.ts`, `src/pages/Admin.tsx`, `supabase/schema.sql`.
- Blocks tour readiness: Yes if Bet Punto is used.

### QA-004 — Admin can hard-delete individual bets

- Severity: P1
- Area: Admin / Bet Punto
- Reproduction steps:
  1. Place a public bet.
  2. Select its market in admin.
  3. Click Delete on the bet row.
- Expected behavior: bet history is protected; admin can void/correct with audit trail.
- Actual behavior: `admin-delete-bet` deletes the row.
- Likely cause: delete helper/function exposed in admin UI.
- Suggested fix: Remove hard-delete from UI; change function to block active/historical bets or require dev-only/test-only environment. Use `updateBet` to void.
- Files/functions likely affected: `netlify/functions/admin-delete-bet.ts`, `src/pages/Admin.tsx`.
- Blocks tour readiness: Yes if Bet Punto is used.

### QA-005 — Result entry is incomplete and not production-grade

- Severity: P1
- Area: Admin / Stats / Golf
- Reproduction steps:
  1. Create and publish matches.
  2. Attempt to enter results using a dedicated result-entry workflow/function.
  3. Check `tour_team_results`, audit log, leaderboard, team totals, and correction flow.
- Expected behavior: a dedicated result workflow updates match, player results, team result aggregate/history, public display, stats, and audit log atomically.
- Actual behavior: only generic match save can mark complete and generate `player_match_results`; `admin-submit-result` is placeholder; `tour_team_results` is not written.
- Likely cause: result-entry feature not completed.
- Suggested fix: Build `admin-submit-result` as a transaction/RPC-backed function and add a dedicated admin result-entry tab/section.
- Files/functions likely affected: `netlify/functions/admin-submit-result.ts`, `netlify/functions/admin-save-match.ts`, `src/pages/Admin.tsx`, `supabase/schema.sql`.
- Blocks tour readiness: Yes for live scoring/stat correctness.

### QA-006 — Bet Punto settlement endpoint is placeholder

- Severity: P2
- Area: Admin / Bet Punto / Netlify
- Reproduction steps:
  1. Call `/.netlify/functions/admin-settle-bet-market` with valid admin auth.
- Expected behavior: settle market and bets, or return method-specific validation.
- Actual behavior: placeholder `202` response.
- Likely cause: settlement logic was added inside `admin-save-bet-market`, not the dedicated function.
- Suggested fix: Implement or remove the placeholder endpoint; route admin UI to a dedicated settlement action.
- Files/functions likely affected: `netlify/functions/admin-settle-bet-market.ts`, `netlify/functions/admin-save-bet-market.ts`.
- Blocks tour readiness: No if admin uses save-market workaround; risky operationally.

### QA-007 — Duplicate/conflicting Bet Punto submissions are allowed server-side

- Severity: P2
- Area: Public / Bet Punto / Supabase
- Reproduction steps:
  1. Open one market as a user.
  2. Submit a pick.
  3. Refresh or use another browser/device and submit another pick for same bettor/market, possibly a different option.
- Expected behavior: app should either enforce one active pick per bettor/device/market or explicitly support multiples with conflict wording.
- Actual behavior: function inserts every valid submission; no uniqueness or idempotency key.
- Likely cause: no database unique constraint or server-side duplicate check.
- Suggested fix: Add `bettor_id`/player linkage or normalized bettor name + market uniqueness policy; add idempotency key and clear multiple-pick rules.
- Files/functions likely affected: `netlify/functions/public-save-bet.ts`, `supabase/schema.sql`, `src/components/BetMarketCard.tsx`.
- Blocks tour readiness: Not for read-only app; yes for clean Bet Punto ledger.

### QA-008 — Public Bet Punto payload exposes full visible ledger

- Severity: P2
- Area: Public / Bet Punto / Privacy
- Reproduction steps:
  1. Place bets with comments and stakes.
  2. Fetch `/.netlify/functions/public-bet-markets`.
- Expected behavior: only intentionally public fields are returned; admin-only payout notes/statuses are withheld.
- Actual behavior: public bundle includes bet rows for visible markets.
- Likely cause: `getBettingBundle` returns mapped `bets` wholesale for visible markets.
- Suggested fix: Create a public bet mapper with only bettor display, option, stake if desired, outcome if settled, and no admin notes/internal statuses unless intentionally public.
- Files/functions likely affected: `netlify/functions/_publicData.ts`, `netlify/functions/_mappers.ts`, `src/pages/Betting.tsx`.
- Blocks tour readiness: Depends on privacy expectations; risky.

### QA-009 — No explicit single-current-tour guard

- Severity: P2
- Area: Tours / Public / Admin
- Reproduction steps:
  1. Leave 2025 complete/archived.
  2. Create 2026 planned tour.
  3. Open public pages.
- Expected behavior: admin intentionally controls which tour is public/current.
- Actual behavior: default selection chooses active first, then planned, then complete, then archived; future planned tour may become public default.
- Likely cause: status/year sorting substitutes for a current/public selector.
- Suggested fix: Add explicit `is_current` or `public_status` and enforce one current public tour.
- Files/functions likely affected: `netlify/functions/_tourResolution.ts`, `supabase/schema.sql`, `src/pages/Admin.tsx`.
- Blocks tour readiness: Yes for safe future planning.

### QA-010 — Multi-step admin writes are not transactional

- Severity: P2
- Area: Admin / Supabase
- Reproduction steps:
  1. Save a match with participants/results, or save attendance/team updates.
  2. Simulate failure after the first write and before later writes.
- Expected behavior: all related changes commit or roll back together.
- Actual behavior: code performs multiple independent Supabase operations.
- Likely cause: no RPC/transaction wrapper.
- Suggested fix: Use Supabase RPC/Postgres functions for result save, match save, team assignment save, and Bet Punto settlement.
- Files/functions likely affected: `netlify/functions/admin-save-match.ts`, `netlify/functions/admin-save-tour-player.ts`, `netlify/functions/admin-save-team-members.ts`, `netlify/functions/admin-save-bet-market.ts`.
- Blocks tour readiness: Risky; highest for result entry and settlement.

### QA-011 — Public advanced stats can expose current-tour draft context

- Severity: P2
- Area: Public / Stats / Teams
- Reproduction steps:
  1. Create future/default tour with draft rounds/teams/team members.
  2. Fetch advanced stats or open Stats/Teams.
- Expected behavior: public stats expose only historical complete or intentionally public current context.
- Actual behavior: advanced stats bundle returns all tours, teams, tour players, team members, team results, and rounds; matches are filtered to complete plus current public.
- Likely cause: broad public data bundle used by multiple pages.
- Suggested fix: Split admin-like advanced data from public-safe advanced stats; filter draft/current planning rows.
- Files/functions likely affected: `netlify/functions/_publicData.ts`, `netlify/functions/public-advanced-stats.ts`, `src/pages/Stats.tsx`, `src/pages/Teams.tsx`.
- Blocks tour readiness: Yes for private planning.

### QA-012 — Tee-time sorting is not normalized/tested

- Severity: P3
- Area: Golf / Admin / Public
- Reproduction steps:
  1. Create matches with tee times `08:10`, `9:00`, `09:00`, `13:40`, `TBC`.
  2. Compare admin/public order wherever tee times are displayed.
- Expected behavior: times sort chronologically with TBC last/clear.
- Actual behavior: match queries order by match number, not normalized tee time; no tee-time comparator exists.
- Likely cause: tee time stored as free text.
- Suggested fix: Add display-only tee-time parser/comparator or normalized tee time fields.
- Files/functions likely affected: `netlify/functions/_publicData.ts`, `src/pages/Matches.tsx`, `src/pages/Admin.tsx`.
- Blocks tour readiness: No, if match numbers encode tee order.

### QA-013 — Admin save scroll restoration exists but remains fragile

- Severity: P3
- Area: Admin UX
- Reproduction steps:
  1. Scroll deep in admin.
  2. Save a player/team/match.
  3. Observe page position during reload and state reset.
- Expected behavior: active section remains stable.
- Actual behavior: code captures/restores scrollY after data reload, but form rerenders can still feel jumpy.
- Likely cause: full data reload and form reset on every save.
- Suggested fix: Keep restoration; consider section anchors, optimistic row update, and avoiding unrelated form resets.
- Files/functions likely affected: `src/pages/Admin.tsx`.
- Blocks tour readiness: No.

### QA-014 — Admin audit log is not written

- Severity: P2
- Area: Admin / Security / Supabase
- Reproduction steps:
  1. Perform admin writes.
  2. Query `audit_log`.
- Expected behavior: sensitive changes (results, bets, deletes) are audited.
- Actual behavior: helper TODO says audit log is not inserted.
- Likely cause: audit integration not implemented.
- Suggested fix: Write audit rows in every admin mutation or via database triggers/RPC.
- Files/functions likely affected: `netlify/functions/_adminSupabase.ts`, all admin write functions, `supabase/schema.sql`.
- Blocks tour readiness: Not strictly, but important for disputes.

### QA-015 — Lint and test scripts are missing

- Severity: P3
- Area: QA / Tooling
- Reproduction steps:
  1. Run `npm run lint`.
  2. Run `npm test`.
- Expected behavior: repo has at least lint/type/build/test commands.
- Actual behavior: scripts are missing.
- Likely cause: tooling not added yet.
- Suggested fix: Add ESLint and a small test suite for public bundle filters, admin validation helpers, scoring, betting payouts.
- Files/functions likely affected: `package.json`, future test files.
- Blocks tour readiness: No, but increases regression risk.

## Recommended next PR sequence

1. **Public visibility/privacy boundary PR:** add round/team/public filters and default-tour explicit current selector.
2. **Result entry PR:** implement dedicated result workflow, transaction/RPC, team result aggregate/history, audit log.
3. **Bet Punto safety PR:** block hard deletes, add duplicate/idempotency rules, public-safe bet mapper, implement settlement endpoint.
4. **Admin operator UX PR:** improve team/match builder ergonomics without redesign, keep selected round/section stable.
5. **QA automation PR:** add lint/test scripts, unit tests for scoring/betting/filter rules, and optional Playwright smoke tests.
6. **Load and live rehearsal PR/runbook:** run read-only load script against Netlify preview and a full write rehearsal against a disposable Supabase project.

## Remediation Status — public visibility/current tour PR

- **QA-001 fixed/materially reduced in this PR:** public tour resolution now uses an explicit `tours.is_current_public` flag and public round filtering requires `rounds.published` for current-tour round visibility.
- **QA-002 fixed/materially reduced in this PR:** team/roster publication now uses `tour_teams.published`, and public team-member data is filtered to published teams only.
- **QA-009 fixed in this PR:** the schema adds a partial unique index that permits only one `is_current_public = true` tour, with admin controls to set that tour deliberately.
- **QA-011 fixed/materially reduced in this PR:** advanced stats now filters tours, rounds, teams, rosters, matches, and results through shared public-safe helpers so draft/current planning context is not broadly returned.
- **Bet Punto scope:** this PR only filters public-safe Bet Punto round/match/team context where implemented; settlement, duplicate submissions, hard deletes, public ledger privacy, broader admin operator UX, audit logging implementation, and automated test coverage remain deferred for later PRs.
