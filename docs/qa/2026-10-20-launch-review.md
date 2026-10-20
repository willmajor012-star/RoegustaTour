# Roegusta Tour: Friday launch review

Review date: 20 October 2026. Target public launch: Friday 23 October 2026.
Source reviewed: main at `c74f3fbdc7197d48e636f8f0bb952e87a558992f`, followed by the fixes on this branch.

**Status: fixes prepared, production launch not yet verified.** No live database, production deployment or tour content was changed during this review. Tomorrow's venues, formats, teams and timings remain to be supplied by Will.

## Findings and changes

| Priority | Finding | Resolution |
| --- | --- | --- |
| Launch blocker | Initial requests invalidated by React StrictMode could remain marked in flight, leaving pages loading until another refresh. | Reset invalidated requests when effects are replaced. Executed a React mount test under StrictMode. |
| Launch blocker | App SQL did not enable row-level security. Server-side checks could be bypassed if browser database roles retained table grants. | New migration enables RLS on all 21 application tables and removes direct browser-role grants. Standalone schema also enables protection. Actual deployed policy state still needs inspection. |
| Launch blocker | Existing security-definer RPCs revoked PUBLIC execution, but did not revoke direct grants to anon and authenticated, which Supabase default privileges can create. | Explicitly revoke browser-role execution on all ten application RPCs and retain service-role access. Tested with Supabase-style default grants. |
| Launch blocker | Stored team aggregates included private result drafts and could announce an active-tour winner in public stats. | Public stats derive current scores from published matches. Stored final records are exposed only for completed or archived tours whose completed results are all visible. |
| Launch blocker | A selected winner could be saved with AS, or a winning margin with halved points. Unsupported point splits also passed validation. | Consistency checks in the endpoint, live desk and database. Database also rejects results without participants on both sides. |
| Reliability | Different matches saved concurrently could produce inconsistent team aggregate totals. | Serialize result transactions by tour before recalculating aggregates. |
| Reliability | Team membership replacement used separate delete and insert requests. A failure after deletion could lose the roster. | Atomic roster RPC, with rollback tested using a simulated insert failure. Moving paired players now requires updating affected pairings first. |
| Reliability | Simultaneous first-tee requests could process the same daily shortfall from stale reads. | Atomic defaults RPC with a tour lock. Same-day markets share the £10 minimum. Repeated processing is idempotent. |
| Reliability | Public edits could pass an early cutoff check, then write after a market closed or settled. | Atomic public bet RPC shares the defaults lock and checks the current cutoff, publication and edit-token hash inside the transaction. |
| Usability | Expired public access left users looking at failing pages. Manual refresh could reuse stale requests. | Return to the password gate on expiry and invalidate both response and request caches. |
| Usability | Failed bet changes could be silent or produce unhandled rejections. | Display edit and cancellation errors, disable changes while saving, and retain failed new picks for retry. |
| Setup | Invalid calendar dates and clock times could reach round and itinerary saves or silently normalize to the wrong cutoff. | Validate real dates and tee times. Reject nonexistent local DST clock times. Retain support for blank and TBC tee times. |
| Usability | Course guide selections reset when refreshed course objects arrived. | Reset tee and hole choices only when the course identity changes. |
| Deployment | The public cookie signing secret was missing from `.env.example`. Runtime version was implicit. | Add the required secret, pin Node 22 and add pull-request test and build checks. Authenticated function responses explicitly disable caching. |

## Verification

The regression suite includes the existing checks plus executable React, API-bundle and Postgres tests. The database rehearsal uses PGlite, an embedded Postgres build. It executes every migration in filename order, then reruns the launch migration to check repeatability. It supplies a minimal `storage.buckets` table and roles to represent Supabase platform objects. PGlite already provides `gen_random_uuid`, so the rehearsal omits `CREATE EXTENSION pgcrypto`; other migration SQL is executed.

Verified flows include:

