// Generate a dated reference PDF from an exported DB snapshot and the one-time
// confirmed configuration in an isolated Postgres instance. The live app route
// regenerates from its actual saved records after activation.
import { PGlite } from '@electric-sql/pglite';
import { dirname } from 'node:path';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { loadTs } from '../../tests/helpers/load-ts.mjs';
import { pgliteSupabase } from '../../tests/helpers/pglite-supabase.mjs';
const input = process.argv[2]; const configuration = process.argv[3]; const tourId = process.argv[4]; const output = process.argv[5];
if (!input || !configuration || !tourId || !output) throw new Error('Usage: generate-2026-itinerary.mjs EXPORT.json PRIVATE_CONFIG.sql TOUR_ID OUTPUT.pdf');
const db = new PGlite();
try {
 await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema storage; create table storage.buckets(id text primary key,name text,public boolean);');
 for(const file of (await readdir('supabase/migrations')).filter((f)=>f.endsWith('.sql')).sort())await db.exec((await readFile('supabase/migrations/'+file,'utf8')).replace(/create extension if not exists pgcrypto;/gi,''));
 const snapshot=JSON.parse(await readFile(input,'utf8'));
 for(const [key,table]of Object.entries({tours:'tours',players:'players',roster:'tour_players',sides:'tour_teams',members:'tour_team_members',courses:'tour_courses',rounds:'rounds',markets:'bet_markets',itinerary:'tour_itinerary_items',kit:'tour_team_day_kit'}))for(const row of snapshot[key]??[]){const keys=Object.keys(row);await db.query('insert into '+table+'('+keys.join(',')+') values('+keys.map((_,i)=>'$'+(i+1)).join(',')+')',keys.map((k)=>row[k]&&typeof row[k]==='object'?JSON.stringify(row[k]):row[k]));}
 await db.exec(await readFile(configuration,'utf8'));
 const {readOperations}=loadTs('netlify/functions/_tourOperations.ts');const {createItineraryPdf}=loadTs('netlify/functions/_itineraryPdf.ts');const maps=loadTs('netlify/functions/_mappers.ts');
 const id=tourId;const bundle=await readOperations(pgliteSupabase(db),id);
 const client=pgliteSupabase(db);const rounds=(await client.from('rounds').select('*').eq('tour_id',id).order('round_number')).data.map(maps.mapRound);const items=(await client.from('tour_itinerary_items').select('*').eq('tour_id',id)).data.map(maps.mapTourItineraryItem);
 const kit=(await client.from('tour_team_day_kit').select('*').eq('tour_id',id)).data.map(maps.mapTourTeamDayKit);
 const file=output;await mkdir(dirname(file),{recursive:true});await writeFile(file,await createItineraryPdf(bundle,rounds,items,kit));console.log('Created '+file);
}finally{await db.close();}
