import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { loadTs } from './helpers/load-ts.mjs';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
for (const name of ['window', 'document', 'navigator', 'CustomEvent', 'HTMLElement', 'localStorage']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });

test('initial public load completes under StrictMode, which replays effects', async () => {
  const { usePublicData } = loadTs('src/lib/usePublicData.ts');
  let finish;
  const payload = new Promise((done) => { finish = done; });
  const loader = () => payload;
  function Probe() {
    const { data, loading } = usePublicData(loader);
    return React.createElement('p', null, loading ? 'Loading' : data?.label ?? 'Missing');
  }
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => root.render(React.createElement(React.StrictMode, null, React.createElement(Probe))));
    assert.equal(document.body.textContent, 'Loading');
    await act(async () => finish({ source: 'supabase', label: 'Tour loaded' }));
    assert.equal(document.body.textContent, 'Tour loaded');
  } finally {
    await act(async () => root.unmount());
  }
});

test('manual refresh cannot reuse or cache an older in-flight public request', async () => {
  const originalFetch = globalThis.fetch;
  const pending = [];
  globalThis.fetch = () => new Promise((done) => pending.push(done));
  const api = loadTs('src/lib/publicApi.ts');
  try {
    const stale = api.fetchPublicDashboard();
    api.clearPublicDataCache();
    const fresh = api.fetchPublicDashboard();
    assert.equal(pending.length, 2);
    pending[1]({ ok: true, json: async () => ({ label: 'new' }) });
    await fresh;
    pending[0]({ ok: true, json: async () => ({ label: 'old' }) });
    await stale;
    assert.equal((await api.fetchPublicDashboard()).label, 'new');
  } finally { globalThis.fetch = originalFetch; }
});

test('expired public access returns to the password gate', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true });
  const { PublicPasswordGate } = loadTs('src/components/PublicPasswordGate.tsx');
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => root.render(React.createElement(PublicPasswordGate, { isAdminRoute: false }, React.createElement('p', null, 'Private content'))));
    assert.match(document.body.textContent, /Private content/);
    await act(async () => window.dispatchEvent(new CustomEvent('public-access-expired')));
    assert.doesNotMatch(document.body.textContent, /Private content/);
    assert.match(document.body.textContent, /Tour access has expired/);
    assert.ok(document.querySelector('input[type=password]'));
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
  }
});

test('match results reject contradictory margins and unsupported point splits', () => {
  const { validateResultPoints, validateResultConsistency } = loadTs('netlify/functions/_resultHelpers.ts');
  assert.ok(validateResultPoints(.75, .25, 1));
  assert.equal(validateResultPoints(.5, .5, 1), null);
  assert.equal(validateResultPoints(1, 0, 1), null);
  assert.ok(validateResultConsistency('AS', 1, 0));
  assert.ok(validateResultConsistency('3 & 2', .5, .5));
  assert.equal(validateResultConsistency('as', .5, .5), null);
  assert.equal(validateResultConsistency('3 & 2', 1, 0), null);
});

