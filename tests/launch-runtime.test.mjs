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

test('the entire home team score card opens the current tour overview', async () => {
  const fixture=loadTs('src/data/mockData.ts');
  const tour={...fixture.tours[0],isCurrentPublic:true,timezone:'Europe/Lisbon'};
  const payload={...fixture,tour,currentTour:tour,teams:fixture.tourTeams,scores:[],recentResults:[],openMarkets:[],roundPrizeResults:[],itineraryItems:[],handbookSections:[],teamDayKit:[],tourCourses:[],source:'supabase'};
  const originalFetch=globalThis.fetch;globalThis.fetch=async()=>({ok:true,status:200,json:async()=>payload});
  window.history.replaceState(null,'','/');window.scrollTo=()=>{};
  const {AppShell}=loadTs('src/app/AppShell.tsx');const root=createRoot(document.getElementById('root'));
  try {
    await act(async()=>root.render(React.createElement(AppShell)));
    const card=document.querySelector('a.score-feature');assert(card);assert.equal(card.getAttribute('href'),'/tours/current');
    assert.equal(card.querySelectorAll('a').length,0,'the score card has no nested links');
    await act(async()=>card.querySelector('h2').click());
    assert.equal(window.location.pathname,'/tours/current');
    assert(document.querySelector('.selected-tour-hero'));
    assert.deepEqual([...document.querySelectorAll('.tour-detail-switch button')].map((b)=>b.textContent),['Overview','Results','Teams','Leaderboard']);
  } finally {await act(async()=>root.unmount());globalThis.fetch=originalFetch;window.history.replaceState(null,'','/');}
});

test('public pairs standings use compact cards and show Friday projections without organiser instructions', async () => {
 const {CompetitionStandings}=loadTs('src/components/PublicCompetition.tsx');
 const entries=Array.from({length:12},(_,i)=>({id:'pair'+i,playerIds:['a'+i,'b'+i],teamId:i<6?'sideA':'sideB'}));
 const session=(key)=>({id:key,key,title:key,date:'2026-11-06',holes:9,holeOrder:[1,2,3,4,5,6,7,8,9],format:'scramble',scores:[],handicaps:[],handicapSettings:{method:''},resultMode:'totals',totals:key==='friday'?entries.map((e,i)=>({entryId:e.id,stableford:20+i,completedHoles:9})):[]});
 const c={id:'combined',key:'combined',entries,entriesPublished:true,published:true,sessions:[session('friday'),session('monday')],decisions:[],pointAwards:[6,5.5,5,4.5,4,3.5,3,2.5,2,1.5,1,.5]};
 const b={courses:[],players:entries.flatMap((e,i)=>e.playerIds.map((id)=>({id,displayName:'Golfer '+id}))),teams:[{id:'sideA',name:'Side A'},{id:'sideB',name:'Side B'}]};
 const root=createRoot(document.getElementById('root'));
 try {await act(async()=>root.render(React.createElement(CompetitionStandings,{competition:c,bundle:b})));assert.equal(document.querySelectorAll('.competition-standing').length,12);assert.equal(document.querySelectorAll('table').length,0);assert.match(document.body.textContent,/Not started/);assert.match(document.body.textContent,/Provisional/);assert.doesNotMatch(document.body.textContent,/GameBook|handicap|Save|admin ranking/);}
 finally{await act(async()=>root.unmount());}
});

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

