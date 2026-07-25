-- Live-readiness fixes: strict dates, the Portugal timezone, idempotent Bet Punto
-- cutoff processing, and transaction-safe Admin publication/result/settlement writes.
-- Safe to run repeatedly.

create extension if not exists pgcrypto;

alter table public.public_access_settings
  add column if not exists requires_change boolean not null default false;

-- Keep any configured password working so this migration cannot lock everyone out,
-- but require a deliberate replacement in Admin. If no password exists, runtime
-- access remains closed until an administrator configures one.
update public.public_access_settings
set session_version = session_version + 1,
    updated_at = now(),
    updated_by = 'live-readiness migration',
    requires_change = true
where id = 'default';

alter table public.tours
  alter column timezone set default 'Europe/Lisbon';

-- Repair the one known reversed historic date range before enforcing the invariant.
update public.tours
set start_date = end_date,
    end_date = start_date,
    updated_at = now()
where start_date is not null
  and end_date is not null
  and start_date > end_date;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tours_date_order_check'
      and conrelid = 'public.tours'::regclass
  ) then
    alter table public.tours
      add constraint tours_date_order_check
      check (start_date is null or end_date is null or start_date <= end_date);
  end if;
end $$;

-- The current Portugal tour must interpret tee times in Portugal, including DST.
update public.tours
set timezone = 'Europe/Lisbon',
    updated_at = now()
where is_current_public = true
  and timezone is distinct from 'Europe/Lisbon';

alter table public.bet_markets
  add column if not exists defaults_applied_at timestamptz;

-- Normalise any legacy text-only stakes before the atomic settlement function
-- starts requiring a numeric stake for every active bet.
update public.bets
set stake_amount_pence = round(
      replace(replace(btrim(stake_text), '£', ''), ',', '')::numeric * 100
    )::integer,
    updated_at = now()
where stake_amount_pence is null
  and btrim(coalesce(stake_text, '')) ~ '^£?[0-9]+([.][0-9]{1,2})?$';

create or replace function public.admin_set_current_public_tour(p_tour_id uuid)
returns setof public.tours
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.tours where id = p_tour_id) then
    raise exception 'Tour does not exist.';
  end if;

  update public.tours
  set is_current_public = false,
      updated_at = now()
  where is_current_public = true
    and id <> p_tour_id;

  return query
  update public.tours
  set is_current_public = true,
      updated_at = now()
  where id = p_tour_id
  returning *;
end;
$$;

