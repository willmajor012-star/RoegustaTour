# Roegusta Tour

A mobile-first private golf tour hub for the Roegusta Tour: Ryder Cup-style scoring, match planning, calculated player stats, player profiles and a lightweight visible betting/voting log.

## Stack

- React + Vite + TypeScript
- Simple global CSS in `src/styles/globals.css`
- Netlify deployment and Netlify Functions
- Future Supabase Postgres backend
- Mock data for the first build

## Local setup

```bash
npm install
npm run dev
npm run build
```

## Folder structure

- `src/app` — app shell, route list and navigation model
- `src/components` — reusable cards, scoreboard, leaderboards and navigation
- `src/data/mockData.ts` — first-build mock data and TODO for repository-backed access
- `src/lib` — TypeScript entities, scoring, stats, betting and formatting helpers
- `src/pages` — public pages and admin placeholder shell
- `netlify/functions` — placeholder public and admin endpoints
- `supabase/schema.sql` — future Postgres schema
- The header uses a text/CSS `TR` monogram placeholder so the branch contains code/text files only.

## Mock data approach

The initial build uses fictional Roegusta-style data. The app stores permanent players, tour editions, tour-specific rosters, tour-specific teams, rounds, matches, match participants, betting markets, betting options, bets and historic imported summaries.

Mock exports are intentionally shaped like future database records so Supabase access can be added without rebuilding the UI.

## Data model

Players are permanent. Team membership is never permanent: players join teams through `TourTeamMember` records within a specific tour. Matches support singles, better ball, scramble and custom formats, and each side can have any number of participants.

## Scoring model

Admin will enter a single match result. From completed matches, utility functions derive:

- team score by tour
- player match results
- current-tour leaderboard
- all-time leaderboard
- format-specific leaderboards

Team score adds `pointsSideA` and `pointsSideB` to the relevant tour teams. Player points are calculated as wins plus half a point for draws.

## Historic import approach

Historic rows use `HistoricalPlayerStats` for previous years where only aggregate data exists. All-time stats combine calculated match-based records with those imported summaries.

## Betting model

Betting is a social tour log, not a bookmaker. There are no accounts, wallets, transfers or payment handling. Users choose/type a local display name, pick an option, enter stake text and optional comments, and can see who backed what.

## Netlify deployment

`netlify.toml` builds with `npm run build`, publishes `dist`, and serves functions from `netlify/functions`. The SPA redirect sends all browser routes to `index.html`.

## Future Supabase integration

Do not expose `SUPABASE_SERVICE_ROLE_KEY` in browser code. Future write operations should happen server-side through Netlify Functions. Admin functions should verify a shared PIN/session token, perform service-role writes and record changes in `audit_log`.

## Environment variables

See `.env.example`:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_PIN_HASH`
- `ADMIN_SESSION_SECRET`

## Next development phases

1. Replace mock imports in Netlify Functions with Supabase reads.
2. Add admin PIN verification and short-lived admin sessions.
3. Build admin forms for players, tours, teams, rounds, matches and results.
4. Persist public bet submissions.
5. Add row-level security policies and audit logging.
6. Add richer filtering by tour and historic import tooling.
