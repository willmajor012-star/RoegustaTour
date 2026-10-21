begin;
alter table tours add column if not exists rules_version text;
alter table rounds drop constraint if exists rounds_holes_check;
alter table rounds add constraint rounds_holes_check check(holes between 1 and 36);
alter table rounds add column if not exists competition_role text check (competition_role in ('contributing','matchplay','fun'));
alter table rounds add column if not exists hole_count_confirmed boolean not null default true;
alter table bet_markets add column if not exists pool_key text;
alter table bet_markets add column if not exists minimum_stake_pence integer check (minimum_stake_pence > 0 and minimum_stake_pence % 500 = 0);
alter table bet_markets add column if not exists competition_key text;
alter table bet_markets add column if not exists session_key text;
alter table bet_options add column if not exists linked_entry_id uuid;
alter table bet_options add column if not exists active boolean not null default true;
create unique index if not exists bet_market_pool_key on bet_markets(tour_id,pool_key) where pool_key is not null;
create unique index if not exists bet_option_entry_key on bet_options(market_id,linked_entry_id) where linked_entry_id is not null;
create index if not exists bet_player_pool_commitment on bets(market_id,bettor_player_id,status);

-- Tour-scoped aggregate with optimistic versions. Sessions, cards, pairs and
-- groups have distinct stable IDs. Every mutation keeps an audited old/new
-- snapshot; no matchplay record is used to represent Stableford scoring.
create table if not exists tour_operations (
  tour_id uuid primary key references tours(id),
  version bigint not null default 0,
  state jsonb not null default '{"schemaVersion":1,"competitions":[],"accommodation":[],"issues":[]}',
  updated_at timestamptz not null default clock_timestamp(),
  check (jsonb_typeof(state->'competitions')='array' and jsonb_typeof(state->'accommodation')='array')
);
create table if not exists tour_competition_awards (
  competition_id uuid not null, entry_id uuid not null,
  tour_id uuid not null references tours(id), team_id uuid not null references tour_teams(id),
  points numeric not null check(points>=0), active boolean not null default true,
  basis text not null, updated_at timestamptz not null default clock_timestamp(),
  primary key(competition_id,entry_id)
);
create index if not exists competition_awards_tour on tour_competition_awards(tour_id,team_id) where active;
create table if not exists bet_pool_default_checks (
  market_id uuid not null references bet_markets(id), player_id uuid not null references players(id),
  minimum_pence integer not null, qualifying_pence integer not null,
  shortfall_pence integer not null, selection_id uuid references bet_options(id),
  stake_added_pence integer not null default 0, cutoff_at timestamptz not null,
  processed_at timestamptz not null, status text not null, exception text,
  history jsonb not null default '[]', primary key(market_id,player_id)
);
create table if not exists bet_pool_scheduler_runs (
  id uuid primary key default gen_random_uuid(), started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz, status text not null, details jsonb not null default '[]'
);
do $$ declare t text; begin
  foreach t in array array['tour_operations','tour_competition_awards','bet_pool_default_checks','bet_pool_scheduler_runs'] loop
    execute format('alter table %I enable row level security',t);
    execute format('revoke all on %I from public,anon,authenticated',t);
    execute format('grant all on %I to service_role',t);
  end loop;
end $$;

