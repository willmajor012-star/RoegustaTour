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

Bet Punto is a social tour log, not a bookmaker. There are no accounts, wallets, transfers or in-app payment handling. Attending players place £5-increment stakes with a £10 minimum across the required markets for each playing day. Markets close at their round’s fixed first tee in the tour timezone; any daily shortfall defaults to the player or their own scramble team. Winner entry settles the linked pool and the tour ledger shows staked, payout and net position.

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
