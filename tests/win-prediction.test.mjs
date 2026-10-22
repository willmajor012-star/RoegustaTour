import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './helpers/load-ts.mjs';
const {predictTourWin,playerPointEstimate}=loadTs('src/lib/winPrediction.ts');
const {rankingBasis}=loadTs('src/lib/tourOperations.ts');
function fixture(){
 const ids=Array.from({length:24},(_,i)=>'p'+String(i).padStart(2,'0'));
 const session=(key)=>({id:key,key,holes:9,roundId:key,holeOrder:[1,2,3,4,5,6,7,8,9],resultMode:'totals',totals:[],scores:[],handicaps:[],handicapSettings:{},groups:[],format:key==='friday'?'better_ball':'scramble'});
 const entries=Array.from({length:12},(_,i)=>({id:'e'+i,teamId:i<6?'a':'b',playerIds:ids.slice(i*2,i*2+2)}));
 return {tour:{id:'tour',year:2026,rulesVersion:'confirmed-2026'},teams:[{id:'a',sortOrder:0},{id:'b',sortOrder:1}],members:ids.map((playerId,i)=>({playerId,teamId:i<12?'a':'b'})),roster:ids.map((playerId)=>({playerId,attending:true})),rounds:[{id:'sat',competitionRole:'matchplay'},{id:'sun',competitionRole:'matchplay'}],matches:[],participants:[],history:[],historyParticipants:[],historicalStats:[],tourYears:{old:2025},courses:[],awards:[],state:{competitions:[{id:'combined',key:'combined',entryKind:'pair',entries,entriesPublished:true,published:true,sessions:[session('friday'),session('monday')],pointAwards:[6,5.5,5,4.5,4,3.5,3,2.5,2,1.5,1,.5],decisions:[]},{id:'sat',key:'saturday',entries:[],sessions:[{roundId:'sat'}]},{id:'sun',key:'sunday',entries:[],sessions:[{roundId:'sun'}]}]}};
}
const calc=(i,n=4000)=>predictTourWin(i,n);
function match(i,round,number,a,b,pointsA=1,pointsB=0){
 const id=round+number;i.matches.push({id,tourId:'tour',roundId:round,status:'complete',published:true,sideATeamId:'a',sideBTeamId:'b',pointsAvailable:1,pointsSideA:pointsA,pointsSideB:pointsB,winningSide:pointsA===pointsB?'halved':pointsA>pointsB?'A':'B',format:round==='sun'?'singles':'fourball'});
 a.forEach((playerId)=>i.participants.push({matchId:id,playerId,side:'A',teamId:'a'}));b.forEach((playerId)=>i.participants.push({matchId:id,playerId,side:'B',teamId:'b'}));
}
test('complete sides give repeatable balanced predictions before draws; missing and duplicate members block',()=>{
 const i=fixture();i.state.competitions[0].entriesPublished=false;
 const a=calc(i),b=calc(i);assert.deepEqual(a,b);assert.equal(a.status,'ready');assert.equal(a.basis,'teams');assert.equal(a.percentages.reduce((a,b)=>a+b),100);assert(Math.abs(a.percentages[0]-a.percentages[2])<5);
 i.members.pop();assert.equal(calc(i).status,'awaiting_teams');i.members.push(i.members[0]);assert.equal(calc(i).status,'awaiting_teams');
});
test('small samples shrink and strong historical point records move the forecast without handicaps',()=>{
 const blank={won:0,played:0,singlesWon:0,singlesPlayed:0,pairsWon:0,pairsPlayed:0};assert.equal(playerPointEstimate(blank).p,.5);assert.equal(playerPointEstimate({...blank,won:1,played:1}).p,4/7);
 const i=fixture();const base=calc(i);for(const m of i.members)i.historicalStats.push({tourId:'old',playerId:m.playerId,wins:m.teamId==='a'?12:2,draws:2,losses:m.teamId==='a'?2:12});
 const favoured=calc(i);assert(favoured.percentages[0]>base.percentages[0]+10);assert(favoured.percentages[0]<100);
 i.roster.forEach((p)=>p.tourHandicap=-30);assert.deepEqual(calc(i),favoured);
});
test('Friday totals shift the 39-point ranking forecast but do not lock provisional points; partial and zero stay distinct',()=>{
 const i=fixture(),c=i.state.competitions[0];const before=calc(i);c.sessions[0].totals=c.entries.map((e,n)=>({entryId:e.id,stableford:n<6?30:14,completedHoles:9}));
 const friday=calc(i);assert(friday.percentages[0]>before.percentages[0]+25);assert(friday.percentages[0]<100);assert.equal(i.awards.length,0);
 const j=fixture(),s=j.state.competitions[0].sessions[0];s.totals=[{entryId:'e0',stableford:0,completedHoles:9}];const zero=calc(j);s.totals[0].completedHoles=3;assert.notDeepEqual(calc(j),zero);
});
test('Par 3, unpublished draws and room changes do not affect forecast',()=>{
 const i=fixture();i.state.competitions[0].entriesPublished=false;const before=calc(i);
 i.state.competitions[0].entries.reverse();i.state.competitions.push({key:'par3',entries:[{playerIds:['p00']}],sessions:[{totals:[{stableford:9999}]}]});i.state.accommodation=[{name:'Changed'}];assert.deepEqual(calc(i),before);
});
test('confirmed combined points are counted once and 29 points guarantee the win',()=>{
 const i=fixture();i.awards=[{competitionId:'combined',teamId:'a',points:28},{competitionId:'combined',teamId:'b',points:11}];match(i,'sat',1,['p00','p01'],['p12','p13']);assert.deepEqual(calc(i).percentages,[100,0,0]);
 i.matches[0].pointsSideA=0;i.matches[0].pointsSideB=1;i.matches[0].winningSide='B';assert(calc(i).percentages[0]<100);
});
test('completed 57-point tour can finish 28.5 each; corrections replace the prediction',()=>{
 const i=fixture();i.awards=[{competitionId:'combined',teamId:'a',points:19.5},{competitionId:'combined',teamId:'b',points:19.5}];
 for(let n=0;n<6;n++)match(i,'sat',n,['p'+String(n*2).padStart(2,'0'),'p'+String(n*2+1).padStart(2,'0')],['p'+(12+n*2),'p'+(13+n*2)],.5,.5);
 for(let n=0;n<12;n++)match(i,'sun',n,['p'+String(n).padStart(2,'0')],['p'+(12+n)],.5,.5);
 assert.deepEqual(calc(i).percentages,[0,100,0]);i.matches[0].pointsSideA=1;i.matches[0].pointsSideB=0;i.matches[0].winningSide='A';assert.deepEqual(calc(i).percentages,[100,0,0]);
});
test('unresolved completed combined ties stay uncertain; recorded ranking is respected without an award write',()=>{
 const i=fixture(),c=i.state.competitions[0];for(const s of c.sessions)s.totals=c.entries.map((e)=>({entryId:e.id,stableford:20,completedHoles:9}));
 const before=calc(i);assert(before.percentages[0]>20&&before.percentages[2]>20);
 c.decisions=[{scope:'combined',entryIds:c.entries.map((e)=>e.id),reason:'GameBook order',basis:rankingBasis(c,'combined')}];
 const after=calc(i);assert(after.percentages[0]>before.percentages[0]+20);assert.equal(i.awards.length,0);assert(after.percentages[0]<100);
});
test('duplicate match identity and duplicated imported edition do not double count historical form',()=>{
 const i=fixture();i.history=[{id:'old1',tourId:'old',roundId:'old',format:'singles',status:'complete',pointsAvailable:1,pointsSideA:1,pointsSideB:0,winningSide:'A'}];i.historyParticipants=[{matchId:'old1',playerId:'p00',side:'A'},{matchId:'old1',playerId:'p12',side:'B'}];const original=calc(i);
 i.history.push({...i.history[0]});i.historicalStats=[{tourId:'old',playerId:'p00',wins:1,draws:0,losses:0}];assert.deepEqual(calc(i),original);
});