create or replace function refresh_tour_competition_totals(p_tour_id uuid)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from tours where id=p_tour_id and rules_version is not null) and not exists(select 1 from tour_competition_awards where tour_id=p_tour_id) then return; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tour_id::text,0));
  insert into tour_team_results(tour_id,team_id,final_points,position,result_status,notes)
  select p_tour_id,id,points,rank() over(order by points desc),
    case when exists(select 1 from tours where id=p_tour_id and (status in ('complete','archived') or (rules_version='confirmed-2026' and (select coalesce(sum(points),0) from tour_competition_awards where tour_id=p_tour_id and active)+(select coalesce(sum(points_side_a+points_side_b),0) from matches where tour_id=p_tour_id and status='complete')=57)))
      then case when points=max(points) over() and count(*) over(partition by points)=1 then 'winner'
        when points=max(points) over() then 'draw' else 'runner_up' end else 'tbd' end,
    'Matchplay plus confirmed competition awards'
  from (
    select t.id,
      coalesce((select sum(case when m.side_a_team_id=t.id then m.points_side_a else m.points_side_b end)
        from matches m join rounds r on r.id=m.round_id
        where m.tour_id=p_tour_id and m.status='complete'
          and (m.side_a_team_id=t.id or m.side_b_team_id=t.id)
          and coalesce(r.competition_role,'matchplay')='matchplay'),0)
      + coalesce((select sum(a.points) from tour_competition_awards a where a.tour_id=p_tour_id and a.team_id=t.id and a.active),0) points
    from tour_teams t where t.tour_id=p_tour_id
  ) s
  on conflict(tour_id,team_id) do update set final_points=excluded.final_points,
    position=excluded.position,result_status=excluded.result_status,notes=excluded.notes;
end $$;

