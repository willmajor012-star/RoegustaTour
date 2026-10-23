import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument,PDFName,PDFString} from 'pdf-lib';
import {loadTs} from './helpers/load-ts.mjs';
const {createItineraryPdf}=loadTs('netlify/functions/_itineraryPdf.ts');
const bundle={tour:{id:'t',name:'Tour itinerary',year:2026,startDate:'2026-11-06',endDate:'2026-11-09'},teams:[],state:{accommodation:[],competitions:[]},markets:[]};
const rows=['2026-11-06','2026-11-07','2026-11-08','2026-11-09'].map((date,i)=>({id:String(i),tourId:'t',itemDate:date,timeLabel:'20:00',activity:i===1?'Dinner at Rare Steakhouse':i===2?'Dinner at Cabana Fresca Restaurant':'Dinner at the resort',location:i===1?'Vilamoura Marina, Quarteira':i===2?'Tv. Cais Herculano 9, Albufeira':'Amendoeira Golf Resort',sourceType:'food',isPlaceholder:false,sortOrder:i}));
test('downloadable itinerary embeds real external map links for both restaurants',async()=>{
 const pdf=await PDFDocument.load(await createItineraryPdf(bundle,[],rows));assert.equal(pdf.getPageCount(),2);
 const links=pdf.getPages().flatMap((page)=>{const arr=page.node.Annots();return arr?arr.asArray().map((ref)=>{const action=pdf.context.lookup(ref).lookup(PDFName.of('A'));return action.lookup(PDFName.of('URI'),PDFString).decodeText();}):[];});
 assert.equal(links.length,2);const queries=links.map((link)=>{const url=new URL(link);assert.equal(url.origin,'https://www.google.com');assert.equal(url.searchParams.get('api'),'1');return url.searchParams.get('query');});assert.deepEqual(queries,['Rare Steakhouse, Vilamoura Marina, Quarteira, Portugal','Cabana Fresca Restaurant, Tv. Cais Herculano 9, Albufeira, Portugal']);
});
test('a longer edited programme falls back to paginated full-width text',async()=>{
 const long=rows.map((r)=>({...r,notes:Array(100).fill('Restaurant information with a longer address and travel details.').join(' ')}));
 const pdf=await PDFDocument.load(await createItineraryPdf(bundle,[],long));assert(pdf.getPageCount()>2);
});
