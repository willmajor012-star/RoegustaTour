import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appShell = readFileSync('src/app/AppShell.tsx', 'utf8');
const scoreboard = readFileSync('src/components/Scoreboard.tsx', 'utf8');
const golf = readFileSync('src/pages/Matches.tsx', 'utf8');
const courseEditor = readFileSync('src/components/AdminCourseEditor.tsx', 'utf8');
const migration = readFileSync('supabase/migrations/0015_tour_courses_and_automatic_bet_defaults.sql', 'utf8');
const deadline = readFileSync('netlify/functions/_betMarketDeadline.ts', 'utf8');
const defaults = readFileSync('netlify/functions/_betDefaults.ts', 'utf8');
const publicBet = readFileSync('netlify/functions/public-save-bet.ts', 'utf8');
const savePrize = readFileSync('netlify/functions/admin-save-round-prize-result.ts', 'utf8');
const betting = readFileSync('src/pages/Betting.tsx', 'utf8');
const betMarketCard = readFileSync('src/components/BetMarketCard.tsx', 'utf8');
const publicData = readFileSync('netlify/functions/_publicData.ts', 'utf8');
const experienceStyles = readFileSync('src/styles/experience.css', 'utf8');
const compactHeaderPages = [
  'src/pages/Betting.tsx',
  'src/pages/Courses.tsx',
  'src/pages/Matches.tsx',
  'src/pages/Stats.tsx',
  'src/pages/Teams.tsx',
  'src/pages/TourInfo.tsx',
  'src/pages/TourScore.tsx',
  'src/pages/Tours.tsx',
].map((path) => readFileSync(path, 'utf8'));

test('public pages have a safe app back control and no duplicated centre score', () => {
  assert.match(appShell, /className="app-back-button"/);
  assert.match(appShell, /window\.history\.back\(\)/);
  assert.match(appShell, /backFallback\(path\)/);
  assert.doesNotMatch(scoreboard, /scoreboard-centre|centreScore|hideCentreScore/);
  assert.match(scoreboard, /<TeamBlock score=\{left\}/);
  assert.match(scoreboard, /<TeamBlock score=\{right\}/);
});

test('Golf exposes teams alongside tee sheet, results and prizes', () => {
  assert.match(golf, /type GolfSection = 'tee-sheet' \| 'results' \| 'prizes' \| 'teams'/);
  assert.match(golf, /\{ value: 'teams', label: 'Teams' \}/);
  assert.match(golf, /function GolfTeams/);
  assert.match(golf, /section === 'teams'/);
});

test('public landing headers are compact, opaque and do not repeat explanatory copy', () => {
  compactHeaderPages.forEach((page) => assert.doesNotMatch(page, /<PageHeader[^>]*description=/));
  assert.match(experienceStyles, /\.page-landing-header\s*\{[^}]*background:\s*linear-gradient\(180deg,\s*#fffaf0,\s*#f3ead7\)/s);
  assert.match(experienceStyles, /\.golf-section-switch\s*\{[^}]*grid-template-columns:\s*repeat\(4,/s);
});

test('courses are tour-owned snapshots that can be copied into a future tour', () => {
  assert.match(migration, /create table if not exists public\.tour_courses/);
  assert.match(migration, /tour_id uuid not null references public\.tours/);
  assert.match(migration, /foreign key \(course_id\) references public\.tour_courses/);
  assert.match(courseEditor, /Copy a saved guide/);
  assert.match(courseEditor, /data\.courseLibrary\.filter\(\(course\) => course\.tourId !== tour\.id\)/);
  assert.match(courseEditor, /id: undefined/);
  assert.match(courseEditor, /tourId/);
});

test('required markets close at the timezone-aware first tee and auto-default in £5 increments to £10', () => {
  assert.match(migration, /timezone text not null default 'Europe\/London'/);
  assert.match(deadline, /earliestClockTime/);
  assert.match(deadline, /zonedLocalDateTimeToIso/);
  assert.match(deadline, /eq\('required', true\)/);
  assert.match(defaults, /BET_PUNTO_MINIMUM_STAKE_PENCE/);
  assert.match(defaults, /BET_PUNTO_STAKE_INCREMENT_PENCE/);
  assert.match(defaults, /linked_player_id === player\.id/);
  assert.match(defaults, /linked_team_id === teamByPlayer\.get\(player\.id\)/);
  assert.match(defaults, /entry_source: 'automatic_default'/);
  assert.match(defaults, /status: 'closed'/);
  assert.match(publicBet, /stakes must be in £5 increments/);
  assert.match(publicData, /return \{\s*tour,\s*rounds,/);
  assert.match(betMarketCard, /timeZone=\{activeData\.tour\?\.timezone\}|timeZone\?: string/);
  assert.match(betMarketCard, /toLocaleTimeString\('en-GB', \{ hour: '2-digit', minute: '2-digit', \.\.\.formatOptions \}\)/);
});

test('a published playing winner settles the pool and feeds the obvious whole-tour tally', () => {
  assert.match(savePrize, /applyAutomaticBetDefaultsForMarket/);
  assert.match(savePrize, /settleBetMarketRows/);
  assert.match(savePrize, /status: 'settled'/);
  assert.match(savePrize, /winnerOptionId/);
  assert.match(betting, /Bet Punto leaderboard/);
  assert.match(betting, /Total staked/);
  assert.match(betting, /Payouts/);
  assert.match(betting, /Still live/);
  assert.match(betting, /Up \$\{formatPenceCurrency/);
  assert.match(betting, /Down \$\{formatPenceCurrency/);
  assert.match(betting, /payment is handled offline/);
});