create or replace function commit_tour_operations(
  p_tour_id uuid,p_version bigint,p_state jsonb,p_awards jsonb,p_options jsonb,
  p_actor text,p_action text,p_matches jsonb default '[]'
) returns bigint language plpgsql security invoker set search_path=public,pg_temp as $$
declare previous tour_operations%rowtype; item jsonb; new_version bigint; existing_match matches%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tour_id::text,0));
  insert into tour_operations(tour_id) values(p_tour_id) on conflict do nothing;
  select * into previous from tour_operations where tour_id=p_tour_id for update;
  if previous.version<>p_version then raise exception 'Another organiser updated this tour. Reload before applying your changes.' using errcode='40001'; end if;
  update tour_operations set state=p_state,version=version+1,updated_at=clock_timestamp()
    where tour_id=p_tour_id returning version into new_version;
  update tour_competition_awards set active=false where tour_id=p_tour_id;
  for item in select value from jsonb_array_elements(p_awards) loop
    if not exists(select 1 from tour_teams where id=(item->>'teamId')::uuid and tour_id=p_tour_id) then raise exception 'Award team is outside tour.'; end if;
    insert into tour_competition_awards(competition_id,entry_id,tour_id,team_id,points,basis)
      values((item->>'competitionId')::uuid,(item->>'entryId')::uuid,p_tour_id,(item->>'teamId')::uuid,(item->>'points')::numeric,item->>'basis')
      on conflict(competition_id,entry_id) do update set team_id=excluded.team_id,points=excluded.points,
        basis=excluded.basis,active=true,updated_at=clock_timestamp();
  end loop;
  update bet_options o set active=false where o.market_id in (select id from bet_markets where tour_id=p_tour_id and pool_key is not null)
    and not exists(select 1 from jsonb_array_elements(p_options) v where v->>'id'=o.id::text);
  for item in select value from jsonb_array_elements(p_options) loop
    if not exists(select 1 from bet_markets where id=(item->>'marketId')::uuid and tour_id=p_tour_id) then raise exception 'Option market is outside tour.'; end if;
    insert into bet_options(id,market_id,label,linked_player_id,linked_entry_id,sort_order,active)
      values((item->>'id')::uuid,(item->>'marketId')::uuid,item->>'label',nullif(item->>'playerId','')::uuid,
        nullif(item->>'entryId','')::uuid,(item->>'sortOrder')::integer,true)
      on conflict(id) do update set label=excluded.label,linked_entry_id=excluded.linked_entry_id,linked_player_id=excluded.linked_player_id,active=true;
  end loop;
  for item in select value from jsonb_array_elements(p_matches) loop
    if not exists(select 1 from rounds where id=(item->>'roundId')::uuid and tour_id=p_tour_id and competition_role='matchplay') then raise exception 'Invalid matchplay session.'; end if;
    select * into existing_match from matches where id=(item->>'id')::uuid;
    if not found then
      insert into matches(id,tour_id,round_id,match_number,format,status,side_a_team_id,side_b_team_id,points_available,published)
      values((item->>'id')::uuid,p_tour_id,(item->>'roundId')::uuid,(item->>'number')::integer,item->>'format','planned',(item->>'teamA')::uuid,(item->>'teamB')::uuid,1,false);
    elsif existing_match.tour_id<>p_tour_id then raise exception 'Match belongs to another tour.';
    end if;
    perform admin_save_match_setup_atomic((item->>'id')::uuid,p_tour_id,(item->>'roundId')::uuid,(item->>'number')::integer,item->>'format',coalesce(existing_match.status,'planned'),(item->>'teamA')::uuid,(item->>'teamB')::uuid,item->>'labelA',item->>'labelB',item->>'time',true,null,array(select jsonb_array_elements_text(item->'playersA'))::uuid[],array(select jsonb_array_elements_text(item->'playersB'))::uuid[]);
  end loop;
  for item in select sess.value from jsonb_array_elements(p_state->'competitions') comp, lateral jsonb_array_elements(comp->'sessions') sess loop
    update rounds set holes=coalesce((item->>'holes')::integer,holes),hole_count_confirmed=(item->>'holes') is not null,
      course_id=nullif(item->>'courseId','')::uuid,course_name=coalesce(item->>'courseName',course_name)
      where id=(item->>'roundId')::uuid and tour_id=p_tour_id;
  end loop;
  -- Replace settlement calculations on score corrections; never create another payout ledger.
  for item in select to_jsonb(m) from bet_markets m where tour_id=p_tour_id and pool_key is not null and status='settled' loop
    if previous.state->'poolResults'->(item->>'id') is distinct from p_state->'poolResults'->(item->>'id') then
      insert into audit_log(actor_label,action,entity_type,entity_id,payload)
        values(p_actor,'bet_pool.score_correction','bet_market',(item->>'id')::uuid,jsonb_build_object('previousMarket',item,'previousBets',(select jsonb_agg(b) from bets b where market_id=(item->>'id')::uuid)));
      if coalesce((p_state->'poolResults'->(item->>'id')->>'ready')::boolean,false) then
        perform admin_settle_bet_market_atomic((item->>'id')::uuid,(p_state->'poolResults'->(item->>'id')->>'optionId')::uuid,'Recalculated from corrected Stableford scorecards');
      else
        update bet_markets set status='closed',result_option_id=null,result_text='Score correction: complete cards and resolve the winner before resettling' where id=(item->>'id')::uuid;
        update bets set outcome_status='pending',payout_status='not_applicable',payout_amount_pence=null where market_id=(item->>'id')::uuid and status='active' and outcome_status is distinct from 'void';
      end if;
    end if;
  end loop;
  perform refresh_tour_competition_totals(p_tour_id);
  insert into audit_log(actor_label,action,entity_type,entity_id,payload)
    values(p_actor,p_action,'tour_operations',p_tour_id,jsonb_build_object('oldVersion',previous.version,'newVersion',new_version,'previous',previous.state,'next',p_state));
  return new_version;
end $$;

