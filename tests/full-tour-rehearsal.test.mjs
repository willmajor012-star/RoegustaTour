import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { loadTs } from './helpers/load-ts.mjs';

// Initialise DOM event support before ReactDOM is loaded, so text input changes
// follow the same event path as a browser rather than jsdom's legacy fallback.
const initialDom = new JSDOM('<!doctype html>', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'navigator']) Object.defineProperty(globalThis, key, { configurable: true, value: initialDom.window[key] });
const { createRoot } = await import('react-dom/client');
const { rehearseTourUi } = await import('./helpers/tour-ui-rehearsal.mjs');

function snapshotClient(tables) {
  return {
    rpc: async () => ({ data: { dueMarketIds: [], closedMarketIds: [], insertedBetIds: [], updatedBetIds: [], unresolved: [] }, error: null }),
    from(name) {
      let rows = [...(tables[name] ?? [])];
      const query = {
        select: () => query,
        eq: (key, value) => { rows = rows.filter((row) => row[key] === value); return query; },
        in: (key, values) => { rows = rows.filter((row) => values.includes(row[key])); return query; },
        order: (key, { ascending = true } = {}) => { rows.sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (ascending ? 1 : -1)); return query; },
        limit: (n) => { rows = rows.slice(0, n); return query; },
        or: (filters) => {
          const predicates = filters.split(',').map((filter) => {
            const [key, op, value] = filter.split('.');
            assert.equal(op, 'eq');
            return (row) => String(row[key]) === value;
          });
          rows = rows.filter((row) => predicates.some((predicate) => predicate(row)));
          return query;
        },
        then: (resolve, reject) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
      };
      return query;
    },
  };
}

test('complete 16-player tour: database writes, public statistics and cumulative betting reconcile', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema storage; create table storage.buckets(id text primary key,name text,public boolean);');
    for (const file of (await readdir('supabase/migrations')).filter((file) => file.endsWith('.sql')).sort()) {
      await db.exec((await readFile(`supabase/migrations/${file}`, 'utf8')).replace(/create extension if not exists pgcrypto;/gi, ''));
    }
    const results = await db.exec(await readFile('scripts/qa/full-tour-rehearsal.sql', 'utf8'));
    const evidence = results.at(-1).rows[0].rehearsal;
    assert.deepEqual(evidence.teamScore, [9, 7]);
    assert.equal(evidence.totalStakePence, 48000);
    assert.equal(evidence.totalPayoutPence, 48000);
    assert.equal(evidence.leaderboard.reduce((sum, row) => sum + row.net_pence, 0), 0);
    assert.equal(Number((await db.query('select count(*) from tours')).rows[0].count), 0, 'all test data rolls back');
    const { getAdvancedStatsBundle, getBettingBundle } = loadTs('netlify/functions/_publicData.ts');
    const client = snapshotClient(evidence.snapshot);
    const stats = await getAdvancedStatsBundle(client);
    const { calculateTourSummary, calculatePlayerAdvancedSummaries } = loadTs('src/lib/advancedStats.ts');
    const tid = evidence.snapshot.tours[0].id;
    const summary = calculateTourSummary(tid, stats);
    assert.deepEqual(summary.teamScore.map((row) => row.points), [9, 7]);
    const players = calculatePlayerAdvancedSummaries(stats, tid);
    assert.equal(players.length, 16);
    for (const player of players) {
      assert.equal(player.currentTourRecord.matches, 3);
      assert.equal(player.allTimeRecord.matches, 3);
      assert.equal(player.toursAttended, 1);
    }
    assert.equal(players.filter((player) => player.tourWins === 1).length, 8);
    const betting = await getBettingBundle(client);
    const { buildBetPuntoBettorSummaries } = loadTs('src/lib/betting.ts');
    const ledger = buildBetPuntoBettorSummaries(betting.betMarkets, betting.betOptions, betting.bets, [], betting.rounds);
    assert.equal(ledger.length, 16);
    for (const player of ledger) {
      const expected = evidence.leaderboard.find((row) => row.bettor_name === player.bettorName);
      assert.equal(player.totalStakePence, expected.stake_pence);
      assert.equal(player.settledPayoutPence, expected.payout_pence);
      assert.equal(player.netPence, expected.net_pence);
      assert.equal(player.pendingStakePence, 0);
    }
    for (const bet of betting.bets) {
      assert.equal(bet.publicEditTokenHash, undefined);
      assert.equal(bet.deviceId, undefined);
    }
    await rehearseTourUi(db, evidence.snapshot);
  } finally { await db.close(); }
});

test('Live desk retains unsaved match results across unrelated refreshes and makes halves valid in one click', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'localStorage']) {
    Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { AdminLiveDesk } = loadTs('src/components/AdminLiveDesk.tsx');
  const data = {
    rounds: [{ id: 'round', roundNumber: 1, name: 'Test', format: 'singles', status: 'active', holes: 9 }],
    matches: [{ id: 'match', roundId: 'round', matchNumber: 1, format: 'singles', pointsAvailable: 1, status: 'planned', sideATeamId: 'a', sideBTeamId: 'b' }],
    tourTeams: [{ id: 'a', name: 'Red' }, { id: 'b', name: 'Blue' }],
    players: [], matchParticipants: [], roundPrizeResults: [], betMarkets: [], betOptions: [], tourPlayers: [],
  };
  const root = createRoot(document.getElementById('root'));
  const render = (value) => root.render(React.createElement(AdminLiveDesk, { data: value, tour: { id: 'tour' }, onRefresh: () => {}, onHelp: () => {} }));
  try {
    await act(async () => render(data));
    await act(async () => [...document.querySelectorAll('button')].find((button) => button.textContent === 'A/S').click());
    let margin = document.querySelector('.live-result-text select');
    assert.ok(margin, 'result uses controlled choices');
    assert.equal(margin.value, 'AS', 'halving sets its valid margin automatically');
    assert.ok(![...margin.options].some((option) => option.value === '10 & 8'), '9-hole round excludes 18-hole margins');
    await act(async () => render({ ...data, matches: data.matches.map((match) => ({ ...match })) }));
    margin = document.querySelector('.live-result-text select');
    assert.equal(margin.value, 'AS', 'background refresh preserves unsaved work');
    assert.equal(document.querySelector('.winner-toggle button.selected')?.textContent, 'A/S');
    await act(async () => [...document.querySelectorAll('.winner-toggle button')].find((button) => button.textContent === 'Red').click());
    assert.equal(margin.value, '', 'choosing a winner removes the contradictory halved margin');
  } finally { await act(async () => root.unmount()); dom.window.close(); }
});
