// Offline functional rehearsal. Input is a private read-only production export;
// every mutation below stays inside an ephemeral PGlite database.
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadTs } from '../../tests/helpers/load-ts.mjs';
import { pgliteSupabase } from '../../tests/helpers/pglite-supabase.mjs';

const [input, output] = process.argv.slice(2);
assert(input && output, 'Usage: node scripts/qa/rehearse-configured-2026.mjs PRIVATE_SNAPSHOT.json PRIVATE_REPORT.json');
const exported = JSON.parse(await readFile(input, 'utf8'));
const snapshot = exported.snapshot;
const tid = snapshot.tours[0].id;
assert.equal(snapshot.tours[0].rules_version, 'confirmed-2026');
const evidence = { startedAt: new Date().toISOString(), sourceTourId: tid, checks: [], outstanding: [], requests: [], milestones: {} };
const check = async (name, fn) => { await fn(); evidence.checks.push({ name, status: 'passed' }); console.log('PASS ' + name); };
const db = new PGlite();
const rules = loadTs('src/lib/tourOperations.ts');
const service = loadTs('netlify/functions/_tourOperations.ts');
const publicData = loadTs('netlify/functions/_publicData.ts');
let b, client;
try {
 await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema storage; create table storage.buckets(id text primary key,name text,public boolean);');
 for (const file of (await readdir('supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) await db.exec((await readFile('supabase/migrations/' + file, 'utf8')).replace(/create extension if not exists pgcrypto;/gi, ''));
 const order = ['tours','players','tour_players','tour_teams','tour_team_members','tour_courses','rounds','matches','bet_markets','bet_options','tour_itinerary_items','tour_team_day_kit','tour_handbook_sections','tour_operations','tour_team_results','tour_competition_awards','round_prize_results','bets'];
 for (const table of order) for (const row of snapshot[table] ?? []) {
  const keys = Object.keys(row);
  await db.query(`insert into ${table} (${keys.map((k) => '"' + k + '"').join(',')}) values (${keys.map((_,i) => '$' + (i+1)).join(',')})`, keys.map((k) => row[k] && typeof row[k] === 'object' ? JSON.stringify(row[k]) : row[k]));
 }
 client = pgliteSupabase(db); b = await service.readOperations(client, tid, true);
 const attendees = b.tourPlayers.filter((p) => p.attending).map((p) => p.playerId);
 const originalRooms = structuredClone(b.state.accommodation);
 const combined = () => b.state.competitions.find((c) => c.key === 'combined');
 const comp = (key) => b.state.competitions.find((c) => c.key === key);
 const pool = (key) => b.markets.find((m) => m.poolKey === key);
 const refresh = async () => { b = await service.readOperations(client, tid, true); };
 process.env.ADMIN_SESSION_SECRET = 'ephemeral-functional-rehearsal-admin';
 process.env.TOUR_PUBLIC_ACCESS_SECRET = 'ephemeral-functional-rehearsal-public';
 globalThis.__functional2026Client = client;
 const overrides = { [resolve('netlify/functions/_supabase.ts')]: 'export function createServerSupabaseClient() { return globalThis.__functional2026Client; }' };
 const auth = loadTs('netlify/functions/_adminAuth.ts');
 const access = loadTs('netlify/functions/_publicAccess.ts');
 const admin = await auth.createAdminSession('Isolated 2026 functional test');
 await db.query("insert into public_access_settings(id,password_hash,password_salt,session_version) values('default','isolated-fixture','isolated-fixture',1)");
 const cookie = (await access.createPublicAccessCookie(1)).split(';')[0];
 const handlers = new Map();
 const request = async (name, body, adminAccess = true, method = 'POST') => {
  if (!handlers.has(name)) handlers.set(name, loadTs('netlify/functions/' + name + '.ts', overrides).handler);
  const result = await handlers.get(name)({ httpMethod: method, body: body ? JSON.stringify(body) : null, queryStringParameters: { tourId: tid }, headers: { cookie, ...(adminAccess ? { authorization: 'Bearer ' + admin.token } : {}) } });
  const payload = JSON.parse(result.body); evidence.requests.push({ endpoint: name, status: result.statusCode });
  return { status: result.statusCode, payload };
 };
 const operation = async (action, payload) => {
  const r = await request('admin-tour-operations', { tourId: tid, version: b.version, action, payload });
  assert.equal(r.status, 200, JSON.stringify(r.payload)); b = r.payload;
 };
 const rejectOperation = async (action, payload, expected) => {
  const r = await request('admin-tour-operations', { tourId: tid, version: b.version, action, payload });
  assert.equal(r.status, 409, JSON.stringify(r.payload)); assert.match(r.payload.message, expected);
 };
 const bet = async (key, playerId, amount, optionId) => {
  const r = await request('public-save-bet', { action: 'create', marketId: pool(key).id, optionId: optionId ?? b.options.find((o) => o.marketId === pool(key).id && o.active).id, bettorName: b.players.find((p) => p.id === playerId).displayName, stakeAmountPence: amount }, false);
  assert.equal(r.status, 200, JSON.stringify(r.payload)); return r.payload;
 };
 const amounts = async () => (await db.query("select m.pool_key,coalesce(sum(b.stake_amount_pence) filter(where b.status='active' and b.outcome_status is distinct from 'void'),0)::integer stakes,coalesce(sum(b.payout_amount_pence) filter(where b.status='active'),0)::integer payouts from bet_markets m left join bets b on b.market_id=m.id where m.tour_id=$1 group by m.pool_key", [tid])).rows;
 const changeCutoffForSettlement = async (key) => {
  await db.query("select set_config('roegusta.configure_pool','on',false)");
  await db.query("update bet_markets set closes_at=clock_timestamp()-interval '1 minute' where id=$1", [pool(key).id]);
  await refresh();
 };
 const closeAtOriginalCutoff = async (key) => { await db.query('select process_tour_pool_defaults($1,$2)', [tid, snapshot.bet_markets.find((m) => m.pool_key === key).closes_at]); await refresh(); };
 const confirm = async (key, entryId) => { await changeCutoffForSettlement(key); await operation('set_pool_winner', { competitionId: comp(pool(key).competitionKey).id, marketId: pool(key).id, entryId }); assert.equal(pool(key).status, 'settled'); };

 await check('Actual dates, 24 attendees, handicaps, captains and rooms', async () => {
  assert.equal(attendees.length, 24); assert.equal(b.tour.timezone, 'Europe/Lisbon');
  assert.equal(b.tour.startDate, '2026-11-06'); assert.equal(b.tour.endDate, '2026-11-09');
  assert.equal(b.teams.length, 2); assert(b.teams.every((t) => t.captainPlayerId && attendees.includes(t.captainPlayerId)));
  assert.equal(b.tourPlayers.filter((p) => p.attending && Number.isFinite(p.tourHandicap)).length, 24);
  const occupants = originalRooms.flatMap((u) => u.rooms.flatMap((r) => r.occupants.map((o) => o.playerId)));
  assert.equal(occupants.length, 24); assert.equal(new Set(occupants).size, 24); assert(attendees.every((id) => occupants.includes(id)));
  const missing = attendees.filter((id) => !b.members.some((m) => m.playerId === id));
  evidence.outstanding.push({ item: 'Main-side membership awaiting organiser input', count: missing.length });
  evidence.outstanding.push({ item: 'Unpublished competition draws', competitions: b.state.competitions.filter((c) => !c.entriesPublished).map((c) => c.key) });
 });
 await check('All five sessions use the confirmed formats, front nines, white tees and tee times', async () => {
  const expected = { friday: [9,'14:20',10,'better_ball'], monday: [9,'10:00',10,'scramble'], par3: [18,'19:30',undefined,'scramble'], saturday: [18,'10:00',10,'better_ball'], sunday: [18,'11:24',8,'individual'] };
  for (const s of b.state.competitions.flatMap((c) => c.sessions)) {
   assert.deepEqual([s.holes,s.firstStart,s.teeInterval,s.format],expected[s.key]); assert.equal(s.resultMode,'totals'); assert.equal(s.timezone,'Europe/Lisbon');
   if (['friday','monday'].includes(s.key)) assert.deepEqual(s.holeOrder,[1,2,3,4,5,6,7,8,9]);
   if (s.key !== 'par3') assert.equal(s.teeKey,'white'); else { assert.equal(s.startType,'shotgun'); assert.equal(s.handicapSettings.method,'scratch'); assert(s.groups.every((g) => g.time === '19:30')); }
  }
  assert.equal(comp('par3').pointAwards.length,0); assert.equal(combined().pointAwards.reduce((a,v) => a+v,0),39);
 });
 await check('Six independent minima and Monday combined cutoff are actually configured', async () => {
  const expected = { friday:[500,'2026-11-06T14:20:00.000Z'], par3:[1000,'2026-11-06T19:30:00.000Z'], saturday:[1000,'2026-11-07T10:00:00.000Z'], sunday:[1000,'2026-11-08T11:24:00.000Z'], monday:[500,'2026-11-09T10:00:00.000Z'], combined:[500,'2026-11-09T10:00:00.000Z'] };
  assert.equal(b.markets.length,6); assert.equal(b.markets.reduce((n,m) => n+m.minimumStakePence,0),4500);
  for (const m of b.markets) assert.deepEqual([m.minimumStakePence,new Date(m.closesAt).toISOString()],expected[m.poolKey]);
 });
 await check('Draft pools hide all selections, including the 24 valid Sunday choices', async () => {
  const data = await publicData.getBettingBundle(client); assert.equal(data.betMarkets.length,0); assert.equal(data.betOptions.length,0); assert.equal(data.bets.length,0); assert.equal(data.poolSchedule.length,6);
  assert.equal(b.options.filter((o) => o.marketId === pool('sunday').id && o.active && o.linkedPlayerId).length,24);
  const betting=loadTs('src/lib/betting.ts');const names=attendees.map((id)=>b.players.find((p)=>p.id===id).displayName);
  assert(betting.buildBetPuntoBettorSummaries(b.markets,b.options,[],names).every((r)=>r.missingMandatoryDays===6));
  assert(betting.buildBetPuntoMarketSummaries(b.markets,b.options,[],names).every((r)=>r.missingBettorNames.length===24));
  const r = await request('admin-set-pool-status',{tourId:tid,marketId:pool('friday').id,status:'open'}); assert(r.status>=400); assert.match(r.payload.message,/Publish the competition draw/);
 });
 await check('Missing own pairs produce explicit exceptions and no arbitrary default stakes', async () => {
  await db.exec('begin'); await db.query('select process_tour_pool_defaults($1,$2)',[tid,'2026-11-06T14:20:00Z']);
  assert.equal(Number((await db.query("select count(*) n from bet_pool_default_checks where status='exception'")).rows[0].n),24);
  assert.equal(Number((await db.query('select count(*) n from bets')).rows[0].n),0); await db.exec('rollback');
 });
 await check('Rooms can be moved, renamed and changed in type without affecting golf', async () => {
  const rooms = structuredClone(originalRooms), golf = JSON.stringify(b.state.competitions);
  const moved = rooms[0].rooms[0].occupants.pop(); rooms[1].rooms[1].capacity=3; rooms[1].rooms[1].occupants.push(moved); rooms[1].kind='apartment'; rooms[1].name='Rehearsal apartment';
  await operation('save_rooms',{accommodation:rooms}); assert.equal(JSON.stringify(b.state.competitions),golf); assert.equal(b.state.accommodation[1].rooms[1].occupants.length,3);
  const duplicate=structuredClone(rooms); duplicate[0].rooms[0].occupants.push(moved); await rejectOperation('save_rooms',{accommodation:duplicate},/more than one room/);
  const capacity=structuredClone(rooms); capacity[1].rooms[1].capacity=2; await rejectOperation('save_rooms',{accommodation:capacity},/capacity exceeded/);
  await operation('save_rooms',{accommodation:originalRooms});
 });
 const teams = [...b.teams].sort((a,z) => a.sortOrder-z.sortOrder);
 const rest = attendees.filter((id) => !teams.some((t) => t.captainPlayerId === id));
 const sides = [[teams[0].captainPlayerId,...rest.slice(0,11)],[teams[1].captainPlayerId,...rest.slice(11)]];
 const sideOf = (id) => teams[sides[0].includes(id)?0:1].id;
 await check('Both team lists can be entered through the real admin endpoint', async () => {
  for(let i=0;i<2;i++){const r=await request('admin-save-team-members',{tourId:tid,teamId:teams[i].id,playerIds:sides[i]});assert.equal(r.status,200,JSON.stringify(r.payload));}
  await refresh();assert.equal(b.members.length,24);assert.equal(new Set(b.members.map((m)=>m.playerId)).size,24);
 });
 await check('Competition draws save and publish independently without opening markets', async () => {
  for(const original of [...b.state.competitions]) {
   const entries=original.entries.map((e,i)=>{
    const ids=original.entryKind==='individual'?e.playerIds:original.key==='par3'?[sides[0][i],sides[1][(i+5)%12]]:(i<6?sides[0]:sides[1]).slice((i%6)*2,(i%6)*2+2);
    return {...e,playerIds:ids,teamId:original.key==='par3'?undefined:sideOf(ids[0])};
   });
   await operation('save_entries',{competitionId:original.id,entries});await operation('publish_entries',{competitionId:original.id});
  }
  assert.equal((await publicData.getBettingBundle(client)).betMarkets.length,0);
  assert(comp('par3').sessions[0].groupsPublished); assert.equal(new Set(comp('par3').entries.flatMap((e)=>e.playerIds)).size,24);
  assert(comp('par3').entries.every((e)=>sideOf(e.playerIds[0])!==sideOf(e.playerIds[1])));
 });
 await check('Group publication creates six Saturday matches and twelve Sunday singles only', async () => {
  for(const key of ['combined','saturday','sunday']) {
   const c=comp(key),s=c.sessions[0];
   const groups=Array.from({length:6},(_,i)=>({...s.groups[i],entryIds:key==='sunday'?[sides[0][i*2],sides[1][i*2],sides[0][i*2+1],sides[1][i*2+1]].map((id)=>c.entries.find((e)=>e.playerIds[0]===id).id):[c.entries[i].id,c.entries[i+6].id]}));
   await operation('save_groups',{competitionId:c.id,sessionId:s.id,groups});await operation('publish_groups',{competitionId:c.id,sessionId:s.id});
  }
  assert.equal(Number((await db.query('select count(*) n from matches')).rows[0].n),18);
  assert.deepEqual((await db.query('select format,count(*)::integer n from matches group by format order by format')).rows,[{format:'better_ball',n:6},{format:'singles',n:12}]);
 });
 await check('Each complete published pool opens only by explicit admin action', async () => {
  const priorIds=b.options.filter((o)=>o.active).map((o)=>o.id).sort();
  for(const market of [...b.markets]) {const r=await request('admin-set-pool-status',{tourId:tid,marketId:market.id,status:'open'});assert.equal(r.status,200,JSON.stringify(r.payload));}
  await refresh();const data=await publicData.getBettingBundle(client);assert.equal(data.betMarkets.length,6);assert.equal(data.betOptions.filter((o)=>o.active!==false).length,84);assert.deepEqual(b.options.filter((o)=>o.active).map((o)=>o.id).sort(),priorIds);
 });
 const people=sides.flat();
 await check('Public stakes allow extras and multiple £5 selections but reject other increments', async () => {
  const invalid=await request('public-save-bet',{marketId:pool('friday').id,optionId:b.options.find((o)=>o.marketId===pool('friday').id&&o.active).id,bettorName:b.players.find((p)=>p.id===people[0]).displayName,stakeAmountPence:750},false);assert.equal(invalid.status,400);
  await bet('friday',people[0],1500,b.options.find((o)=>o.marketId===pool('friday').id&&o.linkedEntryId===combined().entries[11].id).id);
  await bet('par3',people[1],500);
  await bet('saturday',people[2],500);await bet('saturday',people[2],500,b.options.find((o)=>o.marketId===pool('saturday').id&&o.linkedEntryId===comp('saturday').entries[11].id).id);
  await bet('monday',people[5],500);
 });
 await check('Bet editing and cancellation update commitments and preserve their audit history', async () => {
  const edited=await bet('saturday',people[3],1000);const changed=await request('public-save-bet',{action:'edit',betId:edited.bet.id,editToken:edited.editToken,optionId:edited.bet.optionId,stakeAmountPence:500},false);assert.equal(changed.status,200,JSON.stringify(changed.payload));
  const cancelled=await bet('sunday',people[4],1000);const voided=await request('public-save-bet',{action:'void',betId:cancelled.bet.id,editToken:cancelled.editToken},false);assert.equal(voided.status,200);assert.equal(voided.payload.bet.status,'void');
  const forbidden=await request('public-save-bet',{action:'edit',betId:edited.bet.id,editToken:'wrong-token',optionId:edited.bet.optionId,stakeAmountPence:500},false);assert.equal(forbidden.status,403);
 });
 let fridayTotals=combined().entries.map((e,i)=>({entryId:e.id,stableford:20+i,completedHoles:9}));
 await check('Incomplete Friday blocks Monday ordering, finalisation and winner confirmation', async () => {
  const c=combined(),s=c.sessions[0];await operation('save_totals',{competitionId:c.id,sessionId:s.id,totals:fridayTotals.slice(0,8)});
  await rejectOperation('save_monday_order',{competitionId:c.id},/Complete all Friday/);await rejectOperation('finalise',{competitionId:c.id},/Complete every session/);
  await rejectOperation('set_pool_winner',{competitionId:c.id,marketId:pool('friday').id,entryId:c.entries[11].id},/completed totals/);
 });
 await check('Saved Friday totals survive reload and project exactly 39 unconfirmed points', async () => {
  const c=combined();await operation('save_totals',{competitionId:c.id,sessionId:c.sessions[0].id,totals:fridayTotals});await refresh();assert.deepEqual(combined().sessions[0].totals,fridayTotals);
  const scores=await publicData.getAdvancedStatsBundle(client);assert.equal(scores.currentTourScores.reduce((n,r)=>n+r.points,0),0);assert.equal(scores.currentTourScores.reduce((n,r)=>n+(r.provisionalPoints??0),0),39);
  const {CompetitionStandings}=loadTs('src/components/PublicCompetition.tsx');const html=renderToStaticMarkup(React.createElement(CompetitionStandings,{competition:combined(),bundle:b}));assert.match(html,/score-provisional/);assert.match(html,/Not started/);assert.match(html,/0\/9 holes/);assert.doesNotMatch(html,/GameBook|enter.*total/i);
  evidence.milestones.afterFriday={confirmed:0,provisional:39,monday:'Not started'};
 });
 await check('Friday cutoff defaults only its own shortfalls; Par 3 and combined remain open', async () => {
  await closeAtOriginalCutoff('friday');assert.equal(pool('friday').status,'closed');assert.equal(pool('par3').status,'open');assert.equal(pool('combined').status,'open');
  const rows=await db.query("select b.bettor_player_id,sum(b.stake_amount_pence)::integer n from bets b where market_id=$1 and status='active' group by bettor_player_id",[pool('friday').id]);assert.equal(rows.rows.length,24);assert.equal(rows.rows.reduce((n,r)=>n+r.n,0),13000);
  assert.equal(Number((await db.query("select count(*) n from bets where market_id=$1 and bettor_player_id=$2 and entry_source='automatic_default'",[pool('friday').id,people[0]])).rows[0].n),0);
  await confirm('friday',combined().entries[11].id);assert.equal(pool('combined').status,'open');
  await bet('combined',people[0],1000);
 });
 await check('Monday order retains all pair identities and sends the highest Friday scores first', async () => {
  const c=combined(),s=c.sessions[1];await operation('save_monday_order',{competitionId:c.id});await operation('publish_groups',{competitionId:c.id,sessionId:s.id});
  assert.deepEqual(combined().sessions[1].groups.flatMap((g)=>g.entryIds),c.entries.map((e)=>e.id).reverse());assert.deepEqual(combined().sessions[1].groups.map((g)=>g.time),['10:00','10:10','10:20','10:30','10:40','10:50']);
 });
 await check('Friday corrections flag the published Monday order and require explicit republishing', async () => {
  const c=combined(),s=c.sessions[1],groups=structuredClone(s.groups),ids=b.options.filter((o)=>o.active).map((o)=>o.id).sort();
  await operation('save_totals',{competitionId:c.id,sessionId:c.sessions[0].id,totals:fridayTotals.map((t,i)=>i===0?{...t,stableford:40}:t)});
  assert.notEqual(combined().sessions[1].orderBasis,rules.rankingBasis(combined(),'friday'));assert.deepEqual(combined().sessions[1].groups,groups);await rejectOperation('publish_groups',{competitionId:c.id,sessionId:s.id},/Friday scores changed/);
  await operation('save_monday_order',{competitionId:c.id});await operation('publish_groups',{competitionId:c.id,sessionId:s.id});assert.equal(combined().sessions[1].groups[0].entryIds[0],c.entries[0].id);
  await operation('save_totals',{competitionId:c.id,sessionId:c.sessions[0].id,totals:fridayTotals});await operation('save_monday_order',{competitionId:c.id});await operation('publish_groups',{competitionId:c.id,sessionId:s.id});
  assert.deepEqual(b.options.filter((o)=>o.active).map((o)=>o.id).sort(),ids);await confirm('friday',c.entries[11].id);
 });
 await check('Published draws cannot be accidentally redrawn after bets or scores', async () => {
  const c=combined(),entries=structuredClone(c.entries);[entries[0].playerIds[0],entries[1].playerIds[0]]=[entries[1].playerIds[0],entries[0].playerIds[0]];await rejectOperation('save_entries',{competitionId:c.id,entries,confirmRedraw:true},/cannot be redrawn/);
 });
 await check('Par 3 shortfall adds £5 only, its 18-hole result has no tour points or match statistics', async () => {
  await closeAtOriginalCutoff('par3');const c=comp('par3'),s=c.sessions[0];await operation('save_totals',{competitionId:c.id,sessionId:s.id,totals:c.entries.map((e,i)=>({entryId:e.id,stableford:30+i,completedHoles:18}))});await confirm('par3',c.entries[11].id);
  const added=(await db.query("select stake_amount_pence from bets where market_id=$1 and bettor_player_id=$2 and entry_source='automatic_default'",[pool('par3').id,people[1]])).rows;assert.deepEqual(added,[{stake_amount_pence:500}]);
  assert.equal(Number((await db.query('select count(*) n from tour_competition_awards where active')).rows[0].n),0);assert.equal(Number((await db.query('select count(*) n from player_match_results')).rows[0].n),0);
 });
 await check('Saturday two £5 picks meet its minimum; an edited £5 pick defaults only another £5', async () => {
  await closeAtOriginalCutoff('saturday');
  assert.equal(Number((await db.query("select count(*) n from bets where market_id=$1 and bettor_player_id=$2 and entry_source='automatic_default'",[pool('saturday').id,people[2]])).rows[0].n),0);
  assert.equal((await db.query("select stake_amount_pence from bets where market_id=$1 and bettor_player_id=$2 and entry_source='automatic_default'",[pool('saturday').id,people[3]])).rows[0].stake_amount_pence,500);
 });
 const finishMatches=async(key)=>{
  const c=comp(key),matches=(await db.query('select * from matches where round_id=$1 order by match_number',[c.sessions[0].roundId])).rows;
  for(const [i,m]of matches.entries())await db.query('select admin_submit_match_result_atomic($1,$2,$3,$4,$5,true,false,$6,$7)',[tid,m.id,m.side_a_team_id===teams[0].id?1:0,m.side_b_team_id===teams[0].id?1:0,i===0&&key==='saturday'?'7 & 6':'1 Up','Isolated QA','Functional rehearsal']);
 };
 await check('An early Saturday match finish remains independent of its full 18-hole Stableford total', async () => {
  await finishMatches('saturday');await refresh();const c=comp('saturday'),s=c.sessions[0];assert.equal(s.totals.length,0);
  await operation('save_totals',{competitionId:c.id,sessionId:s.id,totals:c.entries.map((e,i)=>({entryId:e.id,stableford:36+i,completedHoles:18}))});await confirm('saturday',c.entries[11].id);
  assert.equal(Number((await db.query('select sum(final_points) n from tour_team_results')).rows[0].n),6);assert.equal(Number((await db.query('select count(*) n from player_match_results')).rows[0].n),24);
 });
 await check('Sunday defaults cancelled commitments onto the individual and settles individual results only', async () => {
  await closeAtOriginalCutoff('sunday');const m=pool('sunday'),auto=(await db.query("select b.stake_amount_pence,o.linked_player_id from bets b join bet_options o on o.id=b.option_id where b.market_id=$1 and b.bettor_player_id=$2 and b.entry_source='automatic_default'",[m.id,people[4]])).rows[0];assert.deepEqual(auto,{stake_amount_pence:1000,linked_player_id:people[4]});
  await finishMatches('sunday');await refresh();const c=comp('sunday');await operation('save_totals',{competitionId:c.id,sessionId:c.sessions[0].id,totals:c.entries.map((e,i)=>({entryId:e.id,stableford:30+i,completedHoles:18}))});await confirm('sunday',c.entries[23].id);
  assert.equal(Number((await db.query('select count(*) n from player_match_results')).rows[0].n),48);assert.equal(Number((await db.query('select sum(final_points) n from tour_team_results')).rows[0].n),18);
 });
 await check('Monday and combined close together on Monday; six minima total £1,080 plus all extras', async () => {
  await closeAtOriginalCutoff('monday');const totals=await amounts();assert.equal(totals.reduce((n,r)=>n+r.stakes,0),109500);assert.deepEqual(Object.fromEntries(totals.map((r)=>[r.pool_key,r.stakes])),{friday:13000,par3:24000,saturday:24000,sunday:24000,monday:12000,combined:12500});
  assert.equal(Number((await db.query("select count(*) n from (select m.id,tp.player_id,m.minimum_stake_pence,coalesce(sum(b.stake_amount_pence) filter(where b.status='active' and b.outcome_status is distinct from 'void'),0) amount from bet_markets m join tour_players tp on tp.tour_id=m.tour_id and tp.attending left join bets b on b.market_id=m.id and b.bettor_player_id=tp.player_id group by m.id,tp.player_id) v where amount<minimum_stake_pence")).rows[0].n),0);
  evidence.milestones.betting={minimumPence:108000,actualPence:109500,extraPence:1500,pools:totals};
 });
 await check('Concurrent retries add no duplicate automatic stakes or extra commitments', async () => {
  const before=(await db.query('select count(*)::integer n,sum(stake_amount_pence)::integer amount from bets')).rows[0];await Promise.all([db.query('select process_tour_pool_defaults($1,$2)',[tid,'2026-11-09T10:02:00Z']),db.query('select process_tour_pool_defaults($1,$2)',[tid,'2026-11-09T10:02:00Z'])]);assert.deepEqual((await db.query('select count(*)::integer n,sum(stake_amount_pence)::integer amount from bets')).rows[0],before);
  assert.equal(Number((await db.query("select count(*) n from (select market_id,bettor_player_id,count(*) from bets where entry_source='automatic_default' and status='active' group by market_id,bettor_player_id having count(*)>1) v")).rows[0].n),0);
 });
 const mondayTotals=()=>combined().entries.map((e)=>({entryId:e.id,stableford:18,completedHoles:9}));
 await check('Partial Monday results show unequal completion and cannot be finalised or settled', async () => {
  const c=combined(),s=c.sessions[1];await operation('save_totals',{competitionId:c.id,sessionId:s.id,totals:[...mondayTotals().slice(0,3),{entryId:c.entries[3].id,stableford:8,completedHoles:4}]});
  await rejectOperation('finalise',{competitionId:c.id},/Complete every session/);await rejectOperation('set_pool_winner',{competitionId:c.id,marketId:pool('monday').id,entryId:c.entries[0].id},/completed totals/);
  const {CompetitionStandings}=loadTs('src/components/PublicCompetition.tsx');const html=renderToStaticMarkup(React.createElement(CompetitionStandings,{competition:combined(),bundle:b}));assert.match(html,/4\/9 holes/);assert.match(html,/Not started/);assert.match(html,/9\/9 holes/);
 });
 await check('Completed zero totals survive reopening and remain distinct from unentered totals', async () => {
  const c=combined(),s=c.sessions[1],totals=mondayTotals();totals[0].stableford=0;await operation('save_totals',{competitionId:c.id,sessionId:s.id,totals});await refresh();const standing=rules.sessionStanding(combined().sessions[1],combined().entries[0],b.courses);assert.equal(standing.total,0);assert.equal(standing.complete,9);assert.equal(standing.started,true);
  await operation('save_totals',{competitionId:c.id,sessionId:s.id,totals:mondayTotals()});
 });
 await check('Combined countback uses Monday totals; unresolved imported ties require an admin decision', async () => {
  const clone=structuredClone(combined());clone.sessions[1].totals[10].stableford=19;const comparison=rules.competitionStandings(clone,b.courses);assert.equal(comparison[0].entry.id,clone.entries[10].id);assert.match(comparison[0].explanation,/Monday/);
  fridayTotals=fridayTotals.map((t,i)=>i===10?{...t,stableford:31}:t);const c=combined();await operation('save_totals',{competitionId:c.id,sessionId:c.sessions[0].id,totals:fridayTotals});await rejectOperation('finalise',{competitionId:c.id},/resolve all countback ties/);
  const order=c.entries.map((e)=>e.id).reverse();await operation('ranking_decision',{competitionId:c.id,scope:'combined',entryIds:order,reason:'GameBook final countback order'});await operation('ranking_decision',{competitionId:c.id,scope:'friday',entryIds:order,reason:'GameBook Friday order'});await operation('save_monday_order',{competitionId:c.id});await operation('publish_groups',{competitionId:c.id,sessionId:c.sessions[1].id});
 });
 await check('Standalone pool winners are confirmed manually and stay separate from the combined tour ranking', async () => {
  await confirm('friday',combined().entries[10].id);await confirm('monday',combined().entries[0].id);await confirm('combined',combined().entries[10].id);
  assert.equal(rules.competitionStandings(combined(),b.courses)[0].entry.id,combined().entries[11].id);
  assert.equal(pool('combined').resultOptionId,b.options.find((o)=>o.marketId===pool('combined').id&&o.linkedEntryId===combined().entries[10].id).id);
 });
 await check('Finalisation awards 39 once, all rounds total 57, and 28.5 each is a draw', async () => {
  await operation('finalise',{competitionId:combined().id});await operation('finalise',{competitionId:combined().id});
  assert.equal(Number((await db.query('select sum(points) n from tour_competition_awards where active')).rows[0].n),39);const scores=(await db.query('select final_points,result_status from tour_team_results order by team_id')).rows;assert.deepEqual(scores.map((r)=>[Number(r.final_points),r.result_status]),[[28.5,'draw'],[28.5,'draw']]);
  const data=await publicData.getAdvancedStatsBundle(client);assert.equal(data.currentTourScores.reduce((n,r)=>n+r.points,0),57);assert.equal(data.currentTourScores.reduce((n,r)=>n+(r.provisionalPoints??0),0),0);
  evidence.milestones.finalScore={total:57,sides:[28.5,28.5],result:'draw',confirmedCombined:39,matchplay:18};
 });
 await check('All six settlements conserve the ledger and repeated confirmations do not duplicate payouts', async () => {
  const count=Number((await db.query('select count(*) n from bets')).rows[0].n),totals=await amounts();assert(totals.every((r)=>r.stakes===r.payouts));assert.equal(totals.reduce((n,r)=>n+r.payouts,0),109500);
  await confirm('combined',combined().entries[10].id);await confirm('combined',combined().entries[11].id);assert.equal(Number((await db.query('select count(*) n from bets')).rows[0].n),count);assert((await amounts()).every((r)=>r.stakes===r.payouts));
 });
 await check('Post-finalisation score corrections replace awards and invalidate affected pool confirmations', async () => {
  const c=combined(),before=Number((await db.query('select count(*) n from bets')).rows[0].n);await operation('save_totals',{competitionId:c.id,sessionId:c.sessions[0].id,totals:fridayTotals.map((t,i)=>i===11?{...t,stableford:0}:t)});
  assert.equal(Number((await db.query('select coalesce(sum(points),0) n from tour_competition_awards where active')).rows[0].n),0);assert.equal(pool('combined').status,'closed');assert.equal(b.state.poolResults[pool('combined').id].ready,false);
  await confirm('combined',c.entries[10].id);await operation('finalise',{competitionId:c.id});assert.equal(Number((await db.query('select sum(points) n from tour_competition_awards where active')).rows[0].n),39);assert.equal(Number((await db.query('select count(*) n from bets')).rows[0].n),before);
 });
 await check('Late discretionary entries are rejected even if a scheduler has not changed market status', async () => {
  const m=pool('combined');await db.query("update bet_markets set status='open' where id=$1",[m.id]);
  await assert.rejects(db.query('select save_public_bet_atomic($1,null,$2)',['create',JSON.stringify({market_id:m.id,option_id:b.options.find((o)=>o.marketId===m.id&&o.active).id,bettor_player_id:people[0],bettor_name:'Rehearsal',stake_amount_pence:500,public_edit_token_hash:'isolated'})]),/closed/i);
  await db.query("update bet_markets set status='closed' where id=$1",[m.id]);
 });
 await check('Optimistic concurrency rejects a stale admin save without overwriting scores', async () => {
  const version=b.version;await operation('save_rooms',{accommodation:originalRooms});const result=await request('admin-tour-operations',{tourId:tid,version,action:'save_rooms',payload:{accommodation:[]}});assert.equal(result.status,409);assert.match(result.payload.message,/Another organiser/);await refresh();assert.deepEqual(b.state.accommodation,originalRooms);
 });
 await check('Scheduler catch-up executes without a browser and records a successful run', async () => {
  await db.query('select process_due_bet_pools()');assert.equal((await db.query('select status from bet_pool_scheduler_runs order by started_at desc limit 1')).rows[0].status,'succeeded');
 });
 evidence.finishedAt=new Date().toISOString();evidence.status='passed';
} catch(error) { evidence.status='failed';evidence.error=error.stack;console.error(error);process.exitCode=1; }
finally { await writeFile(output,JSON.stringify(evidence,null,2));await db.close();delete globalThis.__functional2026Client; }