create or replace function process_tour_pool_defaults(p_tour_id uuid,p_now timestamptz default clock_timestamp(),p_include_settled uuid default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  market record; player record; option_id_value uuid; option_count integer;
  committed integer; missing integer; automatic_id uuid; added_id uuid; prior bet_pool_default_checks%rowtype;
  due_ids uuid[]:='{}';closed_ids uuid[]:='{}';inserted_ids uuid[]:='{}';updated_ids uuid[]:='{}';
  unresolved jsonb:='[]';operations jsonb; check_status text; message text; attempt jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tour_id::text,0));
  select state into operations from tour_operations where tour_id=p_tour_id;
  for market in select * from bet_markets where tour_id=p_tour_id and pool_key is not null and required
    and closes_at<=p_now and (status in ('draft','open','closed') or (id=p_include_settled and status='settled'))
    order by closes_at,id for update
  loop
    due_ids:=array_append(due_ids,market.id);
    if market.status in ('draft','open') then
      update bet_markets set status='closed' where id=market.id;
      closed_ids:=array_append(closed_ids,market.id);
    end if;
    for player in select p.id,p.display_name from players p join tour_players tp on tp.player_id=p.id
      where tp.tour_id=p_tour_id and tp.attending order by p.id
    loop
      select coalesce(sum(b.stake_amount_pence),0)::integer into committed from bets b
        where b.market_id=market.id and b.bettor_player_id=player.id and b.status='active'
          and b.outcome_status is distinct from 'void';
      missing:=greatest(0,coalesce(market.minimum_stake_pence,1000)-committed);
      option_id_value:=null;message:=null;automatic_id:=null;added_id:=null;
      if missing>0 then
        select count(*),(array_agg(o.id))[1] into option_count,option_id_value from bet_options o
        where o.market_id=market.id and o.active and (
          (market.pool_key='sunday' and o.linked_player_id=player.id)
          or (o.linked_entry_id is not null and exists(
            select 1 from jsonb_array_elements(coalesce(operations->'competitions','[]')) c,
              jsonb_array_elements(c->'entries') e
            where c->>'key'=market.competition_key and coalesce((c->>'entriesPublished')::boolean,false) and e->>'id'=o.linked_entry_id::text
              and (e->'playerIds') ? player.id::text
          ))
        );
        if option_count<>1 then
          option_id_value:=null;
          message:='Missing or ambiguous own competition selection. Save and publish the correct pair/draw.';
          unresolved:=unresolved||jsonb_build_array(jsonb_build_object('marketId',market.id,'playerId',player.id,'reason',message));
        else
          select id into automatic_id from bets where market_id=market.id and bettor_player_id=player.id
            and entry_source='automatic_default' and status='active' and outcome_status is distinct from 'void' for update;
          if automatic_id is null then
            insert into bets(market_id,option_id,bettor_name,bettor_player_id,stake_text,stake_amount_pence,
              comment,admin_entered,entry_source,status,outcome_status,payout_status,created_at,updated_at)
            values(market.id,option_id_value,player.display_name,player.id,'£'||(missing/100)::text,missing,
              'Automatic pool minimum shortfall at cutoff',true,'automatic_default','active','pending','not_applicable',p_now,p_now)
              returning id into added_id;
            inserted_ids:=array_append(inserted_ids,added_id);
          else
            update bets set stake_amount_pence=stake_amount_pence+missing,
              stake_text='£'||((stake_amount_pence+missing)/100)::text,updated_at=p_now where id=automatic_id;
            updated_ids:=array_append(updated_ids,automatic_id);
          end if;
        end if;
      end if;
      check_status:=case when message is not null then 'exception' when missing>0 then 'applied' else 'complete' end;
      select * into prior from bet_pool_default_checks where market_id=market.id and player_id=player.id;
      attempt:=jsonb_build_object('minimum',market.minimum_stake_pence,'existing',committed,'shortfall',missing,
        'selection',option_id_value,'added',case when message is null then missing else 0 end,'cutoff',market.closes_at,'processed',p_now,'status',check_status);
      insert into bet_pool_default_checks(market_id,player_id,minimum_pence,qualifying_pence,shortfall_pence,selection_id,
        stake_added_pence,cutoff_at,processed_at,status,exception,history)
      values(market.id,player.id,market.minimum_stake_pence,committed,missing,option_id_value,
        case when message is null then missing else 0 end,market.closes_at,p_now,check_status,message,jsonb_build_array(attempt))
      on conflict(market_id,player_id) do update set
        minimum_pence=excluded.minimum_pence,qualifying_pence=excluded.qualifying_pence,
        shortfall_pence=excluded.shortfall_pence,selection_id=coalesce(excluded.selection_id,bet_pool_default_checks.selection_id),
        stake_added_pence=bet_pool_default_checks.stake_added_pence+excluded.stake_added_pence,
        processed_at=excluded.processed_at,status=excluded.status,exception=excluded.exception,
        history=case when missing>0 and (message is null or prior.exception is distinct from message)
          then bet_pool_default_checks.history||attempt else bet_pool_default_checks.history end;
      if missing>0 and (message is null or prior.exception is distinct from message) then
        insert into audit_log(actor_label,action,entity_type,entity_id,payload)
          values('Scheduled pool defaults','bet_pool.default_'||check_status,'bet_market',market.id,attempt||jsonb_build_object('playerId',player.id,'pool',market.pool_key));
      end if;
    end loop;
    update bet_markets set defaults_applied_at=case when exists(select 1 from bet_pool_default_checks where market_id=market.id and status='exception') then null else p_now end where id=market.id;
  end loop;
  return jsonb_build_object('dueMarketIds',due_ids,'closedMarketIds',closed_ids,'insertedBetIds',inserted_ids,'updatedBetIds',updated_ids,'unresolved',unresolved);
