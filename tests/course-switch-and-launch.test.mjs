import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {loadTs} from './helpers/load-ts.mjs';
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/'});
for(const name of ['window','document','navigator','Event','MouseEvent','PopStateEvent','CustomEvent','HTMLElement','localStorage'])Object.defineProperty(globalThis,name,{configurable:true,value:dom.window[name]});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;window.scrollTo=()=>{};
const tour={id:'t',name:'Current tour',year:2026,status:'active',isCurrentPublic:true,rulesVersion:'confirmed-2026',startDate:'2026-11-06',endDate:'2026-11-09',location:'Portugal'};
const {courseGuides}=loadTs('src/data/courseGuides.ts');
const payload={source:'supabase',tour,rounds:[],matches:[],matchParticipants:[],players:[],tourPlayers:[],tourTeams:[{id:'a',tourId:'t',name:'Side A',published:true,sortOrder:0},{id:'b',tourId:'t',name:'Side B',published:true,sortOrder:1}],tourTeamMembers:[],roundPrizeResults:[],scores:[],recentResults:[],openMarkets:[],tourCourses:courseGuides.map((c)=>({...c,id:'saved-'+c.slug,tourId:'t',published:true})),prediction:{status:'awaiting_teams',teamIds:['a','b']}};
test('course pills immediately update the rendered course, active pill, tees and hole; Back follows the URL',async()=>{
 const oldFetch=globalThis.fetch;const oldNow=Date.now;let courseLoads=0;
 globalThis.fetch=async(path)=>{if(path.includes('public-courses'))courseLoads++;return{ok:true,json:async()=>payload};};
 window.history.replaceState(null,'','/courses/faldo');const {AppShell}=loadTs('src/app/AppShell.tsx');const root=createRoot(document.getElementById('root'));
 try{
  await act(async()=>root.render(React.createElement(AppShell)));
  const heading=()=>document.querySelector('.course-guide-hero h2')?.textContent;
  assert.equal(heading(),'Faldo Course');const loads=courseLoads;
  await act(async()=>[...document.querySelectorAll('.hole-number-strip button')].find((b)=>b.textContent==='9').click());
  for(const slug of ['oconnor','old-course','faldo']){
   // The normal four-second response cache has expired, but the mounted guide
   // already has all three courses and should not wait for a new request.
   const timestamp=Date.now();Date.now=()=>timestamp+6000;
   await act(async()=>document.querySelector('.course-switcher a[href="/courses/'+slug+'"]').click());
   assert.equal(window.location.pathname,'/courses/'+slug);assert.equal(heading(),courseGuides.find((c)=>c.slug===slug).name);assert.equal(document.querySelector('.course-switcher a.active').getAttribute('href'),'/courses/'+slug);assert.equal(document.querySelector('.hole-number-strip button[aria-selected=true]').textContent,'1');assert.equal(document.querySelector('.course-tee-switch button[aria-selected=true]').textContent.trim(),'White');
  }
  assert.equal(courseLoads,loads,'course switching uses the loaded course bundle instead of waiting for a refresh');
  await act(async()=>{await new Promise((resolve)=>{window.addEventListener('popstate',resolve,{once:true});window.history.back();});});
  assert.equal(window.location.pathname,'/courses/old-course');assert.equal(heading(),'Old Course');
 }finally{await act(async()=>root.unmount());globalThis.fetch=oldFetch;Date.now=oldNow;window.history.replaceState(null,'','/');}
});
test('a slow first load shows neutral loading copy and never renders placeholder team colours or TBC facts',async()=>{
 const oldFetch=globalThis.fetch;const waiting=[];
 globalThis.fetch=(path)=>path.includes('public-access-check')?Promise.resolve({ok:true}):new Promise((done)=>waiting.push(()=>done({ok:true,json:async()=>payload})));
 window.history.replaceState(null,'','/');const {AppShell}=loadTs('src/app/AppShell.tsx');const root=createRoot(document.getElementById('root'));
 try{
  await act(async()=>root.render(React.createElement(AppShell)));
  assert.match(document.body.textContent,/Loading tour/);assert.doesNotMatch(document.body.textContent,/TBC|Location TBC|Target TBC/);assert.equal(document.querySelector('.score-feature'),null);assert.equal(document.querySelector('.score-team-block'),null);
  await act(async()=>{waiting.splice(0).forEach((finish)=>finish());});
  assert(document.querySelector('.score-feature'));assert.match(document.querySelector('.scoreboard').textContent,/Side A/);assert.match(document.querySelector('.brand-header').textContent,/Current tour/);
 }finally{await act(async()=>root.unmount());globalThis.fetch=oldFetch;}
});

test('restaurant dinner cards open their named location outside the app without changing its route',async()=>{
 const oldFetch=globalThis.fetch;
 const entries=[{id:'sat',itemDate:'2026-11-07',activity:'Dinner at Rare Steakhouse',location:'Vilamoura Marina, 8125-507 Quarteira'},{id:'sun',itemDate:'2026-11-08',activity:'Dinner at Cabana Fresca Restaurant',location:'Tv. Cais Herculano 9, 8200-185 Albufeira'}].map((e)=>({...e,tourId:'t',timeLabel:'20:00',sourceType:'food',sortOrder:10,isPlaceholder:false,notes:'Make your own way from Amendoeira.'}));
 globalThis.fetch=async()=>({ok:true,json:async()=>({...payload,itinerary:entries,itineraryItems:entries,teamDayKit:[],handbookSections:[]})});
 window.history.replaceState(null,'','/info');const {AppShell}=loadTs('src/app/AppShell.tsx');const root=createRoot(document.getElementById('root'));
 try{
  await act(async()=>root.render(React.createElement(AppShell)));
  for(const [weekday,name,address] of [['Sat','Rare Steakhouse','Vilamoura Marina, 8125-507 Quarteira'],['Sun','Cabana Fresca Restaurant','Tv. Cais Herculano 9, 8200-185 Albufeira']]){
   const tab=[...document.querySelectorAll('.itinerary-day-tabs button')].find((b)=>b.textContent.includes(weekday));assert(tab);await act(async()=>tab.click());
   const link=document.querySelector('.itinerary-map-link');assert(link);assert.equal(link.target,'_blank');assert.equal(link.rel,'noopener noreferrer');const url=new URL(link.href);assert.equal(url.origin,'https://www.google.com');assert.equal(url.searchParams.get('api'),'1');assert.equal(url.searchParams.get('query'),`${name}, ${address}, Portugal`);assert.match(document.querySelector('.itinerary-event-list').textContent,/Make your own way/);
   assert.equal(window.location.pathname,'/info');
  }
 }finally{await act(async()=>root.unmount());globalThis.fetch=oldFetch;window.history.replaceState(null,'','/');}
});
