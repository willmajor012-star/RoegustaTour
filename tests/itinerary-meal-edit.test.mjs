import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {loadTs} from './helpers/load-ts.mjs';
const {handler}=loadTs('netlify/functions/admin-save-itinerary-item.ts',{
 [resolve('netlify/functions/_adminSupabase.ts')]:`export const withAdminSupabase=(e,m,fn)=>fn(e.db,e.body,{});export const optionalString=v=>typeof v==='string'?v.trim():undefined;export const badRequest=message=>({statusCode:400,body:message});export const runSingle=async q=>q;`,
 [resolve('netlify/functions/_adminAuth.ts')]:`export const jsonResponse=(statusCode,body)=>({statusCode,body:JSON.stringify(body)});`,
 [resolve('netlify/functions/_audit.ts')]:`export const writeAuditLog=async()=>{};`,
});
test('editing meals preserves relative timing, saves finite ordering and keeps strict flight times',async()=>{
 let saved;const db={from:()=>({update:(values)=>{saved={id:'meal',...values};const q={eq:()=>q,select:()=>q,single:async()=>saved};return q;}})};
 const body={id:'meal',tourId:'t',itemDate:'2026-11-06',activity:'Lunch at the resort',sourceType:'food',isPlaceholder:false};
 for(const [label,order] of [['On arrival',1440],['Before Par 3',1440],['20:00',1200]]){
  const result=await handler({db,body:{...body,timeLabel:label}});assert.equal(result.statusCode,200);assert.equal(saved.time_label,label);assert.equal(saved.sort_order,order);assert.equal(JSON.parse(result.body).itineraryItem.timeLabel,label);
 }
 for(const [sourceType,timeLabel]of [['flight','On arrival'],['travel','Before Par 3'],['food','25:00'],['food','any old note']]){
  const previous=saved;const result=await handler({db,body:{...body,sourceType,timeLabel}});assert.equal(result.statusCode,400);assert.equal(saved,previous);
 }
});