create or replace function public.admin_publish_tour_content(
  p_tour_id uuid,
  p_scope text,
  p_round_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team_count integer := 0;
  v_round_count integer := 0;
  v_match_count integer := 0;
begin
  if not exists (select 1 from public.tours where id = p_tour_id) then
    raise exception 'Tour does not exist.';
  end if;

  if p_scope = 'round_matches' then
    if p_round_id is null or not exists (
      select 1 from public.rounds where id = p_round_id and tour_id = p_tour_id
    ) then
      raise exception 'Round does not belong to this tour.';
    end if;

    update public.matches
    set published = true,
        updated_at = now()
    where tour_id = p_tour_id
      and round_id = p_round_id;
    get diagnostics v_match_count = row_count;
  elsif p_scope = 'tour_all' then
    update public.tour_teams
    set published = true
    where tour_id = p_tour_id;
    get diagnostics v_team_count = row_count;

    update public.rounds
    set published = true,
        updated_at = now()
    where tour_id = p_tour_id;
    get diagnostics v_round_count = row_count;

    update public.matches
    set published = true,
        updated_at = now()
    where tour_id = p_tour_id;
    get diagnostics v_match_count = row_count;
  else
    raise exception 'Publication scope is invalid.';
  end if;

  return jsonb_build_object(
    'teamCount', v_team_count,
    'roundCount', v_round_count,
    'matchCount', v_match_count
  );
end;
$$;

create or replace function public.admin_settle_bet_market_atomic(
  p_market_id uuid,
  p_result_option_id uuid,
  p_result_text text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_market public.bet_markets%rowtype;
  v_total_pot bigint := 0;
  v_winning_stake bigint := 0;
  v_settled_count integer := 0;
  v_winning_count integer := 0;
  v_odds numeric := null;
begin
  select *
  into v_market
  from public.bet_markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'Bet Punto market does not exist.';
  end if;
  if v_market.status = 'void' then
    raise exception 'Void markets cannot be settled.';
  end if;
  if not exists (
    select 1
    from public.bet_options
    where id = p_result_option_id
      and market_id = p_market_id
  ) then
    raise exception 'Result option does not belong to this market.';
  end if;
  if exists (
    select 1
    from public.bets
    where market_id = p_market_id
      and status = 'active'
      and outcome_status <> 'void'
      and coalesce(stake_amount_pence, 0) <= 0
  ) then
    raise exception 'Every active bet needs a valid stake amount before this market can be settled.';
  end if;

  select
    coalesce(sum(stake_amount_pence), 0),
    coalesce(sum(stake_amount_pence) filter (where option_id = p_result_option_id), 0),
    count(*),
    count(*) filter (where option_id = p_result_option_id)
  into v_total_pot, v_winning_stake, v_settled_count, v_winning_count
  from public.bets
  where market_id = p_market_id
    and status = 'active'
    and outcome_status <> 'void'
    and coalesce(stake_amount_pence, 0) > 0;

  select odds_decimal
  into v_odds
  from public.bet_options
  where id = p_result_option_id;

  update public.bets
  set outcome_status = 'lost',
      payout_amount_pence = 0,
      payout_status = 'not_applicable',
      updated_at = now()
  where market_id = p_market_id
    and status = 'active'
    and outcome_status <> 'void'
    and coalesce(stake_amount_pence, 0) > 0
    and option_id <> p_result_option_id;

  if v_market.market_scope = 'general_pot' and v_winning_stake > 0 then
    with winner_base as (
      select
        id,
        floor((v_total_pot::numeric * stake_amount_pence::numeric) / v_winning_stake::numeric)::bigint as base_payout,
        ((v_total_pot::numeric * stake_amount_pence::numeric) / v_winning_stake::numeric)
          - floor((v_total_pot::numeric * stake_amount_pence::numeric) / v_winning_stake::numeric) as remainder
      from public.bets
      where market_id = p_market_id
        and status = 'active'
        and outcome_status <> 'void'
        and coalesce(stake_amount_pence, 0) > 0
        and option_id = p_result_option_id
    ),
    ranked as (
      select
        id,
        base_payout,
        row_number() over (order by remainder desc, id) as remainder_rank,
        v_total_pot - sum(base_payout) over () as pennies_remaining
      from winner_base
    )
    update public.bets as bet
    set outcome_status = 'won',
        payout_amount_pence = ranked.base_payout
          + case when ranked.remainder_rank <= ranked.pennies_remaining then 1 else 0 end,
        payout_status = 'not_applicable',
        updated_at = now()
    from ranked
    where bet.id = ranked.id;
  else
    update public.bets
    set outcome_status = 'won',
        payout_amount_pence = case
          when v_market.market_scope = 'general_pot' then 0
          when v_odds is null then null
          else round(stake_amount_pence * v_odds)::integer
        end,
        payout_status = 'not_applicable',
        updated_at = now()
    where market_id = p_market_id
      and status = 'active'
      and outcome_status <> 'void'
      and coalesce(stake_amount_pence, 0) > 0
      and option_id = p_result_option_id;
  end if;

  update public.bet_markets
  set status = 'settled',
      result_option_id = p_result_option_id,
      result_text = coalesce(p_result_text, result_text),
      defaults_applied_at = coalesce(defaults_applied_at, now()),
      updated_at = now()
  where id = p_market_id
  returning * into v_market;

  return jsonb_build_object(
    'betMarket', to_jsonb(v_market),
    'settlementSummary', jsonb_build_object(
      'totalPotPence', v_total_pot,
      'settledBetCount', v_settled_count,
      'winningBetCount', v_winning_count
    )
  );
end;
$$;

create or replace function public.admin_void_bet_market_atomic(p_market_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_market public.bet_markets%rowtype;
  v_voided_bet_count integer := 0;
begin
  update public.bet_markets
  set status = 'void',
      updated_at = now()
  where id = p_market_id
  returning * into v_market;

  if not found then
    raise exception 'Bet Punto market does not exist.';
  end if;

  update public.bets
  set outcome_status = 'void',
      payout_amount_pence = null,
      payout_status = 'not_applicable',
      updated_at = now()
  where market_id = p_market_id
    and status = 'active';
  get diagnostics v_voided_bet_count = row_count;

  return jsonb_build_object(
    'betMarket', to_jsonb(v_market),
    'voidedBetCount', v_voided_bet_count
  );
end;
$$;

create or replace function public.admin_save_round_prize_result_atomic(
  p_id uuid,
  p_tour_id uuid,
  p_round_id uuid,
  p_prize_type text,
  p_title text,
  p_winner_player_id uuid,
  p_winner_team_id uuid,
  p_winning_score_text text,
  p_score_value numeric,
  p_score_unit text,
  p_notes text,
  p_linked_bet_market_id uuid,
  p_published boolean,
  p_winner_option_id uuid,
  p_market_result_text text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_prize public.round_prize_results%rowtype;
  v_settlement jsonb := null;
begin
  if p_id is null then
    insert into public.round_prize_results (
      id, tour_id, round_id, prize_type, title, winner_player_id, winner_team_id,
      winning_score_text, score_value, score_unit, notes, linked_bet_market_id,
      published, updated_at
    ) values (
      v_id, p_tour_id, p_round_id, p_prize_type, p_title, p_winner_player_id,
      p_winner_team_id, p_winning_score_text, p_score_value, p_score_unit,
      p_notes, p_linked_bet_market_id, p_published, now()
    )
    returning * into v_prize;
  else
    update public.round_prize_results
    set round_id = p_round_id,
        prize_type = p_prize_type,
        title = p_title,
        winner_player_id = p_winner_player_id,
        winner_team_id = p_winner_team_id,
        winning_score_text = p_winning_score_text,
        score_value = p_score_value,
        score_unit = p_score_unit,
        notes = p_notes,
        linked_bet_market_id = p_linked_bet_market_id,
        published = p_published,
        updated_at = now()
    where id = p_id
      and tour_id = p_tour_id
    returning * into v_prize;

    if not found then
      raise exception 'Prize result does not belong to this tour.';
    end if;
  end if;

  if p_published and p_linked_bet_market_id is not null and p_winner_option_id is not null then
    v_settlement := public.admin_settle_bet_market_atomic(
      p_linked_bet_market_id,
      p_winner_option_id,
      p_market_result_text
    );
  end if;

  return jsonb_build_object(
    'roundPrizeResult', to_jsonb(v_prize),
    'settlement', v_settlement
  );
end;
$$;

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
begin
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
  if not p_clear_result and not exists (
    select 1 from public.match_participants where match_id = p_match_id
  ) then
    raise exception 'Match must have participants before a result can be submitted.';
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

create or replace function public.admin_save_match_setup_atomic(
  p_id uuid,
  p_tour_id uuid,
  p_round_id uuid,
  p_match_number integer,
  p_format text,
  p_status text,
  p_side_a_team_id uuid,
  p_side_b_team_id uuid,
  p_side_a_label text,
  p_side_b_label text,
  p_tee_time text,
  p_published boolean,
  p_notes text,
  p_side_a_player_ids uuid[],
  p_side_b_player_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_existing public.matches%rowtype;
  v_saved public.matches%rowtype;
  v_existing_side_a uuid[];
  v_existing_side_b uuid[];
begin
  if p_status = 'complete' and p_id is null then
    raise exception 'New matches cannot be created as complete. Submit a result after creating the pairing.';
  end if;

  if p_id is not null then
    select *
    into v_existing
    from public.matches
    where id = p_id
      and tour_id = p_tour_id
    for update;

    if not found then
      raise exception 'Match does not belong to this tour.';
    end if;

    if v_existing.status = 'complete' then
      select
        coalesce(array_agg(player_id order by player_id) filter (where side = 'A'), '{}'::uuid[]),
        coalesce(array_agg(player_id order by player_id) filter (where side = 'B'), '{}'::uuid[])
      into v_existing_side_a, v_existing_side_b
      from public.match_participants
      where match_id = p_id;

      if v_existing.round_id <> p_round_id
        or v_existing.format <> p_format
        or v_existing.side_a_team_id <> p_side_a_team_id
        or v_existing.side_b_team_id <> p_side_b_team_id
        or v_existing_side_a <> (
          select coalesce(array_agg(player_id order by player_id), '{}'::uuid[])
          from unnest(coalesce(p_side_a_player_ids, '{}'::uuid[])) as requested(player_id)
        )
        or v_existing_side_b <> (
          select coalesce(array_agg(player_id order by player_id), '{}'::uuid[])
          from unnest(coalesce(p_side_b_player_ids, '{}'::uuid[])) as requested(player_id)
        )
      then
        raise exception 'Completed match pairings are locked. Clear the result before changing teams, format, round or players.';
      end if;

      update public.matches
      set match_number = p_match_number,
          side_a_label = p_side_a_label,
          side_b_label = p_side_b_label,
          tee_time = p_tee_time,
          published = p_published,
          notes = p_notes,
          updated_at = now()
      where id = p_id
      returning * into v_saved;
    else
      if exists (select 1 from public.player_match_results where match_id = p_id) then
        raise exception 'This match has result rows despite not being complete. Correct the result before editing its pairing.';
      end if;

      update public.matches
      set round_id = p_round_id,
          match_number = p_match_number,
          format = p_format,
          status = p_status,
          side_a_team_id = p_side_a_team_id,
          side_b_team_id = p_side_b_team_id,
          side_a_label = p_side_a_label,
          side_b_label = p_side_b_label,
          points_available = 1,
          points_side_a = null,
          points_side_b = null,
          winning_side = case when p_status = 'void' then 'void' else null end,
          result_text = null,
          tee_time = p_tee_time,
          published = p_published,
          notes = p_notes,
          updated_at = now()
      where id = p_id
      returning * into v_saved;

      delete from public.match_participants where match_id = p_id;
    end if;
  else
    insert into public.matches (
      id, tour_id, round_id, match_number, format, status,
      side_a_team_id, side_b_team_id, side_a_label, side_b_label,
      points_available, points_side_a, points_side_b, winning_side,
      result_text, tee_time, published, notes
    ) values (
      v_id, p_tour_id, p_round_id, p_match_number, p_format, p_status,
      p_side_a_team_id, p_side_b_team_id, p_side_a_label, p_side_b_label,
      1, null, null, case when p_status = 'void' then 'void' else null end,
      null, p_tee_time, p_published, p_notes
    )
    returning * into v_saved;
  end if;

  if v_existing.status is distinct from 'complete' then
    insert into public.match_participants (id, match_id, player_id, side, team_id)
    select gen_random_uuid(), v_id, requested.player_id, 'A', p_side_a_team_id
    from unnest(coalesce(p_side_a_player_ids, '{}'::uuid[])) as requested(player_id);

    insert into public.match_participants (id, match_id, player_id, side, team_id)
    select gen_random_uuid(), v_id, requested.player_id, 'B', p_side_b_team_id
    from unnest(coalesce(p_side_b_player_ids, '{}'::uuid[])) as requested(player_id);
  end if;

  return jsonb_build_object(
    'match', to_jsonb(v_saved),
    'matchParticipants', coalesce((
      select jsonb_agg(to_jsonb(participant) order by participant.side, participant.player_id)
      from public.match_participants as participant
      where participant.match_id = v_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_set_current_public_tour(uuid) from public;
revoke all on function public.admin_publish_tour_content(uuid, text, uuid) from public;
revoke all on function public.admin_settle_bet_market_atomic(uuid, uuid, text) from public;
revoke all on function public.admin_void_bet_market_atomic(uuid) from public;
revoke all on function public.admin_save_round_prize_result_atomic(uuid, uuid, uuid, text, text, uuid, uuid, text, numeric, text, text, uuid, boolean, uuid, text) from public;
revoke all on function public.admin_submit_match_result_atomic(uuid, uuid, numeric, numeric, text, boolean, boolean, text, text) from public;
revoke all on function public.admin_save_match_setup_atomic(uuid, uuid, uuid, integer, text, text, uuid, uuid, text, text, text, boolean, text, uuid[], uuid[]) from public;

grant execute on function public.admin_set_current_public_tour(uuid) to service_role;
grant execute on function public.admin_publish_tour_content(uuid, text, uuid) to service_role;
grant execute on function public.admin_settle_bet_market_atomic(uuid, uuid, text) to service_role;
grant execute on function public.admin_void_bet_market_atomic(uuid) to service_role;
grant execute on function public.admin_save_round_prize_result_atomic(uuid, uuid, uuid, text, text, uuid, uuid, text, numeric, text, text, uuid, boolean, uuid, text) to service_role;
grant execute on function public.admin_submit_match_result_atomic(uuid, uuid, numeric, numeric, text, boolean, boolean, text, text) to service_role;
grant execute on function public.admin_save_match_setup_atomic(uuid, uuid, uuid, integer, text, text, uuid, uuid, text, text, text, boolean, text, uuid[], uuid[]) to service_role;

notify pgrst, 'reload schema';
