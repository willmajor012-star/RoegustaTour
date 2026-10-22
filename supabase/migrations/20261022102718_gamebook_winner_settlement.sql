-- Preserve the existing atomic result/award/option transaction and settle
-- manually confirmed GameBook winners in the same transaction after cutoff.
begin;
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
  for item in select to_jsonb(m) from bet_markets m where tour_id=p_tour_id and pool_key is not null and (status='settled' or (p_action='tour.set_pool_winner' and status in('open','closed') and closes_at<=clock_timestamp() and previous.state->'manualPoolWinners'->m.id::text is distinct from p_state->'manualPoolWinners'->m.id::text)) loop
    if previous.state->'poolResults'->(item->>'id') is distinct from p_state->'poolResults'->(item->>'id') or (p_action='tour.set_pool_winner' and item->>'status'<>'settled') then
      insert into audit_log(actor_label,action,entity_type,entity_id,payload)
        values(p_actor,'bet_pool.score_correction','bet_market',(item->>'id')::uuid,jsonb_build_object('previousMarket',item,'previousBets',(select jsonb_agg(b) from bets b where market_id=(item->>'id')::uuid)));
      if coalesce((p_state->'poolResults'->(item->>'id')->>'ready')::boolean,false) then
        perform admin_settle_bet_market_atomic((item->>'id')::uuid,(p_state->'poolResults'->(item->>'id')->>'optionId')::uuid,'GameBook winner confirmed by organiser');
      else
        update bet_markets set status='closed',result_option_id=null,result_text='Results changed: confirm the GameBook winner before resettling' where id=(item->>'id')::uuid;
        update bets set outcome_status='pending',payout_status='not_applicable',payout_amount_pence=null where market_id=(item->>'id')::uuid and status='active' and outcome_status is distinct from 'void';
      end if;
    end if;
  end loop;
  perform refresh_tour_competition_totals(p_tour_id);
  insert into audit_log(actor_label,action,entity_type,entity_id,payload)
    values(p_actor,p_action,'tour_operations',p_tour_id,jsonb_build_object('oldVersion',previous.version,'newVersion',new_version,'previous',previous.state,'next',p_state));
  return new_version;
end $$;
notify pgrst,'reload schema';
commit;