* Initial public data load with React StrictMode and stale-response invalidation.
* Password gate expiry, and ten public routes rendered with populated and empty fixtures.
* Private results excluded from public statistics and winner announcements.
* Winter and summer Portugal tee cutoffs, invalid dates and nonexistent DST times.
* Table RLS, browser-role table privileges and RPC execution privileges.
* Result entry, repeat submission, correction, clearing and aggregate recalculation.
* Rejection of invalid or contradictory results and one-sided pairings.
* Atomic roster rollback and protection of existing pairings.
* £5 already staked being topped up to £10, rather than adding another £10.
* One daily minimum across two rounds, repeated defaults, post-close edit rejection, private edit-token checks, settlement and settlement correction with the full pot preserved.

These are local and isolated checks. They do not establish that the production database has the same migrations, that Netlify has the required secrets, or that every real phone layout is correct. Browser installation failed in this environment, so route checks use a DOM environment rather than a rendered browser. No production load test was run. The existing betting GET endpoint performs automatic defaults, so a load rehearsal should use a disposable project or deliberately controlled data.

## Deployment order

1. Connect the intended Supabase project and identify the Netlify site, linked repository and deployment branch.
2. Inspect existing migrations and platform configuration. Back up the database before applying changes.
3. Apply any missing earlier migrations in order, then `202610200001_friday_launch_hardening.sql`. This migration adds functions and security controls without rewriting tour content. Confirm the service role can still read and write while browser roles cannot directly access tables or mutation RPCs.
4. Confirm Netlify's server-side variables: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `ADMIN_PIN_HASH`, `ADMIN_SESSION_SECRET` and `TOUR_PUBLIC_ACCESS_SECRET`.
5. Deploy this branch to a preview using the same intended configuration. The new function code depends on the new migration and must not go live first.
6. Rehearse a disposable tour through setup, publication, result entry, correction, betting cutoff, winner entry and settlement. Verify public and private views from separate sessions.
7. Merge and deploy after the preview and rehearsal pass. Smoke-test the actual production URL, including direct links, password access, refresh and mobile navigation.

## Wednesday to Friday

| Date | Work |
| --- | --- |
| Wednesday 21 October | Load Will's confirmed data. Reconcile tour dates and timezone, venue links, round format and hole count, squads, teams, pairings, first tees, itinerary and required markets. Keep unconfirmed content private. |
| Thursday 22 October | Complete the live preview rehearsal and mobile visual checks. Confirm publication across Home, Golf, Teams, Courses, Itinerary, Stats and Bet Punto. Resolve anything found and recheck affected flows. |
| Friday 23 October | Confirm production deployment, password access, expected public tour and content. Run final user-journey checks before sharing with all users. |

## Remaining constraints and follow-up

* GitHub access is confirmed. Supabase and Netlify account access has not been verified in this session, so production readiness remains blocked on those connections and the live rehearsal.
* Publishing a round from the live desk saves individual results sequentially. Each result is transactional, but a whole round is not one transaction. A network failure can leave a partially published update. The UI reports the failure and the operator should refresh, check saved state and retry.
* Bulk setup operations still comprise multiple independently saved entities. Attendance and player-profile edits are not part of the new roster RPC. Reconcile attendance and teams before creating pairings and verify the final roster afterwards.
* Public betting deliberately uses a shared tour password and player selection, rather than verified individual accounts. Anyone with the password can create a new pick under a selected player's name. Private tokens protect edits to existing picks. Individual account authentication would be a separate product decision.
* Additional bets are intentionally allowed. A lost success response followed by a fresh resubmission can create a second pick. Check the ledger before retrying a submission whose outcome is uncertain; request idempotency can be added if that becomes a practical issue.
* PIN/password brute-force controls, actual traffic capacity, production schema drift and deployed Netlify function bundling require platform verification. The local build does not bundle or invoke deployed Netlify functions.