end $$;

-- Retain the historic daily rules unchanged for tours without scoped pools.
alter function apply_bet_defaults_atomic(uuid,timestamptz,uuid,integer,integer) rename to apply_legacy_bet_defaults_atomic;
create function apply_bet_defaults_atomic(p_tour_id uuid,p_now timestamptz,p_include_settled_market_id uuid,p_minimum integer,p_increment integer)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if exists(select 1 from bet_markets where tour_id=p_tour_id and pool_key is not null) then
    return process_tour_pool_defaults(p_tour_id,p_now,p_include_settled_market_id);
  end if;
  return apply_legacy_bet_defaults_atomic(p_tour_id,p_now,p_include_settled_market_id,p_minimum,p_increment);
end $$;
create or replace function process_due_bet_pools()
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare tour record;run_id uuid;result jsonb;run_details jsonb:='[]';failed boolean:=false;
begin
  insert into bet_pool_scheduler_runs(status) values('running') returning id into run_id;
  for tour in select distinct tour_id from bet_markets where pool_key is not null and required and status in ('draft','open','closed') and closes_at<=clock_timestamp()
  loop
    begin
      result:=process_tour_pool_defaults(tour.tour_id,clock_timestamp());
      run_details:=run_details||jsonb_build_array(jsonb_build_object('tourId',tour.tour_id,'result',result));
    exception when others then
      failed:=true;run_details:=run_details||jsonb_build_array(jsonb_build_object('tourId',tour.tour_id,'error',sqlerrm));
    end;
  end loop;
  update bet_pool_scheduler_runs set status=case when failed then 'failed' else 'succeeded' end,finished_at=clock_timestamp(),details=run_details where id=run_id;
  return jsonb_build_object('runId',run_id,'failed',failed,'details',run_details);
end $$;

alter function admin_submit_match_result_atomic(uuid,uuid,numeric,numeric,text,boolean,boolean,text,text) rename to legacy_submit_match_result_atomic;
create function admin_submit_match_result_atomic(p_tour_id uuid,p_match_id uuid,p_points_side_a numeric,p_points_side_b numeric,p_result_text text,p_published boolean,p_clear_result boolean,p_actor_label text,p_correction_reason text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare result jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tour_id::text,0));
  result:=legacy_submit_match_result_atomic(p_tour_id,p_match_id,p_points_side_a,p_points_side_b,p_result_text,p_published,p_clear_result,p_actor_label,p_correction_reason);
  perform refresh_tour_competition_totals(p_tour_id);
  return jsonb_set(result,'{tourTeamResults}',coalesce((select jsonb_agg(to_jsonb(t)) from tour_team_results t where tour_id=p_tour_id),'[]'));
end $$;

