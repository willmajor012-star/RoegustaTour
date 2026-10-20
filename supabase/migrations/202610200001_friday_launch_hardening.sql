-- Friday launch hardening. Apply after the existing migrations.
-- No player, tour, result or bet rows are deleted or rewritten by this migration.
begin;

-- The application accesses the database only through authenticated Netlify
-- functions using service_role. Browser roles must not bypass those checks.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'players', 'tours', 'tour_players', 'tour_teams', 'tour_team_members',
    'tour_team_results', 'tour_handbook_sections', 'tour_itinerary_items',
    'tour_team_day_kit', 'tour_courses', 'rounds', 'matches',
    'match_participants', 'player_match_results', 'historical_player_stats',
    'bet_markets', 'bet_options', 'bets', 'audit_log', 'public_access_settings',
    'round_prize_results'
  ] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('revoke all on table public.%I from anon, authenticated', table_name);
    end if;
  end loop;
end $$;

create or replace function public.admin_submit_match_result_atomic(
  p_tour_id uuid,
  p_match_id uuid,
  p_points_side_a numeric,
  p_points_side_b numeric,
  p_result_text text,
  p_published boolean,
  p_clear_result boolean,
  p_actor_label text,
  p_correction_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_match public.matches%rowtype;
  v_winning_side text;
  v_previous_status text;
  v_holes integer;
  v_margin text;
begin
  -- Serialize tour aggregates even when two admins save different matches.
  perform pg_advisory_xact_lock(hashtextextended(p_tour_id::text, 0));
  select *
  into v_match
  from public.matches
  where id = p_match_id
    and tour_id = p_tour_id
  for update;

  if not found then
    raise exception 'Match does not belong to this tour.';
  end if;
  v_previous_status := v_match.status;
  if not p_clear_result then
    if v_match.status = 'void' then
      raise exception 'Restore a void match before entering a result.';
    end if;
    if p_points_side_a is null or p_points_side_b is null
      or p_points_side_a::text in ('NaN', 'Infinity', '-Infinity')
      or p_points_side_b::text in ('NaN', 'Infinity', '-Infinity')
      or p_points_side_a < 0 or p_points_side_b < 0
      or v_match.points_available <= 0
      or p_points_side_a + p_points_side_b <> v_match.points_available
      or (p_points_side_a > 0 and p_points_side_b > 0 and p_points_side_a <> p_points_side_b) then
      raise exception 'Choose a winner or equal halves of the points available.';
    end if;
    if not exists (select 1 from public.match_participants where match_id = p_match_id and side = 'A')
      or not exists (select 1 from public.match_participants where match_id = p_match_id and side = 'B') then
      raise exception 'Both match sides need participants before entering a result.';
    end if;
    select coalesce(holes, 18) into v_holes from public.rounds where id = v_match.round_id;
    v_margin := lower(regexp_replace(coalesce(p_result_text, ''), '\s+', '', 'g'));
    if not v_margin = any(case when v_holes = 9
      then array['as','1up','2up','2&1','3&2','3&1','4&3','4&2','5&4']
      else array['as','1up','2up','2&1','3&2','3&1','4&3','4&2','5&4','5&3','6&5','6&4','7&6','7&5','8&7','8&6','9&8','9&7','10&8'] end) then
      raise exception 'Choose a valid matchplay result for this round.';
    end if;
    if (v_margin = 'as') <> (p_points_side_a = p_points_side_b) then
      raise exception 'AS requires a halved match. A winning margin requires a winning side.';
    end if;
  end if;

  v_winning_side := case
    when p_clear_result then null
    when p_points_side_a > p_points_side_b then 'A'
    when p_points_side_b > p_points_side_a then 'B'
    else 'halved'
  end;

  update public.matches
  set points_side_a = case when p_clear_result then null else p_points_side_a end,
      points_side_b = case when p_clear_result then null else p_points_side_b end,
      winning_side = v_winning_side,
      result_text = case when p_clear_result then null else p_result_text end,
      status = case when p_clear_result then 'planned' else 'complete' end,
      published = coalesce(p_published, published),
      updated_at = now()
  where id = p_match_id
  returning * into v_match;

  delete from public.player_match_results where match_id = p_match_id;

  if not p_clear_result then
    insert into public.player_match_results (
      id, tour_id, round_id, match_id, player_id, team_id, format,
      result, points_for, points_against
    )
    select
      gen_random_uuid(),
      p_tour_id,
      v_match.round_id,
      p_match_id,
      participant.player_id,
      participant.team_id,
      v_match.format,
      case
        when v_winning_side = 'halved' then 'draw'
        when v_winning_side = participant.side then 'win'
        else 'loss'
      end,
      case when participant.side = 'A' then p_points_side_a else p_points_side_b end,
      case when participant.side = 'A' then p_points_side_b else p_points_side_a end
    from public.match_participants as participant
    where participant.match_id = p_match_id;
  end if;

  with team_points as (
    select
      team.id as team_id,
      coalesce(sum(
        case
          when match.side_a_team_id = team.id then match.points_side_a
          when match.side_b_team_id = team.id then match.points_side_b
          else 0
        end
      ), 0)::numeric as points
    from public.tour_teams as team
    left join public.matches as match
      on match.tour_id = team.tour_id
      and match.status = 'complete'
      and (match.side_a_team_id = team.id or match.side_b_team_id = team.id)
    where team.tour_id = p_tour_id
    group by team.id
  ),
  ranked as (
    select
      team_id,
      points,
      row_number() over (order by points desc, team_id) as position,
      max(points) over () as top_points,
      count(*) over (partition by points) as tied_count
    from team_points
  )
  insert into public.tour_team_results (
    id, tour_id, team_id, final_points, position, result_status, notes, updated_at
  )
  select
    gen_random_uuid(),
    p_tour_id,
    team_id,
    points,
    position,
    case
      when points <= 0 then 'tbd'
      when points = top_points and tied_count > 1 then 'draw'
      when position = 1 then 'winner'
      when position = 2 then 'runner_up'
      else 'tbd'
    end,
    'Auto-calculated from completed match results.',
    now()
  from ranked
  on conflict (tour_id, team_id)
  do update set
    final_points = excluded.final_points,
    position = excluded.position,
    result_status = excluded.result_status,
    notes = excluded.notes,
    updated_at = now();

  insert into public.audit_log (
    actor_label, action, entity_type, entity_id, payload
  ) values (
    coalesce(nullif(btrim(p_actor_label), ''), 'Roegusta admin'),
    case
      when p_clear_result then 'result.cleared'
      when v_previous_status = 'complete' then 'result.corrected'
      else 'result.submitted'
    end,
    'match',
    p_match_id,
    jsonb_build_object(
      'tourId', p_tour_id,
      'matchId', p_match_id,
      'correctionReason', p_correction_reason
    )
  );

  return jsonb_build_object(
    'match', to_jsonb(v_match),
    'playerMatchResults', coalesce((
      select jsonb_agg(to_jsonb(result_row))
      from public.player_match_results as result_row
      where result_row.match_id = p_match_id
    ), '[]'::jsonb),
    'tourTeamResults', coalesce((
      select jsonb_agg(to_jsonb(team_result))
      from public.tour_team_results as team_result
      where team_result.tour_id = p_tour_id
    ), '[]'::jsonb)
  );
end;
$$;


revoke all on function public.admin_submit_match_result_atomic(uuid, uuid, numeric, numeric, text, boolean, boolean, text, text) from public, anon, authenticated;
grant execute on function public.admin_submit_match_result_atomic(uuid, uuid, numeric, numeric, text, boolean, boolean, text, text) to service_role;


-- Replace team membership as one transaction. Never strand pairings on another
-- team or remove their participants while changing tomorrow's roster.
create or replace function public.admin_save_team_members_atomic(
  p_tour_id uuid, p_team_id uuid, p_player_ids uuid[]
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tour_id::text, 0));
  if not exists (select 1 from tour_teams where id=p_team_id and tour_id=p_tour_id) then
    raise exception 'Team must belong to this tour.';
  end if;
  if p_player_ids is null or cardinality(p_player_ids) <> (select count(distinct id) from unnest(p_player_ids) id) then
    raise exception 'Player IDs must be a unique array.';
  end if;
  if exists (
    select 1 from unnest(p_player_ids) selected(id)
    where not exists (select 1 from players p join tour_players tp on tp.player_id=p.id
      where p.id=selected.id and p.active and tp.tour_id=p_tour_id and tp.attending)
  ) then
    raise exception 'Only active attending players can be assigned to a team.';
  end if;
  if exists (
    select 1 from match_participants mp join matches m on m.id=mp.match_id
    where m.tour_id=p_tour_id and m.status <> 'void' and (
      (mp.team_id=p_team_id and not (mp.player_id=any(p_player_ids)))
      or (mp.player_id=any(p_player_ids) and mp.team_id<>p_team_id)
    )
  ) then
    raise exception 'Update the affected match pairings before moving or removing these players.';
  end if;
  delete from tour_team_members where tour_id=p_tour_id and (team_id=p_team_id or player_id=any(p_player_ids));
  insert into tour_team_members(id,tour_id,team_id,player_id)
    select gen_random_uuid(),p_tour_id,p_team_id,selected.id from unnest(p_player_ids) selected(id);
  update bet_markets set defaults_applied_at=null where tour_id=p_tour_id and required and status in ('open','closed');
  return coalesce((select jsonb_agg(to_jsonb(member)) from tour_team_members member where tour_id=p_tour_id),'[]'::jsonb);
