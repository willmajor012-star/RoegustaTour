import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { loadTs } from './load-ts.mjs';
import { pgliteSupabase } from './pglite-supabase.mjs';

export async function rehearseTourUi(db, snapshot) {
  const tid = snapshot.tours[0].id;
  const quote = (key) => `"${key}"`;
  for (const table of ['tours', 'players', 'tour_players', 'tour_teams', 'tour_team_members', 'rounds', 'matches', 'match_participants', 'bet_markets', 'bet_options']) {
    for (const original of snapshot[table]) {
      const row = { ...original };
      if (table === 'tours') row.status = 'active';
      if (table === 'rounds') row.status = 'active';
      if (table === 'matches') Object.assign(row, { status: 'planned', points_side_a: null, points_side_b: null, winning_side: null, result_text: null });
      if (table === 'bet_markets') Object.assign(row, { status: 'open', result_option_id: null, result_text: null, defaults_applied_at: null, closes_at: new Date(Date.now() + 3600000).toISOString() });
      const keys = Object.keys(row);
      await db.query(`insert into ${table} (${keys.map(quote).join(',')}) values (${keys.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(row));
    }
  }
  const oldFetch = globalThis.fetch;
  const oldAdminSecret = process.env.ADMIN_SESSION_SECRET;
  const oldPublicSecret = process.env.TOUR_PUBLIC_ACCESS_SECRET;
  process.env.ADMIN_SESSION_SECRET = 'local-test-admin-secret';
  process.env.TOUR_PUBLIC_ACCESS_SECRET = 'local-test-public-secret';
  globalThis.__tourQaClient = pgliteSupabase(db);
  const overrides = { [resolve('netlify/functions/_supabase.ts')]: 'export function createServerSupabaseClient() { return globalThis.__tourQaClient; }' };
  const auth = loadTs('netlify/functions/_adminAuth.ts');
  const access = loadTs('netlify/functions/_publicAccess.ts');
  const admin = await auth.createAdminSession('Local UI rehearsal');
  await db.query("insert into public_access_settings(id,password_hash,password_salt,session_version) values('default','local-fixture','local-fixture',1) on conflict(id) do update set password_hash=excluded.password_hash,password_salt=excluded.password_salt,session_version=1");
  const cookie = (await access.createPublicAccessCookie(1)).split(';')[0];
  const handlers = new Map();
  const requests = [];
  const pending = new Set();
  let failMatchId;
  let holdAdminData;
  let failAdminData = false;
  async function runEndpoint(name, payload, method = 'POST') {
    if (name === 'admin-data' && holdAdminData) await holdAdminData;
    if (name === 'admin-data' && failAdminData) {
      failAdminData = false;
      const payload = { message: 'Simulated refresh failure' };
      return { statusCode: 500, body: JSON.stringify(payload), payload };
    }
    if (name === 'admin-submit-result' && payload?.matchId === failMatchId) {
      failMatchId = undefined;
      requests.push({ name, status: 500 });
      return { statusCode: 500, body: JSON.stringify({ message: 'Simulated mid-round failure' }), payload: { message: 'Simulated mid-round failure' } };
    }
    if (!handlers.has(name)) handlers.set(name, loadTs(`netlify/functions/${name}.ts`, overrides).handler);
    const response = await handlers.get(name)({ httpMethod: method, body: payload ? JSON.stringify(payload) : null,
      headers: { authorization: `Bearer ${admin.token}`, cookie }, queryStringParameters: { tourId: tid } });
    requests.push({ name, status: response.statusCode });
    return { ...response, payload: JSON.parse(response.body) };
  }
  function endpoint(...args) {
    const task = runEndpoint(...args);
    pending.add(task);
    task.finally(() => pending.delete(task)).catch(() => {});
    return task;
  }
  const flush = async () => {
    for (let i = 0; i < 30; i++) {
      await act(async () => {
        if (pending.size) await Promise.all([...pending]);
        await new Promise(setImmediate);
      });
      if (!pending.size && i > 0) break;
    }
    assert.equal(pending.size, 0, 'all UI requests completed');
  };
  globalThis.fetch = async (url, init = {}) => {
    const name = String(url).split('/').at(-1).split('?')[0];
    const response = await endpoint(name, init.body ? JSON.parse(init.body) : null, init.method ?? 'GET');
    return new Response(response.body, { status: response.statusCode, headers: response.headers });
  };
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'localStorage']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem('roegusta-admin-session', JSON.stringify(admin));
  const root = createRoot(document.getElementById('root'));
  const { BetMarketCard } = loadTs('src/components/BetMarketCard.tsx');
  const { AdminLiveDesk } = loadTs('src/components/AdminLiveDesk.tsx');
  const { mapBetMarket, mapBetOption, mapPlayer } = loadTs('netlify/functions/_mappers.ts');
  const change = async (node, value) => act(async () => { node.value = value; node.dispatchEvent(new window.Event('change', { bubbles: true })); });
  try {
    // Submit an actual rendered bet card for every player on every round.
    for (const marketRow of snapshot.bet_markets) {
      const market = mapBetMarket({ ...marketRow, status: 'open', closes_at: new Date(Date.now() + 3600000).toISOString() });
      const options = snapshot.bet_options.filter((option) => option.market_id === market.id).map(mapBetOption);
      for (const playerRow of snapshot.players) {
        const player = mapPlayer(playerRow);
        const teamId = snapshot.tour_team_members.find((member) => member.player_id === player.id).team_id;
        const option = options.find((option) => option.linkedPlayerId === player.id || option.linkedTeamId === teamId);
        let saved; let submitError;
        await act(async () => root.render(React.createElement(BetMarketCard, {
          key: `${market.id}:${player.id}`, market, options, bets: [], bettorName: player.displayName,
          onSubmit: async (marketId, optionId, _, stakeAmountPence) => {
            try { saved = await endpoint('public-save-bet', { marketId, optionId, bettorName: player.displayName, stakeAmountPence }); }
            catch (error) { submitError = error; throw error; }
          },
        })));
        const pick = [...document.querySelectorAll('.bet-option-choice-grid button')].find((button) => button.querySelector('span').textContent === option.label);
        await act(async () => pick.click());
        await act(async () => document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
        await flush();
        assert.equal(saved?.statusCode, 200, submitError?.stack ?? JSON.stringify(saved?.payload));
        assert.equal(saved.payload.bet.stakeAmountPence, 1000);
      }
    }
    await db.query("update bet_markets set closes_at=now()-interval '1 minute' where tour_id=$1", [tid]);
    let data = (await endpoint('admin-data', null, 'GET')).payload;
    const props = () => ({ data, tour: data.selectedTour, onHelp: () => {}, onRefresh: async () => {
      data = (await endpoint('admin-data', null, 'GET')).payload;
      root.render(React.createElement(AdminLiveDesk, props()));
    } });
    await act(async () => root.render(React.createElement(AdminLiveDesk, props())));
    for (const round of [...data.rounds]) {
      await change(document.querySelector('.live-desk-header select'), round.id);
      const expectedMatches = snapshot.matches.filter((match) => match.round_id === round.id).sort((a, b) => a.match_number - b.match_number);
      const rows = [...document.querySelectorAll('.live-result-row')];
      assert.equal(rows.length, expectedMatches.length);
      for (let i = 0; i < rows.length; i++) {
        const expected = expectedMatches[i];
        const sideIndex = expected.winning_side === 'A' ? 0 : expected.winning_side === 'halved' ? 1 : 2;
        await act(async () => rows[i].querySelectorAll('.winner-toggle button')[sideIndex].click());
        await change(rows[i].querySelector('.live-result-text select'), expected.result_text);
      }
      if (round.id === data.rounds[0].id) {
        failMatchId = expectedMatches[1].id;
        await act(async () => [...document.querySelectorAll('button')].find((button) => button.textContent === 'Publish round').click());
        await flush();
        assert.match(document.querySelector('.live-desk-actions .form-error').textContent, /Simulated mid-round failure/);
        const partial = await db.query('select id from matches where round_id=$1 and status=$2', [round.id, 'complete']);
        assert.deepEqual(partial.rows.map((match) => match.id), [expectedMatches[0].id]);
        // Refresh after the partial save, as another admin action or reload can do.
        await act(async () => props().onRefresh());
        await flush();
        const remainingRows = [...document.querySelectorAll('.live-result-row')];
        for (let i = 0; i < remainingRows.length; i++) {
          assert.equal(remainingRows[i].querySelector('.live-result-text select').value, expectedMatches[i].result_text);
          assert.ok(remainingRows[i].querySelector('.winner-toggle button.selected'));
        }
      }
      await act(async () => [...document.querySelectorAll('button')].find((button) => button.textContent === 'Publish round').click());
      await flush();
      assert.equal(document.querySelector('.live-desk-actions .form-error'), null);
      assert.ok(data.matches.filter((match) => match.roundId === round.id).every((match) => match.status === 'complete' && match.published));
      const expectedPrize = snapshot.round_prize_results.find((prize) => prize.round_id === round.id);
      await change(document.querySelector('.live-prize-form select'), expectedPrize.winner_player_id ?? expectedPrize.winner_team_id);
      // React tracks text inputs through its native setter.
      const score = document.querySelector('.live-prize-form input');
      await act(async () => {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(score, String(expectedPrize.score_value));
        score.dispatchEvent(new window.Event('input', { bubbles: true }));
      });
      await act(async () => [...document.querySelectorAll('button')].find((button) => button.textContent === 'Publish & settle bets').click());
      await flush();
      assert.equal(document.querySelector('.live-prize-card .form-error')?.textContent, undefined);
      assert.equal(data.betMarkets.find((market) => market.roundId === round.id).status, 'settled');
    }
    assert.deepEqual(data.tourTeamResults.map((result) => result.finalPoints).sort((a, b) => b - a), snapshot.tour_team_results.map((result) => Number(result.final_points)).sort((a, b) => b - a));
    assert.equal(Number((await db.query('select sum(payout_amount_pence) total from bets')).rows[0].total), snapshot.bets.filter((bet) => bet.status === 'active').reduce((sum, bet) => sum + Number(bet.payout_amount_pence), 0));
    assert.equal(requests.filter((request) => request.name === 'public-save-bet' && request.status === 200).length, snapshot.players.length * snapshot.bet_markets.length);
    assert.equal(requests.filter((request) => request.name === 'admin-submit-result' && request.status === 200).length, snapshot.matches.length);
    assert.equal(requests.filter((request) => request.name === 'admin-save-round-prize-result' && request.status === 200).length, 3);
    const completed = await endpoint('admin-save-tour', {
      id: tid, name: data.selectedTour.name, year: data.selectedTour.year,
      startDate: data.selectedTour.startDate, endDate: data.selectedTour.endDate,
      timezone: data.selectedTour.timezone, status: 'complete', isTest: true,
    });
    assert.equal(completed.statusCode, 200, JSON.stringify(completed.payload));
    assert.equal(completed.payload.tour.status, 'complete');
    // Mount the full Admin shell and visit every available workspace/subsection.
    window.scrollTo = () => {};
    const { Admin } = loadTs('src/pages/Admin.tsx');
    await act(async () => root.render(React.createElement(Admin)));
    await flush();
    assert.equal(document.querySelectorAll('.admin-workspace-nav button').length, 6);
    // Use the production Admin loading boundary, not the simplified desk fixture.
    // Saving a prize refreshes Admin while an unrelated match still has edits.
    const liveDesk = document.querySelector('.admin-live-desk');
    assert.ok(liveDesk, document.body.textContent);
    await act(async () => liveDesk.querySelectorAll('.winner-toggle button')[1].click());
    let releaseAdminData;
    holdAdminData = new Promise((done) => { releaseAdminData = done; });
    const refreshRequested = new Promise((done) => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url, init) => {
        if (String(url).includes('/admin-data')) done();
        return originalFetch(url, init);
      };
    });
    await act(async () => {
      document.querySelector('.live-prize-form button').click();
      await refreshRequested;
    });
    assert.equal(document.querySelector('.admin-live-desk'), liveDesk, 'desk stays mounted during refresh');
    assert.equal(liveDesk.parentElement.getAttribute('aria-busy'), 'true');
    assert.ok(liveDesk.parentElement.hasAttribute('inert'), 'writes are disabled while existing data refreshes');
    assert.equal(document.querySelector('.live-result-text select').value, 'AS');
    await act(async () => { holdAdminData = undefined; releaseAdminData(); });
    await flush();
    assert.equal(document.querySelector('.admin-live-desk'), liveDesk);
    assert.equal(document.querySelector('.live-result-text select').value, 'AS', 'prize-triggered refresh keeps the unsaved result');
    failAdminData = true;
    await act(async () => document.querySelector('.live-prize-form button').click());
    await flush();
    assert.equal(document.querySelector('.admin-live-desk'), liveDesk, 'failed refresh also retains the desk');
    assert.ok(liveDesk.parentElement.hasAttribute('inert'), 'stale data cannot be edited after a refresh error');
    await act(async () => [...document.querySelectorAll('button')].find((button) => button.textContent === 'Retry loading admin data').click());
    await flush();
    assert.equal(document.querySelector('.admin-live-desk'), liveDesk);
    assert.equal(document.querySelector('.live-result-text select').value, 'AS', 'retry preserves the unsaved result');
    assert.equal(liveDesk.parentElement.hasAttribute('inert'), false);
    for (let workspace = 0; workspace < 6; workspace++) {
      await act(async () => document.querySelectorAll('.admin-workspace-nav button')[workspace].click());
      await flush();
      const count = document.querySelectorAll('.admin-subsection-nav button').length;
      for (let section = 0; section < count; section++) {
        await act(async () => document.querySelectorAll('.admin-subsection-nav button')[section].click());
        await flush();
        assert.ok(document.body.textContent.trim().length > 100);
      }
    }
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    globalThis.fetch = oldFetch;
    delete globalThis.__tourQaClient;
    if (oldAdminSecret === undefined) delete process.env.ADMIN_SESSION_SECRET; else process.env.ADMIN_SESSION_SECRET = oldAdminSecret;
    if (oldPublicSecret === undefined) delete process.env.TOUR_PUBLIC_ACCESS_SECRET; else process.env.TOUR_PUBLIC_ACCESS_SECRET = oldPublicSecret;
  }
}