-- Enforce the same authoritative deadline for direct/admin discretionary writes.
create function enforce_pool_bet_deadline() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare pool bet_markets%rowtype; tid uuid;
begin
  select tour_id into tid from bet_markets where id=new.market_id;
  perform pg_advisory_xact_lock(hashtextextended(tid::text,0));
  select * into pool from bet_markets where id=new.market_id;
  if pool.pool_key is not null and new.entry_source<>'automatic_default' and clock_timestamp()>=pool.closes_at
    and (tg_op='INSERT' or new.option_id is distinct from old.option_id or new.stake_amount_pence is distinct from old.stake_amount_pence or (new.status='active' and old.status<>'active')) then
    raise exception 'This pool closed at its Portugal local cutoff. New discretionary stakes are not allowed.';
  end if;
  if new.status='active' and exists(select 1 from bet_options where id=new.option_id and not active)
    and (tg_op='INSERT' or new.option_id is distinct from old.option_id) then raise exception 'This selection is no longer available.'; end if;
  return new;
end $$;
create trigger pool_bet_deadline before insert or update on bets for each row execute function enforce_pool_bet_deadline();

alter function admin_settle_bet_market_atomic(uuid,uuid,text) rename to legacy_settle_bet_market_atomic;
create function admin_settle_bet_market_atomic(p_market_id uuid,p_result_option_id uuid,p_result_text text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare m bet_markets%rowtype; approval jsonb;
begin
  select * into m from bet_markets where id=p_market_id;
  perform pg_advisory_xact_lock(hashtextextended(m.tour_id::text,0));
  if m.pool_key is not null then
    if clock_timestamp()<m.closes_at then raise exception 'Pool cutoff has not passed.'; end if;
    perform process_tour_pool_defaults(m.tour_id,clock_timestamp(),m.id);
    if exists(select 1 from bet_pool_default_checks where market_id=m.id and status='exception') then raise exception 'Resolve automatic bet exceptions before settlement.'; end if;
    select state->'poolResults'->m.id::text into approval from tour_operations where tour_id=m.tour_id;
    if approval is null or not coalesce((approval->>'ready')::boolean,false) or approval->>'optionId'<>p_result_option_id::text then
      raise exception 'Complete all relevant Stableford scorecards and resolve the betting countback winner before settlement.';
    end if;
  end if;
  return legacy_settle_bet_market_atomic(p_market_id,p_result_option_id,p_result_text);
end $$;

-- Stableford sessions and the separate Par 3 must never enter the match ledger.
create or replace function enforce_competition_match_scope()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if exists(select 1 from rounds where id=new.round_id and competition_role in ('contributing','fun')) then
    raise exception 'Use the Stableford scorecard for this session. It does not award matchplay points.';
  end if;
  return new;
end $$;
create trigger matches_competition_scope before insert or update of round_id,points_available,points_side_a,points_side_b,status on matches for each row execute function enforce_competition_match_scope();

-- Protect authoritative pool cutoffs/minimums from generic round/day editors.
create or replace function enforce_scoped_pool_rules()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if old.pool_key is not null and
    (new.closes_at is distinct from old.closes_at or new.minimum_stake_pence is distinct from old.minimum_stake_pence
      or new.pool_key is distinct from old.pool_key or new.required is distinct from old.required)
    and current_setting('roegusta.configure_pool',true) is distinct from 'on' then
    raise exception 'This pool has a confirmed independent cutoff and minimum. Use confirmed tour configuration.';
  end if;
  return new;
end $$;
create trigger scoped_pool_rules before update on bet_markets for each row execute function enforce_scoped_pool_rules();
do $$ declare fn record; begin
  for fn in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=any(array['commit_tour_operations','refresh_tour_competition_totals',
      'process_tour_pool_defaults','process_due_bet_pools','apply_bet_defaults_atomic','admin_submit_match_result_atomic','admin_settle_bet_market_atomic']) loop
    execute format('revoke all on function %s from public,anon,authenticated',fn.signature);
    execute format('grant execute on function %s to service_role',fn.signature);
  end loop;
end $$;
notify pgrst,'reload schema';
commit;
