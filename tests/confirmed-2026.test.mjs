import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { loadTs } from './helpers/load-ts.mjs';
import { installConfirmedFixture } from './helpers/install-confirmed-fixture.mjs';
import { pgliteSupabase } from './helpers/pglite-supabase.mjs';
const rules = loadTs('src/lib/tourOperations.ts');
const service = loadTs('netlify/functions/_tourOperations.ts');
const config = JSON.parse(await readFile('tests/fixtures/confirmed-2026.json', 'utf8'));
const tid = config.tourId;
const teams = config.teams;
const side = (id) => teams[config.rosterIds.indexOf(id) < 12 ? 0 : 1];
async function database() {
 const db = new PGlite(); await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema storage; create table storage.buckets(id text primary key,name text,public boolean);');
 for (const file of (await readdir('supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) await db.exec((await readFile('supabase/migrations/'+file,'utf8')).replace(/create extension if not exists pgcrypto;/gi,''));
 await db.query("insert into tours(id,name,year,status,is_current_public,timezone) values($1,'2026 rehearsal',2026,'active',true,'Europe/Lisbon')",[tid]);
 for(const [i,id] of config.rosterIds.entries()) {
 await db.query('insert into players(id,display_name,active) values($1,$2,true)',[id,'Golfer '+String(i+1).padStart(2,'0')]); }
 for(const [i,id]of teams.entries())await db.query('insert into tour_teams(id,tour_id,name,sort_order,published) values($1,$2,$3,$4,true)',[id,tid,'Side '+i,i]);
 const courseIds=[...new Set(config.state.competitions.flatMap((c)=>c.sessions.flatMap((s)=>s.courseId?[s.courseId]:[])))];
 for(const [i,id] of courseIds.entries())await db.query('insert into tour_courses(id,tour_id,slug,name,short_name,holes,published) values($1,$2,$3,$3,$3,$4,true)',[id,tid,'course'+i,JSON.stringify(Array.from({length:18},(_,n)=>({number:n+1,par:4,strokeIndex:n+1}))) ]);
 await installConfirmedFixture(db,config);
 for(const id of config.rosterIds)await db.query('insert into tour_team_members(tour_id,team_id,player_id) values($1,$2,$3)',[tid,side(id),id]);
 return db;
}
function preparedCompetition() {
 const c=structuredClone(config.state.competitions[0]); c.entries=c.entries.map((e,i)=>({...e,playerIds:['a'+i,'b'+i],teamId:teams[i<6?0:1]}));c.entriesPublished=true;
 for(const s of c.sessions){s.teeKey='yellow';s.holeOrder=Array.from({length:9},(_,i)=>i+10);s.customHoles=s.holeOrder.map((number,i)=>({number,par:4,strokeIndex:18-i}));s.handicapSettings={method:'manual_session',confirmed:true};s.handicaps=(s.format==='scramble'?c.entries.map((e)=>e.id):c.entries.flatMap((e)=>e.playerIds)).map((subjectId)=>({subjectId,playingHandicap:0,basisHoles:9}));}
 return c;
}
function fill(c,key,entry,points){const s=c.sessions.find((v)=>v.key===key);const subjects=s.format==='scramble'?[entry.id]:entry.playerIds;for(const id of subjects)for(let i=0;i<s.holeOrder.length;i++)s.scores.push({subjectId:id,hole:s.holeOrder[i],status:'gross',gross:6-points[i]});}
test('actual chronological holes, best ball, pickup, zero points and nine-hole handicap calculations',()=>{
 const c=preparedCompetition(),s=c.sessions[0],e=c.entries[0];fill(c,'friday',e,[2,2,2,2,2,2,2,2,2]);s.scores.find((v)=>v.subjectId===e.playerIds[0]).gross=3;
 assert.equal(rules.sessionStanding(s,e,[]).total,19);s.scores.find((v)=>v.subjectId===e.playerIds[0]&&v.hole===11).status='pickup';s.scores.find((v)=>v.subjectId===e.playerIds[1]&&v.hole===11).gross=9;
 assert.equal(rules.sessionStanding(s,e,[]).complete,9);assert.equal(rules.sessionStanding(s,e,[]).points[1],0);s.scores.find((v)=>v.hole===12).status='unentered';assert.equal(rules.sessionStanding(s,e,[]).complete,8);
 s.handicaps[0].basisHoles=18;assert.equal(rules.playingHandicap(s,e,e.playerIds[0],[]),undefined);
 s.handicapSettings={method:'index_rating',confirmed:true,slope:113,courseRating:36,allowancePercent:100};s.handicaps=[{subjectId:e.playerIds[0],handicapIndex:18}];assert.equal(rules.playingHandicap(s,e,e.playerIds[0],[]),9);
});
test('combined countback uses Monday then Friday and requires an explicit final tie decision',()=>{
 const c=preparedCompetition();c.entries=c.entries.slice(0,2);for(const e of c.entries){fill(c,'friday',e,[2,2,2,2,2,2,2,2,2]);fill(c,'monday',e,[2,2,2,2,2,2,2,2,2]);}
 let rows=rules.competitionStandings(c,[]);assert(rows.every((r)=>r.rank===undefined));
 // Same total; Monday final hole decides after equal last-six and last-three sums.
 const s=c.sessions[1];s.scores.find((v)=>v.subjectId===c.entries[0].id&&v.hole===17).gross=5;s.scores.find((v)=>v.subjectId===c.entries[0].id&&v.hole===18).gross=3;
 rows=rules.competitionStandings(c,[]);assert.equal(rows[0].entry.id,c.entries[0].id);assert.match(rows[0].explanation,/Monday final hole/);
 s.scores.find((v)=>v.hole===17).gross=4;s.scores.find((v)=>v.hole===18).gross=4;
 c.decisions=[{scope:'combined',entryIds:c.entries.map((e)=>e.id).reverse(),reason:'Recorded organiser decision',basis:rules.rankingBasis(c,'combined')}];assert.equal(rules.competitionStandings(c,[])[0].entry.id,c.entries[1].id);
});
test('Monday retains pairs and starts with the highest Friday score; partial Friday blocks ordering',()=>{
 const c=preparedCompetition();assert.throws(()=>rules.mondayOrderPreview(c,[]),/Complete all Friday/);
 c.entries.forEach((e,i)=>fill(c,'friday',e,Array(9).fill(i<4?4:i<8?3:2)));
 c.decisions=[{scope:'friday',entryIds:c.entries.map((e)=>e.id),reason:'Tied Friday order agreed',basis:rules.rankingBasis(c,'friday')}];
 const groups=rules.mondayOrderPreview(c,[]);assert.deepEqual(groups.map((g)=>g.time),['10:00','10:10','10:20','10:30','10:40','10:50']);assert.deepEqual(groups[0].entryIds,c.entries.slice(0,2).map((e)=>e.id));assert.equal(new Set(groups.flatMap((g)=>g.entryIds)).size,12);
});
test('2026 configuration, atomic persistence, six independent defaults, retries, exceptions and settlement gates',async()=>{
 const db=await database();try{
 const client=pgliteSupabase(db);let b=await service.readOperations(client,tid,true);
 assert.equal(b.tourPlayers.filter((p)=>p.attending).length,24);assert.equal(b.state.accommodation.length,6);assert.equal(b.markets.length,6);assert.equal(b.markets.reduce((sum,m)=>sum+m.minimumStakePence,0),4500);
 const op=async(action,payload)=>{b=await service.applyOperationsAction(client,b,action,payload,b.version,'QA organiser');};
 // A missing own pair is an exception, never an arbitrary side selection.
 await db.query('select process_tour_pool_defaults($1,$2)',[tid,'2026-11-06T14:20:00Z']);assert.equal(Number((await db.query("select count(*) from bet_pool_default_checks where status='exception'")).rows[0].count),48);
 assert.equal(Number((await db.query('select count(*) from bets')).rows[0].count),0);
 // Re-open only for this synthetic pre-cutoff rehearsal, then publish valid entries.
 await db.query("update bet_markets set status='open' where tour_id=$1",[tid]);
 for(const c of [...b.state.competitions]){
 const entries=c.entries.map((e,i)=>{const ids=c.entryKind==='individual'?[config.rosterIds[i]]:c.key==='par3'?[config.rosterIds[i],config.rosterIds[i+12]]:config.rosterIds.slice(i*2,i*2+2);return {...e,playerIds:ids,teamId:c.key==='par3'?undefined:side(ids[0])};});
 await op('save_entries',{competitionId:c.id,entries});await op('publish_entries',{competitionId:c.id}); }
 const sat=b.markets.find((m)=>m.poolKey==='saturday'),fri=b.markets.find((m)=>m.poolKey==='friday'),sun=b.markets.find((m)=>m.poolKey==='sunday');
 const person=config.rosterIds[0];const own=b.options.find((o)=>o.marketId===sat.id&&b.state.competitions.find((c)=>c.key==='saturday').entries.find((e)=>e.id===o.linkedEntryId)?.playerIds.includes(person));
 const other=b.options.find((o)=>o.marketId===sat.id&&o.id!==own.id);
 const insert=async(m,opt,pence)=>db.query('select save_public_bet_atomic($1,null,$2)', ['create',JSON.stringify({market_id:m.id,option_id:opt.id,bettor_player_id:person,bettor_name:b.players.find((p)=>p.id===person).displayName,stake_amount_pence:pence,stake_text:'£'+pence/100,public_edit_token_hash:'qa'})]);
 await insert(sat,other,500);await insert(sun,b.options.find((o)=>o.marketId===sun.id&&o.linkedPlayerId!==person),1000);await insert(fri,b.options.find((o)=>o.marketId===fri.id),1000);
 await db.query('select process_tour_pool_defaults($1,$2)',[tid,'2026-11-06T14:20:00Z']);
 assert.equal((await db.query('select status from bet_markets where pool_key=\'par3\'')).rows[0].status,'open','early Friday pools do not close Par 3');
 await db.query('select process_tour_pool_defaults($1,$2)',[tid,'2026-11-09T10:00:00Z']);
 const amount=Number((await db.query("select sum(stake_amount_pence) amount from bets where status='active'")).rows[0].amount);assert.equal(amount,108500,'£1,080 minimum plus £5 extra in Friday pool');
 const auto=(await db.query("select * from bets where market_id=$1 and bettor_player_id=$2 and entry_source='automatic_default'",[sat.id,person])).rows;assert.equal(auto.length,1);assert.equal(auto[0].stake_amount_pence,500);assert.equal(auto[0].option_id,own.id);
 assert.equal(Number((await db.query("select count(*) from bets where market_id=$1 and bettor_player_id=$2 and entry_source='automatic_default'",[sun.id,person])).rows[0].count),0);
 const count=Number((await db.query('select count(*) from bets')).rows[0].count);await Promise.all([db.query('select process_tour_pool_defaults($1,$2)',[tid,'2026-11-09T10:00:10Z']),db.query('select process_tour_pool_defaults($1,$2)',[tid,'2026-11-09T10:00:10Z'])]);assert.equal(Number((await db.query('select count(*) from bets')).rows[0].count),count);
 await db.query("select set_config('roegusta.configure_pool','on',false)");await db.query("update bet_markets set closes_at=clock_timestamp()-interval '1 minute' where id=$1",[sat.id]);
 await assert.rejects(db.query('select admin_settle_bet_market_atomic($1,$2,null)',[sat.id,own.id]),/Complete all relevant/);
 // Friday and Monday persist separately, with one replaceable 39-point contribution.
 const combined=b.state.competitions.find((c)=>c.key==='combined');
 for(const original of combined.sessions){
   const settings={...original,teeKey:'yellow',holeOrder:Array.from({length:9},(_,i)=>i+10),handicapSettings:{method:'manual_session',confirmed:true},handicaps:(original.format==='scramble'?combined.entries.map((e)=>e.id):combined.entries.flatMap((e)=>e.playerIds)).map((subjectId)=>({subjectId,playingHandicap:0,basisHoles:9}))};
   await op('save_session',{competitionId:combined.id,sessionId:original.id,settings});
 }
 let current=b.state.competitions.find((c)=>c.id===combined.id);let friday=current.sessions[0],monday=current.sessions[1];
 const cards=[];for(const [i,e]of current.entries.entries())for(const subjectId of e.playerIds)for(let h=0;h<9;h++){const extra=Math.min(2,Math.max(0,i-h*2));cards.push({subjectId,hole:h+10,status:'gross',gross:4-extra});}
 await op('save_scores',{competitionId:current.id,sessionId:friday.id,scores:cards});
 current=b.state.competitions.find((c)=>c.id===combined.id);const provisional=rules.competitionStandings(current,b.courses);assert(provisional.every((r)=>!r.confirmed&&r.sessions.monday.complete===0));
 await op('save_monday_order',{competitionId:current.id});await op('publish_groups',{competitionId:current.id,sessionId:monday.id});
 current=b.state.competitions.find((c)=>c.id===combined.id);const published=structuredClone(current.sessions[1].groups);assert.equal(published[0].entryIds[0],current.entries[11].id);
 const mondayCards=current.entries.flatMap((e)=>Array.from({length:9},(_,h)=>({subjectId:e.id,hole:h+10,status:'gross',gross:4})));
 await op('save_scores',{competitionId:current.id,sessionId:monday.id,scores:mondayCards});await op('finalise',{competitionId:current.id});
 assert.equal(Number((await db.query('select sum(points) n from tour_competition_awards where active')).rows[0].n),39);
 assert.equal(Number((await db.query('select sum(final_points) n from tour_team_results where tour_id=$1',[tid])).rows[0].n),39);
 // Six Saturday and twelve Sunday match results add exactly eighteen points.
 for(const key of ['saturday','sunday']) {
  const comp=b.state.competitions.find((v)=>v.key===key),session=comp.sessions[0];
  const groups=Array.from({length:6},(_,i)=>({id:session.groups[i].id,number:i+1,entryIds: key==='saturday'?[comp.entries[i].id,comp.entries[i+6].id]:[comp.entries[i*2].id,comp.entries[i*2+12].id,comp.entries[i*2+1].id,comp.entries[i*2+13].id]}));
  await op('save_groups',{competitionId:comp.id,sessionId:session.id,groups});await op('publish_groups',{competitionId:comp.id,sessionId:session.id});
 }
 const matches=(await db.query('select * from matches where tour_id=$1 order by round_id,match_number',[tid])).rows;assert.equal(matches.length,18);
 for(const m of matches)await db.query('select admin_submit_match_result_atomic($1,$2,1,0,$3,true,false,$4,$5)',[tid,m.id,'1 Up','QA','Full rehearsal']);
 assert.deepEqual((await db.query('select final_points,result_status from tour_team_results where tour_id=$1 order by team_id',[tid])).rows.map((r)=>[Number(r.final_points),r.result_status]),[[28.5,'draw'],[28.5,'draw']]);
 assert.equal(Number((await db.query('select count(*) n from player_match_results where tour_id=$1',[tid])).rows[0].n),48,'match statistics contain only Saturday and Sunday');
 const oldOptions=b.options.filter((o)=>o.active&&[fri.id,b.markets.find((m)=>m.poolKey==='combined').id].includes(o.marketId)).map((o)=>o.id).sort();
 const combinedMarket=b.markets.find((m)=>m.poolKey==='combined');
 await db.query("update bet_markets set closes_at=clock_timestamp()-interval '1 minute' where id=$1",[combinedMarket.id]);
 const approval=(await db.query("select state->'poolResults'->$2 approval from tour_operations where tour_id=$1",[tid,combinedMarket.id])).rows[0].approval;
 await db.query('select admin_settle_bet_market_atomic($1,$2,null)',[combinedMarket.id,approval.optionId]);
 assert.equal(Number((await db.query('select sum(payout_amount_pence) n from bets where market_id=$1',[combinedMarket.id])).rows[0].n),12000);
 const correction={...cards[0],gross:cards[0].gross+1};await op('save_scores',{competitionId:current.id,sessionId:friday.id,scores:[correction]});
 current=b.state.competitions.find((c)=>c.id===combined.id);assert.notEqual(current.sessions[1].orderBasis,rules.rankingBasis(current,'friday'));assert.deepEqual(current.sessions[1].groups,published,'published tee sheet is not silently moved');
 assert.equal(Number((await db.query('select coalesce(sum(points),0) n from tour_competition_awards where active')).rows[0].n),0,'correction removes stale confirmed points');
 assert.deepEqual(b.options.filter((o)=>o.active&&[fri.id,b.markets.find((m)=>m.poolKey==='combined').id].includes(o.marketId)).map((o)=>o.id).sort(),oldOptions,'selections survive regrouping and corrections');
 await op('finalise',{competitionId:current.id});assert.equal(Number((await db.query('select sum(points) n from tour_competition_awards where active')).rows[0].n),39,'replacement, never 78');
 const leading=current.entries[11];const changed=cards.find((v)=>v.subjectId===leading.playerIds[0]&&v.hole===10);const changedPartner=cards.find((v)=>v.subjectId===leading.playerIds[1]&&v.hole===10);
 await op('save_scores',{competitionId:current.id,sessionId:friday.id,scores:[{...changed,gross:20},{...changedPartner,gross:20}]});
 const after=(await db.query('select result_option_id from bet_markets where id=$1',[combinedMarket.id])).rows[0];assert.notEqual(after.result_option_id,approval.optionId,'corrected winner replaces settlement');
 assert.equal(Number((await db.query('select sum(payout_amount_pence) n from bets where market_id=$1',[combinedMarket.id])).rows[0].n),12000,'payouts replace rather than accumulate');

 const stale=b.version;await op('save_rooms',{accommodation:b.state.accommodation});await assert.rejects(service.applyOperationsAction(client,b,'save_rooms',{accommodation:b.state.accommodation},stale,'Other organiser'),/Another organiser/);
 const persisted=await service.readOperations(client,tid,true);assert.deepEqual(persisted.state.accommodation,b.state.accommodation);
 // Late discretionary writes are refused against the authoritative DB clock.
 await db.query("select set_config('roegusta.configure_pool','on',false)");await db.query("update bet_markets set closes_at=clock_timestamp()-interval '1 minute',status='open' where id=$1",[sat.id]);await assert.rejects(insert(sat,other,500),/closed/);
 await db.query('select process_due_bet_pools()');assert.equal((await db.query('select status from bet_pool_scheduler_runs order by started_at desc limit 1')).rows[0].status,'succeeded');
 }finally{await db.close();}
});
