import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './helpers/load-ts.mjs';
const {countsForPlayerStats}=loadTs('src/lib/playerStatsScope.ts');
const {getCompletedMatches,getMatchPlayerResults}=loadTs('src/lib/advancedStats.ts');
const {getStatsBundle,getAdvancedStatsBundle}=loadTs('netlify/functions/_publicData.ts');
const tour={id:'t',name:'2026',year:2026,status:'active',isCurrentPublic:true,rulesVersion:'confirmed-2026'};
const rounds=[['friday','better_ball','contributing'],['par3','scramble','fun'],['saturday','better_ball','matchplay'],['sunday','singles','matchplay'],['monday','scramble','contributing']].map(([id,format,competitionRole],i)=>({id,name:id,holes:18,tourId:'t',format,competitionRole,roundNumber:i+1,published:true,status:'complete'}));
const matches=rounds.map((r)=>({id:r.id,tourId:'t',roundId:r.id,format:r.format,matchNumber:1,status:'complete',published:true,sideATeamId:'a',sideBTeamId:'b',winningSide:'A',pointsAvailable:1,pointsSideA:1,pointsSideB:0}));
const participants=matches.map((m)=>({id:m.id,matchId:m.id,playerId:'p',teamId:'a',side:'A'}));
test('2026 player records count only Saturday better-ball and Sunday singles, while other tours retain their rules',()=>{
 assert.deepEqual(rounds.filter((r)=>countsForPlayerStats(r,tour)).map((r)=>r.id),['saturday','sunday']);
 assert(countsForPlayerStats(rounds[0],{...tour,rulesVersion:undefined,year:2025}));
 const data={tours:[tour],rounds,matches,matchParticipants:participants,playerMatchResults:[]};
 assert.deepEqual(getCompletedMatches(data).map((m)=>m.id),['saturday','sunday']);assert.equal(getMatchPlayerResults(data).length,2);
});
function fakeDb(){
 const snake=(row)=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k.replace(/[A-Z]/g,(c)=>'_'+c.toLowerCase()),v]));
 const tables={tours:[snake(tour)],rounds:rounds.map(snake),matches:matches.map(snake),match_participants:participants.map(snake),historical_player_stats:[],players:[{id:'p',display_name:'Player',active:true,created_at:'2026-01-01'}],tour_players:[],tour_teams:[{id:'a',tour_id:'t',name:'Side A',sort_order:0,published:true},{id:'b',tour_id:'t',name:'Side B',sort_order:1,published:true}],tour_team_members:[],tour_team_results:[],tour_operations:[],tour_competition_awards:[],player_match_results:[]};
 return{from(name){let rows=tables[name]??[];const q={select:()=>q,order:()=>q,limit:()=>q,eq:(key,v)=>{rows=rows.filter((r)=>r[key]===v);return q;},in:(key,vs)=>{rows=rows.filter((r)=>vs.includes(r[key]));return q;},then:(resolve)=>Promise.resolve(resolve({data:rows,error:null}))};return q;}};
}
test('both all-time and advanced public data exclude stray Stableford match records without deleting them',async()=>{
 const db=fakeDb();const simple=await getStatsBundle(db);assert.deepEqual(simple.matches.map((m)=>m.id),['saturday','sunday']);const advanced=await getAdvancedStatsBundle(fakeDb());assert.deepEqual(advanced.matches.map((m)=>m.id),['saturday','sunday']);assert.equal(matches.length,5);
});
