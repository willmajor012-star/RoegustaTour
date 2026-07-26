import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadTsModule(relativePath) {
  const source = await readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: relativePath,
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

test('current-tour drafts stay private even when no content has been published yet', async () => {
  const { isPublicMatch, isPublicRound, isPublicTeamRoster } = await loadTsModule('src/lib/publicVisibility.ts');
  const tour = { status: 'planned', isCurrentPublic: true };
  const privateRound = { status: 'planned', published: false };
  const publicRound = { status: 'planned', published: true };

  assert.equal(isPublicRound(privateRound, tour), false);
  assert.equal(isPublicMatch({ status: 'complete', published: false }, publicRound, tour), false);
  assert.equal(isPublicTeamRoster(tour, { published: false }), false);
  assert.equal(isPublicMatch({ status: 'planned', published: true }, publicRound, tour), true);
});

test('completed archives remain readable without weakening current-tour draft controls', async () => {
  const { isPublicMatch, isPublicRound, isPublicTeamRoster } = await loadTsModule('src/lib/publicVisibility.ts');
  const archive = { status: 'archived', isCurrentPublic: false };
  const completedRound = { status: 'complete', published: false };

  assert.equal(isPublicRound(completedRound, archive), true);
  assert.equal(isPublicMatch({ status: 'complete', published: false }, completedRound, archive), true);
  assert.equal(isPublicTeamRoster(archive, { published: false }), true);
});

test('a private future tour cannot mask the latest readable archive', async () => {
  const publicData = await readFile(new URL('../netlify/functions/_publicData.ts', import.meta.url), 'utf8');
  assert.match(publicData, /tours\.find\(\(tour\) => tour\.isCurrentPublic === true\)/);
  assert.match(publicData, /selectDefaultTour\(tours\.filter\(isPublicTour\)\)/);
  assert.match(publicData, /players: playerRows\.map\(mapPlayer\)\.filter\(\(player\) => publicPlayerIds\.has\(player\.id\)\)/);
});

test('Bet Punto enforces £10 across a playing day rather than once per market', async () => {
  const { playerRequiredStakeForPlayingDate, requiredDailyStakeShortfall } = await loadTsModule('src/lib/betPuntoDefaults.ts');
  const rounds = [
    { id: 'round-am', roundDate: '2026-11-07' },
    { id: 'round-pm', roundDate: '2026-11-07' },
    { id: 'round-sun', roundDate: '2026-11-08' },
  ];
  const markets = [
    { id: 'market-am', roundId: 'round-am' },
    { id: 'market-pm', roundId: 'round-pm' },
    { id: 'market-sun', roundId: 'round-sun' },
  ];
  const firstPick = [{ marketId: 'market-am', bettorPlayerId: 'player-1', stakeAmountPence: 500, active: true }];

  assert.equal(playerRequiredStakeForPlayingDate('2026-11-07', 'player-1', markets, rounds, firstPick), 500);
  assert.equal(requiredDailyStakeShortfall(1000, '2026-11-07', 'player-1', markets, rounds, firstPick), 500);

  const toppedUp = [...firstPick, { marketId: 'market-pm', bettorPlayerId: 'player-1', stakeAmountPence: 500, active: true }];
  assert.equal(requiredDailyStakeShortfall(1000, '2026-11-07', 'player-1', markets, rounds, toppedUp), 0);
  assert.equal(requiredDailyStakeShortfall(1000, '2026-11-08', 'player-1', markets, rounds, toppedUp), 1000);
});

test('tour dates reject reversed ranges and accept partial or ordered dates', async () => {
  const { validateTourDateRange } = await loadTsModule('src/lib/tourValidation.ts');
  assert.equal(validateTourDateRange('2026-11-09', '2026-11-06'), 'Tour end date must be on or after the start date.');
  assert.equal(validateTourDateRange('2026-11-06', '2026-11-09'), null);
  assert.equal(validateTourDateRange('2026-11-06', null), null);
  assert.equal(validateTourDateRange('2026-11-06', null, true), 'Start date and end date are required for a planned, active or complete tour.');
});

test('Admin consolidation retains every working editor in six task-based areas', async () => {
  const { adminWorkspaces, visibleWorkspaceTabs } = await loadTsModule('src/lib/adminNavigation.ts');
  assert.deepEqual(adminWorkspaces.map((workspace) => workspace.id), ['live', 'tour', 'people', 'pairings', 'bet-punto', 'settings']);
  const tabIds = adminWorkspaces.flatMap((workspace) => workspace.tabs.map((tab) => tab.id));
  for (const expected of ['Tour setup', 'Player library', 'Squads & teams', 'Courses', 'Rounds & tee times', 'Matches & pairings', 'Result entry', 'Tour itinerary', 'Bet Punto', 'Settings', 'Admin guide']) {
    assert.ok(tabIds.includes(expected), `${expected} should remain reachable`);
  }
  const settings = adminWorkspaces.find((workspace) => workspace.id === 'settings');
  assert.equal(visibleWorkspaceTabs(settings, false).some((tab) => tab.id === 'Handbook'), false);
  assert.equal(visibleWorkspaceTabs(settings, true).some((tab) => tab.id === 'Handbook'), true);
});

test('live-readiness migration supplies atomic Admin operations and Portugal timezone repair', async () => {
  const migration = await readFile(new URL('../supabase/migrations/202607250001_live_readiness_transactions.sql', import.meta.url), 'utf8');
  for (const fn of [
    'admin_set_current_public_tour',
    'admin_publish_tour_content',
    'admin_settle_bet_market_atomic',
    'admin_save_round_prize_result_atomic',
    'admin_submit_match_result_atomic',
    'admin_save_match_setup_atomic',
  ]) assert.match(migration, new RegExp(`function public\\.${fn}`));
  assert.match(migration, /timezone = 'Europe\/Lisbon'/);
  assert.match(migration, /tours_date_order_check/);
  assert.match(migration, /requires_change/);
  assert.match(migration, /Every active bet needs a valid stake amount/);
});

test('production public access no longer silently invents the legacy password', async () => {
  const access = await readFile(new URL('../netlify/functions/_publicAccess.ts', import.meta.url), 'utf8');
  const settings = await readFile(new URL('../netlify/functions/admin-public-access-settings.ts', import.meta.url), 'utf8');

  assert.match(access, /Missing required public access environment variable: TOUR_PUBLIC_ACCESS_SECRET/);
  assert.match(access, /Public access is not configured/);
  assert.doesNotMatch(access, /const\s+(?:DEFAULT|DEVELOPMENT)_PUBLIC_PASSWORD/);
  assert.doesNotMatch(access, /return\s+['"][^'"]*public-access-secret/);
  assert.match(settings, /requires_change: false/);
});

test('Admin makes completed-pairing protection and daily Bet Punto coverage explicit', async () => {
  const admin = await readFile(new URL('../src/pages/Admin.tsx', import.meta.url), 'utf8');

  assert.match(admin, /Completed pairing locked/);
  assert.match(admin, /Side A label/);
  assert.match(admin, /Days below £10/);
  assert.match(admin, /summary\.missingMandatoryDays/);
  assert.match(admin, /Run cutoff\/default check/);
  assert.match(admin, /cannot create a second itinerary/);
  assert.doesNotMatch(admin, /onSubmit=\{submitHandbookSection\}/);
  assert.doesNotMatch(admin, /Coming next/);
});

test('public polling deduplicates requests and pauses while hidden or offline', async () => {
  const hook = await readFile(new URL('../src/lib/usePublicData.ts', import.meta.url), 'utf8');
  const api = await readFile(new URL('../src/lib/publicApi.ts', import.meta.url), 'utf8');
  const dashboard = await readFile(new URL('../src/pages/Dashboard.tsx', import.meta.url), 'utf8');

  assert.match(hook, /options\.refreshMs \?\? 60_000/);
  assert.match(hook, /document\.visibilityState !== 'visible' \|\| !navigator\.onLine/);
  assert.match(hook, /inFlightRef/);
  assert.match(api, /publicRequestsInFlight/);
  assert.match(dashboard, /fetchPublicDashboard/);
});
