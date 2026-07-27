import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const accessSource = readFileSync('netlify/functions/_publicAccess.ts', 'utf8');
const publicDataSource = readFileSync('netlify/functions/_publicData.ts', 'utf8');
const appShellSource = readFileSync('src/app/AppShell.tsx', 'utf8');
const gateSource = readFileSync('src/components/PublicPasswordGate.tsx', 'utf8');
const adminSource = readFileSync('src/pages/Admin.tsx', 'utf8');
const templateSource = readFileSync('netlify/functions/admin-apply-2026-format-template.ts', 'utf8');
const prizesSource = readFileSync('netlify/functions/admin-create-default-round-prize-results.ts', 'utf8');
const dashboardSource = readFileSync('src/pages/Dashboard.tsx', 'utf8');

test('public data functions require a signed 180-day password session', () => {
  assert.match(accessSource, /TOUR_PUBLIC_ACCESS_SECRET/);
  assert.match(accessSource, /SESSION_TTL_SECONDS = 60 \* 60 \* 24 \* 180/);
  assert.match(accessSource, /HttpOnly/);
  assert.match(accessSource, /SameSite=Lax/);
  assert.match(accessSource, /hashPublicPassword/);
  assert.match(publicDataSource, /requirePublicAccess\(event, supabase\)/);
});

test('public app shows a password gate and keeps admin separate', () => {
  assert.match(appShellSource, /path === '\/admin'/);
  assert.match(appShellSource, /PublicPasswordGate/);
  assert.match(gateSource, /Private golf tour/);
  assert.match(gateSource, /type="password"/);
  assert.doesNotMatch(gateSource, /PIN-style|inputMode="numeric"/);
});

test('admin can change public password without showing current password', () => {
  assert.match(adminSource, /Public access/);
  assert.match(adminSource, /savePublicAccessSettings/);
  assert.match(adminSource, /Force existing public sessions to expire/);
  assert.doesNotMatch(adminSource, /current password/i);
});

test('2026 helper creates the confirmed four-session schedule', () => {
  assert.match(templateSource, /Faldo Course/);
  assert.match(templateSource, /Amendoeira Par 3/);
  assert.doesNotMatch(templateSource, /O'Connor Jnr\. Course/);
  assert.match(templateSource, /Old Course/);
  assert.match(templateSource, /O’Connor Course/);
  assert.match(templateSource, /round_date: '2026-11-06'/);
  assert.match(templateSource, /round_date: '2026-11-07'/);
  assert.match(templateSource, /tee_time: '19:20'/);
  assert.match(templateSource, /tee_time: '11:24'/);
  assert.match(templateSource, /holes: 9/);
  assert.match(templateSource, /Friday Par 3 Pairs Scramble/);
  assert.match(templateSource, /Pairs Scramble \(Scratch\)/);
  assert.match(templateSource, /4BBB \(Full Handicap\)/);
  assert.match(templateSource, /format: 'better_ball'/);
  assert.match(templateSource, /format: 'scramble'/);
  assert.match(templateSource, /format: 'singles'/);
  assert.match(templateSource, /update\(\{ format: round\.format \}\)/);
  assert.match(templateSource, /published: existing\?\.published \?\? false/);
  assert.match(templateSource, /Extra non-complete rounds remain/);
  assert.doesNotMatch(templateSource, /Academy|Par 3 Course/i);
  assert.doesNotMatch(templateSource, /tee_time: existing\?\.tee_time/);
  assert.match(templateSource, /\{ published: true, showOnHome: true \}/);
  assert.doesNotMatch(templateSource, /const row = \{[^}]*published: true/);
});

test('2026 secondary prize slots and focused home next-round summary are present', () => {
  assert.match(prizesSource, /template2026/);
  assert.match(prizesSource, /Team lowest gross/);
  assert.match(prizesSource, /score_unit: 'gross'/);
  assert.match(prizesSource, /format === 'scramble'/);
  assert.match(prizesSource, /format === 'better_ball'/);
  assert.match(dashboardSource, /Up next/);
  assert.match(dashboardSource, /First tee/);
  assert.match(dashboardSource, /nextRound/);
});