end $$;
revoke all on function public.admin_save_team_members_atomic(uuid,uuid,uuid[]) from public, anon, authenticated;
grant execute on function public.admin_save_team_members_atomic(uuid,uuid,uuid[]) to service_role;

-- Cutoffs and public submissions share a tour lock: simultaneous viewers must
-- not charge the same daily shortfall twice, or save a pick after settlement.
create or replace function public.apply_bet_defaults_atomic(
  p_tour_id uuid, p_now timestamptz, p_include_settled_market_id uuid,
  p_minimum integer, p_increment integer
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  market record; player record; playing_date date; target_option uuid;
  existing_id uuid; new_id uuid; shortfall integer; previous_unresolved integer;
  due_ids uuid[] := '{}'; closed_ids uuid[] := '{}'; inserted_ids uuid[] := '{}'; updated_ids uuid[] := '{}';
  unresolved jsonb := '[]';
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tour_id::text,0));
  if p_minimum <> 1000 or p_increment <> 500 then raise exception 'Invalid daily stake rules.'; end if;
  for market in select * from bet_markets
    where tour_id=p_tour_id and required and closes_at<=p_now
      and (status='open' or (status='closed' and defaults_applied_at is null)
        or (id=p_include_settled_market_id and status in ('closed','settled')))
    order by closes_at,id for update
  loop
    due_ids := array_append(due_ids,market.id);
    previous_unresolved := jsonb_array_length(unresolved);
    select round_date into playing_date from rounds where id=market.round_id;
    for player in select p.id,p.display_name from players p join tour_players tp on tp.player_id=p.id
      where tp.tour_id=p_tour_id and tp.attending and p.active order by p.id
    loop
      if playing_date is null then
        unresolved := unresolved || jsonb_build_array(jsonb_build_object('marketId',market.id,'playerId',player.id,'reason','The linked round has no playing date.'));
        continue;
      end if;
      select greatest(0,p_minimum-coalesce(sum(b.stake_amount_pence),0))::integer into shortfall
        from bets b join bet_markets bm on bm.id=b.market_id join rounds r on r.id=bm.round_id
        where bm.tour_id=p_tour_id and bm.required and bm.status in ('open','closed','settled')
          and r.round_date=playing_date and b.bettor_player_id=player.id
          and b.status='active' and b.outcome_status is distinct from 'void';
      if shortfall<=0 then continue; end if;
      target_option := null;
      select o.id into target_option from bet_options o where o.market_id=market.id and (
        (market.market_type='player_performance' and o.linked_player_id=player.id)
        or (market.market_type='team_result' and o.linked_team_id in
          (select team_id from tour_team_members where tour_id=p_tour_id and player_id=player.id))
      ) order by o.sort_order,o.id limit 1;
      if target_option is null then
        unresolved := unresolved || jsonb_build_array(jsonb_build_object('marketId',market.id,'playerId',player.id,'reason','No self or own-team option exists for this player.'));
        continue;
      end if;
      shortfall := ceil(shortfall::numeric/p_increment)::integer*p_increment;
      select id into existing_id from bets where market_id=market.id and bettor_player_id=player.id
        and entry_source='automatic_default' and status='active' and outcome_status is distinct from 'void' limit 1;
      if existing_id is not null then
        update bets set stake_amount_pence=coalesce(stake_amount_pence,0)+shortfall,
          stake_text='£'||((coalesce(stake_amount_pence,0)+shortfall)/100)::text,
          comment='Automatic daily minimum top-up at first tee',updated_at=p_now where id=existing_id;
        updated_ids := array_append(updated_ids,existing_id);
      else
        new_id := gen_random_uuid();
        insert into bets(id,market_id,option_id,bettor_name,bettor_player_id,stake_text,stake_amount_pence,
          comment,admin_entered,entry_source,status,outcome_status,payout_status,created_at,updated_at)
        values(new_id,market.id,target_option,player.display_name,player.id,'£'||(shortfall/100)::text,shortfall,
          'Automatic daily default at first tee',true,'automatic_default','active','pending','not_applicable',p_now,p_now);
        inserted_ids := array_append(inserted_ids,new_id);
      end if;
    end loop;
    if playing_date is not null then
      update bet_markets set status=case when status='open' then 'closed' else status end,
        defaults_applied_at=case when jsonb_array_length(unresolved)=previous_unresolved then p_now else defaults_applied_at end
        where id=market.id;
      if market.status='open' then closed_ids := array_append(closed_ids,market.id); end if;
    end if;
  end loop;
  return jsonb_build_object('dueMarketIds',due_ids,'closedMarketIds',closed_ids,'insertedBetIds',inserted_ids,'updatedBetIds',updated_ids,'unresolved',unresolved);
