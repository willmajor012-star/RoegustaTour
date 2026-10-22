import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTs} from './helpers/load-ts.mjs';
const fund=JSON.parse(readFileSync('tests/fixtures/2026-prizes.json','utf8'));
const {mapTour}=loadTs('netlify/functions/_mappers.ts');
const {PrizePayouts}=loadTs('src/components/PrizePayouts.tsx');
test('six confirmed prizes total £960; singles pay five players and all other prizes pay three pairs',()=>{
 const mapped=mapTour({id:'tour',name:'Tour',year:2026,status:'active',prize_fund:fund,created_at:'2026-01-01'}).prizeFund;
 assert(mapped);assert.equal(mapped.rounds.length,6);assert.equal(mapped.rounds.reduce((s,r)=>s+r.payoutsPence.reduce((a,b)=>a+b),0),96000);assert.equal(mapped.contributionPence,undefined);
 const singles=mapped.rounds.find((p)=>p.poolKey==='sunday');assert.deepEqual(singles.payoutsPence,[10000,6000,4000,2500,1500]);assert.equal(singles.paidPer,'player');
 for(const p of mapped.rounds.filter((p)=>p!==singles)){assert.equal(p.payoutsPence.length,3);assert.equal(p.paidPer,'pair');}
 for(const p of mapped.rounds){const html=renderToStaticMarkup(React.createElement(PrizePayouts,{fund:mapped,poolKey:p.poolKey}));assert.match(html,/Cash prizes/);assert.match(html,p.paidPer==='player'?/Per player/:/Per pair/);assert.equal((html.match(/<strong>£/g)||[]).length,p.payoutsPence.length+1);}
 assert.match(renderToStaticMarkup(React.createElement(PrizePayouts,{fund:mapped,poolKey:'combined'})),/Friday and Monday combined/);
 assert.equal(mapped.rounds.find((p)=>p.poolKey==='combined').roundNumber,0,'combined is not a sixth played round');
});
test('legacy prize funds still map without competition keys',()=>{const legacy={contributionPence:1000,rules:[],rounds:[{roundNumber:1,paidPer:'pair',payoutsPence:[1000]}]};assert.equal(mapTour({id:'old',name:'Old',year:2025,status:'complete',prize_fund:legacy}).prizeFund.rounds[0].payoutsPence[0],1000);});