test('public routes mount with realistic and empty data without render failures', async () => {
  const fixture = loadTs('src/data/mockData.ts');
  const { courseGuides } = loadTs('src/data/courseGuides.ts');
  const { AppShell } = loadTs('src/app/AppShell.tsx');
  const originalFetch = globalThis.fetch;
  window.scrollTo = () => {};
  const tour = { ...fixture.tours[0], isCurrentPublic: true, timezone: 'Europe/Lisbon' };
  const payload = { ...fixture, tour, currentTour: tour, teams: fixture.tourTeams, scores: [], recentResults: [], openMarkets: [], roundPrizeResults: [], itineraryItems: [], handbookSections: [], teamDayKit: [], tourCourses: courseGuides.map((c, i) => ({ ...c, id: `course-${i}`, tourId: tour.id, published: true })), source: 'supabase' };
  try {
    for (const empty of [false, true]) {
      const response = empty ? Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, Array.isArray(value) ? [] : value])) : payload;
      globalThis.fetch = async () => ({ ok: true, json: async () => response });
      for (const path of ['/', '/matches', '/teams', '/tours', '/info', '/courses', '/courses/faldo', '/betting', '/score', '/stats']) {
        const api = loadTs('src/lib/publicApi.ts');
        api.clearPublicDataCache();
        window.history.replaceState(null, '', path);
        const root = createRoot(document.getElementById('root'));
        try {
          await act(async () => root.render(React.createElement(React.StrictMode, null, React.createElement(AppShell))));
          assert.doesNotMatch(document.body.textContent, /Loading (?:tour|course|Bet Punto|stats|teams|matches|live)/i, `${path}: initial request must finish`);
          assert.ok(document.querySelector('main'), path);
        } finally { await act(async () => root.unmount()); }
      }
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('public stats never use unpublished result totals or crown an active-tour winner', async () => {
  const { getAdvancedStatsBundle } = loadTs('netlify/functions/_publicData.ts');
  const { calculateTourSummary } = loadTs('src/lib/advancedStats.ts');
  const tables = {
    tours: [{ id: 'tour', name: 'Launch tour', year: 2026, status: 'active', is_current_public: true }],
    players: [], tour_players: [], tour_team_members: [], match_participants: [], player_match_results: [],
    tour_teams: [{ id: 'a', tour_id: 'tour', name: 'A', sort_order: 1, published: true }, { id: 'b', tour_id: 'tour', name: 'B', sort_order: 2, published: true }],
    rounds: [{ id: 'round', tour_id: 'tour', round_number: 1, name: 'Round', status: 'active', published: true }],
    matches: [
      { id: 'visible', match_number: 1, format: 'singles', points_available: 1, tour_id: 'tour', round_id: 'round', side_a_team_id: 'a', side_b_team_id: 'b', status: 'complete', published: true, winning_side: 'halved', points_side_a: .5, points_side_b: .5 },
      { id: 'private', match_number: 2, format: 'singles', points_available: 1, tour_id: 'tour', round_id: 'round', side_a_team_id: 'a', side_b_team_id: 'b', status: 'complete', published: false, winning_side: 'A', points_side_a: 1, points_side_b: 0 },
    ],
    tour_team_results: [{ id: 'result', tour_id: 'tour', team_id: 'a', final_points: 1.5, result_status: 'winner' }],
  };
  const supabase = { from(name) {
    let rows = [...(tables[name] ?? [])];
    const query = {
      select() { return this; }, order() { return this; },
      eq(key, value) { rows = rows.filter((row) => row[key] === value); return this; },
      in(key, values) { rows = rows.filter((row) => values.includes(row[key])); return this; },
      limit(count) { rows = rows.slice(0, count); return this; },
      then(done, fail) { return Promise.resolve({ data: rows, error: null }).then(done, fail); },
    };
    return query;
  } };
  const bundle = await getAdvancedStatsBundle(supabase);
  assert.deepEqual(bundle.matches.map((match) => match.id), ['visible']);
  assert.deepEqual(bundle.tourTeamResults, []);
  const summary = calculateTourSummary('tour', bundle);
  assert.equal(summary.winningTeam, undefined);
  assert.equal(summary.teamScore.find((row) => row.team.id === 'a').points, .5);
  tables.tours[0].status = 'complete';
  assert.deepEqual((await getAdvancedStatsBundle(supabase)).tourTeamResults, []);
  tables.matches[1].published = true;
  assert.equal((await getAdvancedStatsBundle(supabase)).tourTeamResults[0].finalPoints, 1.5);
});


test('tee cutoffs respect Portugal timezone and reject invalid calendar times', () => {
  const { zonedLocalDateTimeToIso, normalizeClockTime } = loadTs('src/lib/tourTime.ts');
  assert.equal(zonedLocalDateTimeToIso('2026-11-06', '09:00', 'Europe/Lisbon'), '2026-11-06T09:00:00.000Z');
  assert.equal(zonedLocalDateTimeToIso('2026-07-06', '09:00', 'Europe/Lisbon'), '2026-07-06T08:00:00.000Z');
  assert.equal(zonedLocalDateTimeToIso('2026-02-31', '09:00', 'Europe/Lisbon'), undefined);
  assert.equal(zonedLocalDateTimeToIso('2026-03-29', '01:30', 'Europe/Lisbon'), undefined);
  assert.equal(normalizeClockTime('9:00:59'), '09:00');
  assert.equal(normalizeClockTime('9:00:99'), undefined);
});


test('future tour dates override an active flag and use the tour timezone', () => {
  const { tourLifecycle } = loadTs('src/lib/tourState.ts');
  const tour = { startDate: '2026-11-06', endDate: '2026-11-09', timezone: 'Europe/Lisbon', status: 'active' };
  assert.equal(tourLifecycle(tour, Date.parse('2026-10-20T12:00Z')).live, false);
  assert.equal(tourLifecycle(tour, Date.parse('2026-11-06T00:00Z')).live, true);
  assert.equal(tourLifecycle(tour, Date.parse('2026-11-09T23:59:59Z')).live, true);
  assert.equal(tourLifecycle(tour, Date.parse('2026-11-10T00:00Z')).complete, true);
  assert.equal(tourLifecycle({ ...tour, timezone: 'Europe/Lisbon', startDate: '2026-07-06', endDate: '2026-07-09' }, Date.parse('2026-07-05T23:30Z')).live, true);
});
