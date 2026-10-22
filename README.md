# Roegusta Tour

A mobile-first private golf tour hub for the Roegusta Tour: Ryder Cup-style scoring, match planning, tour-scoped itineraries and courses, calculated player stats, player profiles and Bet Punto tour accounting.

## Stack

- React + Vite + TypeScript
- Simple global CSS in `src/styles/globals.css`
- Netlify deployment and Netlify Functions
- Supabase Postgres backend
- PIN-protected Admin operations through Netlify Functions

## Local setup

```bash
npm install
npm run dev
npm run build
```

## Folder structure

- `src/app` — app shell, route list and navigation model
- `src/components` — reusable cards, scoreboard, leaderboards and navigation
- `src/data/mockData.ts` — development fixtures and offline UI fallbacks
- `src/lib` — TypeScript entities, scoring, stats, betting and formatting helpers
- `src/pages` — public pages and the task-based Admin workspace
- `netlify/functions` — authenticated public reads and Admin writes
- `supabase/schema.sql` and `supabase/migrations` — Postgres schema and production-safe migrations

## Data approach

Supabase stores permanent players, tour editions, tour-specific rosters, teams, courses, itinerary items, rounds, matches, participants, Bet Punto markets/options/bets and historic imported summaries. Public reads expose only published current-tour records; completed and archived tours remain readable as historical snapshots.

## Data model

Players are permanent. Team membership is never permanent: players join teams through `TourTeamMember` records within a specific tour. Matches support singles, better ball, scramble and custom formats, and each side can have any number of participants.

## Scoring model

Admin enters a single match result. A transaction-safe database operation updates:

- team score by tour
- player match results
- current-tour leaderboard
- all-time leaderboard
- format-specific leaderboards

Team score adds `pointsSideA` and `pointsSideB` to the relevant tour teams. Player points are calculated as wins plus half a point for draws.

## Historic import approach

Historic rows use `HistoricalPlayerStats` for previous years where only aggregate data exists. All-time stats combine calculated match-based records with those imported summaries.

## Bet Punto model

Bet Punto is a social tour log, not a bookmaker. There are no accounts, wallets, transfers or in-app payment handling. Attending players place £5-increment stakes. Existing tours retain their saved daily rules. The confirmed 2026 edition has six independent minimum commitments totalling £45 per tourist, with server-side shortfall defaults at each pool’s cutoff. Markets close at their round’s fixed first tee in the tour timezone; any daily shortfall defaults to the player or their own scramble team. Winner entry settles the linked pool and the tour ledger shows staked, payout and net position.

## Netlify deployment

`netlify.toml` builds with `npm run build`, publishes `dist`, and serves functions from `netlify/functions`. The SPA redirect sends all browser routes to `index.html`.

## Supabase security

Do not expose `SUPABASE_SECRET_KEY` in browser code. Reads and writes go through Netlify Functions. Admin functions verify a signed, short-lived PIN session before service-role writes and record material actions in `audit_log`.

## Environment variables

See `.env.example`:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `ADMIN_PIN_HASH` — SHA-256 hash of the shared admin PIN, optionally prefixed with `sha256:`. Generate one with `printf %s "1234" | shasum -a 256 | awk '{print $1}'`.
- `ADMIN_SESSION_SECRET` — long random value used to sign short-lived admin bearer tokens.
- `TOUR_PUBLIC_ACCESS_SECRET` — long random value used to sign public-access cookies.

Apply Supabase migrations in filename order before deploying code that depends on a new migration. Migration `202607250001_live_readiness_transactions.sql` supplies the atomic Admin operations, public-access hardening and Portugal timezone repair used by the current app.

## October launch fixes

Use Node 22 (`.nvmrc` and Netlify build configuration). Run `npm ci`, `npm test` and `npm run build` before deployment. Tests include an isolated embedded Postgres migration and transaction rehearsal.

Apply `202610200001_friday_launch_hardening.sql` **before** deploying the new function code. It enables table RLS, restricts browser-role RPC access, and adds atomic roster, result, cutoff and public-bet operations. Netlify must use the server-side Supabase secret with service-role access. See [the launch review](docs/qa/2026-10-20-launch-review.md) for findings, verification limits and the production rollout sequence.

## Confirmed 2026 configuration

Apply the two `20261021` competition migrations before deploying this version. The production project also needs `supabase/configuration/schedule-pool-defaults.sql`: this installs a named `pg_cron` job every minute. A callable function or a website visit is not the scheduler. Check `cron.job_run_details` and `bet_pool_scheduler_runs` for actual successful executions.

The separately retained private configuration SQL is the one-time, tour-ID-scoped configuration. Real attendance and room occupants are deliberately excluded from this public repository. It updates existing round and market identities, preserves permanent profiles/history, and refuses to overwrite an installed operations record. Do not reapply it over organiser changes. The four existing markets are updated in place; two pools are added. No 2026 rules are applied to other tours.

For 2026, GameBook handles scoring and handicap allowances. Tour → Competitions & scoring accepts final pair or individual Stableford totals, saves Friday and Monday separately, and provides draw previews, tee sheets, tie decisions and finalisation. Live retains Saturday/Sunday matchplay results. Confirm each pool's actual GameBook winner to calculate ledger payouts after cutoff. Score corrections invalidate that confirmation and require it again. Apply `20261022102718_gamebook_winner_settlement.sql` before deploying these controls. Reusable hole-card scoring remains available to other tour configurations.

The combined £5 pool closes Monday 9 November at 10:00 Europe/Lisbon. Six independent commitments still total £45 per person (£1,080 minimum for 24); Friday requires £15 and Monday £10. After Friday, the main team scoreboard includes hatched provisional combined points and shows confirmed points separately. These projections never enter official team totals until finalisation.

Tour → Plan provides Itinerary and Rooms; Bet Punto → Pool compliance shows all six commitments and cutoff exceptions. Real teams and pairings must be supplied before publication; the app does not invent them.

The Plan download calls `public-itinerary-pdf` to generate the current PDF from saved rounds, itinerary and rooms. The private PDF is a dated reference snapshot; later edits need no manual upload for the app download. `Install Roegusta` explains Apple and Android installation. Live writes require a connection; no offline-save claim is made.