test('tour cards and overview agree on date-aware final winners', async () => {
  const originalNow = Date.now;
  Date.now = () => Date.parse('2026-10-20T12:00Z');
  try {
    for (const scenario of [
      { status: 'active', ended: true, points: [2, 1], outcome: 'Alpha won' },
      { status: 'planned', ended: true, points: [2, 1], outcome: 'Alpha won' },
      { status: 'active', ended: true, points: [1, 1], outcome: 'Winner TBC' },
      { status: 'active', ended: false, points: [2, 1], outcome: 'Alpha leading' },
    ]) {
      const current = { id: 'current', name: 'Current tour', year: 2027, status: 'planned', startDate: '2027-11-06', endDate: '2027-11-09' };
      const tour = { id: 'review', name: 'Review tour', year: 2026, status: scenario.status, timezone: 'Europe/Lisbon', startDate: '2026-07-06', endDate: scenario.ended ? '2026-07-09' : '2026-11-09' };
      const teams = ['Alpha', 'Beta'].map((name, i) => ({ id: name, name, tourId: tour.id, sortOrder: i }));
      const payload = { currentTour: current, tours: [current, tour], players: [], tourPlayers: [], tourTeams: teams, tourTeamMembers: [], tourTeamResults: teams.map((team, i) => ({ tourId: tour.id, teamId: team.id, finalPoints: scenario.points[i], resultStatus: 'tbd' })), rounds: [], matches: [], matchParticipants: [] };
      const { Tours } = loadTs('src/pages/Tours.tsx', {
        [`${process.cwd()}/src/lib/usePublicData.ts`]: `export function usePublicData() { return { data: ${JSON.stringify(payload)}, loading: false }; }`,
      });
      const root = createRoot(document.getElementById('root'));
      try {
        await act(async () => root.render(React.createElement(Tours)));
        const card = document.querySelector('.tour-archive-card');
        assert.equal(card.querySelector('.tour-status-badge').textContent, scenario.ended ? 'Final' : 'Live');
        assert.ok(card.textContent.includes(scenario.outcome), card.textContent);
        await act(async () => card.click());
        const winnerStat = [...document.querySelectorAll('.tour-overview-grid article')].find((entry) => entry.querySelector('span').textContent === 'Winner');
        assert.equal(winnerStat.querySelector('strong').textContent, scenario.ended ? scenario.outcome : 'TBC');
        assert.equal(document.querySelector('.selected-tour-hero > div > strong')?.textContent, scenario.ended && scenario.points[0] > scenario.points[1] ? 'Alpha won' : undefined);
      } finally { await act(async () => root.unmount()); }
    }
  } finally { Date.now = originalNow; }
});


test('course refresh preserves valid selections and resets removed tees and holes', async () => {
  const { courseGuides } = loadTs('src/data/courseGuides.ts');
  const original = { ...courseGuides[0], id: 'refresh-course', published: true };
  globalThis.courseRefreshFixture = { rounds: [], tourCourses: [original] };
  const { CourseGuidePage } = loadTs('src/pages/CourseGuidePage.tsx', {
    [`${process.cwd()}/src/lib/usePublicData.ts`]: 'export function usePublicData() { return { data: globalThis.courseRefreshFixture, loading: false }; }',
  });
  const root = createRoot(document.getElementById('root'));
  const render = () => act(async () => root.render(React.createElement(CourseGuidePage, { slug: original.slug })));
  const tee = (key) => [...document.querySelectorAll('.course-tee-switch button')].find((button) => button.textContent.trim() === original.tees.find((entry) => entry.key === key).label);
  const hole = (number) => [...document.querySelectorAll('.hole-number-strip button')].find((button) => button.textContent === String(number));
  try {
    await render();
    await act(async () => { tee('white').click(); hole(18).click(); });
    globalThis.courseRefreshFixture = { rounds: [], tourCourses: [{ ...original, overview: 'Updated content' }] };
    await render();
    assert.equal(tee('white').getAttribute('aria-selected'), 'true');
    assert.equal(document.querySelector('#hole-guide-title').textContent, 'Hole 18');

    const reduced = { ...original, tees: original.tees.filter((entry) => entry.key !== 'white'), holes: original.holes.slice(0, 9) };
    globalThis.courseRefreshFixture = { rounds: [], tourCourses: [reduced] };
    await render();
    assert.equal(tee('yellow').getAttribute('aria-selected'), 'true');
    assert.equal(document.querySelector('#hole-guide-title').textContent, 'Hole 1');
    assert.equal(document.querySelector('.course-scorecard-list button.active strong').textContent, '1');
    const yellowYards = reduced.holes.reduce((sum, entry) => sum + entry.yards.yellow, 0).toLocaleString('en-GB');
    assert.ok(document.querySelector('.course-nine-heading span').textContent.includes(yellowYards + ' yds'));
    await act(async () => document.querySelector('.hole-guide-actions button:last-child').click());
    assert.equal(document.querySelector('#hole-guide-title').textContent, 'Hole 2');

    globalThis.courseRefreshFixture = { rounds: [], tourCourses: [{ ...reduced, tees: reduced.tees.filter((entry) => entry.key === 'red') }] };
    await render();
    assert.equal(tee('red').getAttribute('aria-selected'), 'true');
    assert.equal(document.querySelector('#hole-guide-title').textContent, 'Hole 2');
    const redYards = reduced.holes.reduce((sum, entry) => sum + entry.yards.red, 0).toLocaleString('en-GB');
    assert.ok(document.querySelector('.course-nine-heading span').textContent.includes(redYards + ' yds'));
  } finally {
    await act(async () => root.unmount());
    delete globalThis.courseRefreshFixture;
  }
});