end $$;
revoke all on function public.apply_bet_defaults_atomic(uuid,timestamptz,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.apply_bet_defaults_atomic(uuid,timestamptz,uuid,integer,integer) to service_role;

create or replace function public.save_public_bet_atomic(p_action text,p_bet_id uuid,p_values jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  market public.bet_markets%rowtype; saved public.bets%rowtype; market_id_value uuid; tour_id_value uuid;
begin
  if p_action not in ('create','edit','void') then raise exception 'Invalid bet action.'; end if;
  if p_action='create' then market_id_value := (p_values->>'market_id')::uuid;
  else select market_id into market_id_value from bets where id=p_bet_id; end if;
  select tour_id into tour_id_value from bet_markets where id=market_id_value;
  perform pg_advisory_xact_lock(hashtextextended(tour_id_value::text,0));
  select * into market from bet_markets where id=market_id_value for update;
  if not found or market.status<>'open' or market.closes_at is null or market.closes_at<=clock_timestamp() then
    raise exception 'This Bet Punto market has closed for changes.';
  end if;
  if not exists(select 1 from tours where id=market.tour_id and is_current_public)
    or (market.round_id is not null and not exists(select 1 from rounds where id=market.round_id and published)) then
    raise exception 'This market is not published for the current tour.';
  end if;
  if p_action<>'create' then
    select * into saved from bets where id=p_bet_id for update;
    if saved.status<>'active' or saved.public_edit_token_hash is distinct from p_values->>'public_edit_token_hash' then
      raise exception 'This pick cannot be changed with that edit token.';
    end if;
  end if;
  if p_action='void' then
    update bets set status='void',outcome_status='void',payout_status='not_applicable',payout_amount_pence=null,
      void_reason=p_values->>'void_reason',updated_at=clock_timestamp() where id=p_bet_id returning * into saved;
  else
    if not exists(select 1 from bet_options where id=(p_values->>'option_id')::uuid and market_id=market.id) then
      raise exception 'Option does not belong to this market.';
    end if;
    if (p_values->>'stake_amount_pence')::integer <=0 or (p_values->>'stake_amount_pence')::integer % 500 <>0 then
      raise exception 'Stakes must be positive £5 increments.';
    end if;
    if p_action='edit' then
      update bets set option_id=(p_values->>'option_id')::uuid,stake_text=p_values->>'stake_text',
        stake_amount_pence=(p_values->>'stake_amount_pence')::integer,comment=p_values->>'comment',updated_at=clock_timestamp()
        where id=p_bet_id returning * into saved;
    else
      if not exists(select 1 from tour_players tp join players p on p.id=tp.player_id
        where tp.tour_id=market.tour_id and tp.player_id=(p_values->>'bettor_player_id')::uuid and tp.attending and p.active) then
        raise exception 'Choose an active attending player.';
      end if;
      insert into bets(market_id,option_id,bettor_name,bettor_player_id,stake_text,stake_amount_pence,comment,status,
        outcome_status,payout_status,device_id,public_edit_token_hash,entry_source)
      values(market.id,(p_values->>'option_id')::uuid,p_values->>'bettor_name',(p_values->>'bettor_player_id')::uuid,
        p_values->>'stake_text',(p_values->>'stake_amount_pence')::integer,p_values->>'comment','active','pending','not_applicable',
        p_values->>'device_id',p_values->>'public_edit_token_hash','public') returning * into saved;
    end if;
  end if;
  return to_jsonb(saved);
end $$;
revoke all on function public.save_public_bet_atomic(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_public_bet_atomic(text,uuid,jsonb) to service_role;

-- Supabase may grant function execution directly to browser roles through
-- default privileges. Revoking PUBLIC alone does not remove those grants.
do $$
declare fn record;
begin
  for fn in select p.oid::regprocedure as signature from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array[
      'admin_set_current_public_tour','admin_publish_tour_content',
      'admin_settle_bet_market_atomic','admin_void_bet_market_atomic',
      'admin_save_round_prize_result_atomic','admin_submit_match_result_atomic',
      'admin_save_match_setup_atomic','admin_save_team_members_atomic',
      'apply_bet_defaults_atomic','save_public_bet_atomic'
    ])
  loop
    execute format('revoke all on function %s from public, anon, authenticated',fn.signature);
    execute format('grant execute on function %s to service_role',fn.signature);
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;
