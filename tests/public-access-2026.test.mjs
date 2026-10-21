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

test('the superseded 2026 helper cannot recreate obsolete rounds', () => {
  assert.match(templateSource, /old 2026 template has been replaced/);
  assert.doesNotMatch(templateSource, /19:20|12:14|\.update\(|\.insert\(/);
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
