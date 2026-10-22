import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migrationPath = 'supabase/migrations/202610200001_friday_launch_hardening.sql';
const tour = '10000000-0000-0000-0000-000000000001';
const round = '20000000-0000-0000-0000-000000000001';
const teamA = '30000000-0000-0000-0000-000000000001';
const teamB = '30000000-0000-0000-0000-000000000002';
const playerA = '40000000-0000-0000-0000-000000000001';
const playerB = '40000000-0000-0000-0000-000000000002';
const match = '50000000-0000-0000-0000-000000000001';
const callResult = (a, b, margin, clear = false) => `select public.admin_submit_match_result_atomic('${tour}', '${match}', ${a}, ${b}, '${margin}', true, ${clear}, 'Launch QA', 'Test correction')`;

test('fresh migration chain and launch security/result transactions execute in Postgres', async (t) => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; alter default privileges in schema public grant execute on functions to anon,authenticated,service_role; create schema storage; create table storage.buckets(id text primary key, name text, public boolean);');
    const files = (await readdir('supabase/migrations')).filter((name) => name.endsWith('.sql')).sort();
    for (const file of files) {
      // PGlite has core gen_random_uuid(). Supabase supplies pgcrypto; its other
      // functions are not needed by these migrations or this isolated rehearsal.
      const sql = (await readFile(`supabase/migrations/${file}`, 'utf8')).replace(/create extension if not exists pgcrypto;/gi, '');
      try { await db.exec(sql); } catch (error) { throw new Error(`Migration ${file}: ${error.message}`); }
    }
    await db.exec(await readFile(migrationPath, 'utf8'));
    await db.exec(`
      insert into tours(id, name, year, start_date, end_date, status, is_current_public) values ('${tour}', 'QA TEST TOUR launch', 2090, '2090-11-06', '2090-11-09', 'active', true);
      insert into players(id, display_name) values ('${playerA}', 'QA A'), ('${playerB}', 'QA B');
      insert into tour_teams(id,tour_id,name,published) values ('${teamA}','${tour}','QA A',true), ('${teamB}','${tour}','QA B',true);
      insert into rounds(id,tour_id,round_number,name,format,status,holes,published) values ('${round}','${tour}',1,'QA round','singles','active',9,true);
      insert into matches(id,tour_id,round_id,match_number,format,status,side_a_team_id,side_b_team_id,points_available) values ('${match}','${tour}','${round}',1,'singles','active','${teamA}','${teamB}',1);
      insert into match_participants(match_id,player_id,team_id,side) values ('${match}','${playerA}','${teamA}','A'), ('${match}','${playerB}','${teamB}','B');
    `);
    await t.test('all 25 app tables enable RLS and browser roles lack direct privileges', async () => {
      const { rows } = await db.query("select relname, relrowsecurity, has_table_privilege('anon', oid, 'SELECT') as anon_read, has_table_privilege('authenticated', oid, 'UPDATE') as user_write from pg_class where relnamespace='public'::regnamespace and relkind='r'");
      assert.equal(rows.length, 25);
      for (const row of rows) {
        assert.equal(row.relrowsecurity, true, row.relname);
        assert.equal(row.anon_read, false, row.relname);
        assert.equal(row.user_write, false, row.relname);
      }
      const { rows: privileges } = await db.query("select proname, has_function_privilege('anon', p.oid, 'EXECUTE') as can_write, has_function_privilege('authenticated', p.oid, 'EXECUTE') as user_write from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (proname like 'admin_%' or proname in ('apply_bet_defaults_atomic','save_public_bet_atomic'))");
      assert.equal(privileges.length, 11);
      for (const row of privileges) {
        assert.equal(row.can_write, false, row.proname);
        assert.equal(row.user_write, false, row.proname);
      }
      await db.exec('grant usage on schema public to service_role; grant all on all tables in schema public to service_role; set role service_role;');
      assert.equal((await db.query('select count(*)::integer as count from players')).rows[0].count, 2);
      await db.exec('reset role;');
    });
    await t.test('invalid results roll back without changing the match', async () => {
      for (const args of [[1,0,'AS'], [.5,.5,'2 & 1'], [.75,.25,'1 Up'], [1,0,'10 & 8'], [-1,2,'1 Up']]) {
        await assert.rejects(db.query(callResult(...args)));
      }
      assert.equal((await db.query(`select status from matches where id='${match}'`)).rows[0].status, 'active');
    });
    await t.test('save, correction and clear keep player and team totals consistent', async () => {
      await db.query(callResult(1,0,'3 & 2'));
      await db.query(callResult(1,0,'3 & 2'));
      assert.equal((await db.query('select count(*)::integer as count from player_match_results')).rows[0].count, 2);
      assert.equal(Number((await db.query(`select final_points from tour_team_results where team_id='${teamA}'`)).rows[0].final_points), 1);
      await db.query(callResult(.5,.5,'AS'));
      assert.equal(Number((await db.query(`select final_points from tour_team_results where team_id='${teamA}'`)).rows[0].final_points), .5);
      assert.deepEqual((await db.query('select distinct result from player_match_results')).rows, [{ result: 'draw' }]);
      await db.query(callResult(0,0,'',true));
      assert.equal((await db.query('select count(*)::integer as count from player_match_results')).rows[0].count, 0);
      assert.equal(Number((await db.query(`select sum(final_points) as total from tour_team_results`)).rows[0].total), 0);
      assert.equal((await db.query('select count(*)::integer as count from audit_log')).rows[0].count, 4);
    });
    await t.test('roster replacement is atomic and protects existing match pairings', async () => {
      await db.exec(`insert into tour_players(tour_id,player_id,attending) values ('${tour}','${playerA}',true), ('${tour}','${playerB}',true)`);
      const callRoster = (ids) => `select public.admin_save_team_members_atomic('${tour}','${teamA}',array[${ids.map((id) => `'${id}'::uuid`).join(',')}])`;
      await db.query(callRoster([playerA]));
      const before = (await db.query('select * from tour_team_members')).rows;
      await assert.rejects(db.query(callRoster([playerB])), /affected match pairings/);
      assert.deepEqual((await db.query('select * from tour_team_members')).rows, before);
      await db.exec(`create function public.qa_fail_roster() returns trigger language plpgsql as $$ begin raise exception 'Simulated insert failure'; end $$;
        create trigger qa_fail_roster before insert on tour_team_members for each row execute function public.qa_fail_roster();`);
      await assert.rejects(db.query(callRoster([playerA])), /Simulated insert failure/);
      assert.deepEqual((await db.query('select * from tour_team_members')).rows, before);
      await db.exec('drop trigger qa_fail_roster on tour_team_members; drop function public.qa_fail_roster();');
    });
    await t.test('daily defaults top up once across same-day rounds and settlement preserves the pot', async () => {
      const market1 = '60000000-0000-0000-0000-000000000001';
      const market2 = '60000000-0000-0000-0000-000000000002';
      const round2 = '20000000-0000-0000-0000-000000000002';
      const options = [1,2,3,4].map((n) => `70000000-0000-0000-0000-00000000000${n}`);
      await db.exec(`update rounds set round_date='2090-11-06' where id='${round}';
        insert into rounds(id,tour_id,round_number,name,format,status,round_date,published) values ('${round2}','${tour}',2,'PM round','singles','planned','2090-11-06',true);
        insert into bet_markets(id,tour_id,round_id,title,market_type,market_scope,status,required,closes_at) values
          ('${market1}','${tour}','${round}','AM','player_performance','general_pot','open',true,'2090-11-06T09:00Z'),
          ('${market2}','${tour}','${round2}','PM','player_performance','general_pot','open',true,'2090-11-06T13:00Z');
        insert into bet_options(id,market_id,label,linked_player_id) values
          ('${options[0]}','${market1}','A','${playerA}'),('${options[1]}','${market1}','B','${playerB}'),
          ('${options[2]}','${market2}','A','${playerA}'),('${options[3]}','${market2}','B','${playerB}');`);
      const publicPick = { market_id: market1, option_id: options[0], bettor_name: 'QA A', bettor_player_id: playerA,
        stake_text: '£5', stake_amount_pence: 500, public_edit_token_hash: 'qa-private-token-hash' };
      const created = await db.query('select save_public_bet_atomic($1,null,$2::jsonb) as bet', ['create', JSON.stringify(publicPick)]);
      const betId = created.rows[0].bet.id;
      await assert.rejects(db.query('select save_public_bet_atomic($1,$2,$3::jsonb)', ['edit', betId, JSON.stringify({ ...publicPick, public_edit_token_hash: 'wrong' })]), /edit token/);
      const runDefaults = () => db.query(`select apply_bet_defaults_atomic('${tour}','2090-11-06T14:00Z',null,1000,500) as result`);
      const first = await runDefaults();
      assert.equal(first.rows[0].result.insertedBetIds.length, 2);
      assert.deepEqual(first.rows[0].result.unresolved, []);
      assert.equal((await runDefaults()).rows[0].result.insertedBetIds.length, 0);
      const { rows } = await db.query("select bettor_player_id,sum(stake_amount_pence)::integer as total from bets where status='active' group by bettor_player_id order by bettor_player_id");
      assert.deepEqual(rows.map((r) => r.total), [1000,1000]);
      await assert.rejects(db.query('select save_public_bet_atomic($1,$2,$3::jsonb)', ['edit',betId,JSON.stringify(publicPick)]), /closed for changes/);
      await db.query(`select admin_settle_bet_market_atomic('${market1}','${options[0]}','QA A won')`);
      assert.equal(Number((await db.query(`select sum(payout_amount_pence) as total from bets where market_id='${market1}'`)).rows[0].total), 2000);
      await db.query(`select admin_settle_bet_market_atomic('${market1}','${options[1]}','QA B correction')`);
      assert.equal(Number((await db.query(`select sum(payout_amount_pence) as total from bets where market_id='${market1}'`)).rows[0].total), 2000);
    });
    await t.test('one-sided pairings cannot be scored', async () => {
      await db.exec(`delete from match_participants where match_id='${match}' and side='B'`);
      await assert.rejects(db.query(callResult(1,0,'1 Up')), /Both match sides need participants/);
    });
  } finally { await db.close(); }
});
