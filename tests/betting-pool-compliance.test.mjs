import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';

test('configured draft pools remain outstanding until their separate minimums are met', () => {
 const betting=loadTs('src/lib/betting.ts');
 const keys=['friday','par3','saturday','sunday','monday','combined'];
 const markets=keys.map((key,i)=>({id:key,poolKey:key,title:key,tourId:'tour',status:'draft',required:true,minimumStakePence:[500,1000,1000,1000,500,500][i]}));
 const bets=[{id:'a',marketId:'friday',bettorName:'Golfer A',status:'active',stakeAmountPence:500},{id:'b',marketId:'par3',bettorName:'Golfer A',status:'active',stakeAmountPence:500},{id:'cancelled',marketId:'sunday',bettorName:'Golfer A',status:'void',outcomeStatus:'void',stakeAmountPence:1000}];
 const people=['Golfer A','Golfer B'];
 const rows=betting.buildBetPuntoBettorSummaries(markets,[],bets,people);
 assert.equal(rows.find((r)=>r.bettorName==='Golfer A').missingMandatoryDays,5);
 assert.equal(rows.find((r)=>r.bettorName==='Golfer B').missingMandatoryDays,6);
 const pools=betting.buildBetPuntoMarketSummaries(markets,[],bets,people);
 assert.deepEqual(pools.find((r)=>r.market.id==='friday').missingBettorNames,['Golfer B']);
 assert.deepEqual(pools.find((r)=>r.market.id==='par3').missingBettorNames,people);
 assert.deepEqual(pools.find((r)=>r.market.id==='sunday').missingBettorNames,people);
 assert.equal(betting.isMandatoryMarket({...markets[0],status:'void'}),false);
 assert.equal(betting.isMandatoryMarket({...markets[0],poolKey:undefined}),false,'historic draft-market rules remain unchanged');
});
