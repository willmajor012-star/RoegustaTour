-- Executes real database functions, captures evidence, then rolls back every write.
-- The exception subtransaction also restores the current-public flag and audit log.
do $$
declare
  tid uuid := gen_random_uuid();
  ta uuid := gen_random_uuid(); tb uuid := gen_random_uuid();
  ps uuid[] := '{}'; mids uuid[] := '{}'; rids uuid[] := '{}'; bms uuid[] := '{}';
  opts uuid[]; rid uuid; mid uuid; bm uuid; bid uuid; prize uuid; oid uuid;
  saved jsonb; evidence jsonb; vals jsonb; report text;
  i integer; r integer; n integer; j integer; pa numeric; pb numeric;
  aa uuid[]; bb uuid[]; fmt text; margin text; rejected boolean;
begin
  begin
    insert into tours(id,name,year,start_date,end_date,status,is_test,timezone)
    values(tid,'QA TEST TOUR full rehearsal',2098,'2098-11-01','2098-11-03','active',true,'Europe/Lisbon');
    -- This change is uncommitted and invisible to other sessions; it is rolled back.
    perform admin_set_current_public_tour(tid);
    insert into tour_teams(id,tour_id,name,published,sort_order)
    values(ta,tid,'QA Red',true,1),(tb,tid,'QA Blue',true,2);
    for i in 1..16 loop
      ps := array_append(ps,gen_random_uuid());
      insert into players(id,display_name,active) values(ps[i],'QA Player '||i,true);
      insert into tour_players(tour_id,player_id,attending) values(tid,ps[i],true);
    end loop;
    perform admin_save_team_members_atomic(tid,ta,ps[1:8]);
    perform admin_save_team_members_atomic(tid,tb,ps[9:16]);
    for r in 1..3 loop
      rid := gen_random_uuid(); rids := array_append(rids,rid);
      fmt := case r when 1 then 'better_ball' when 2 then 'scramble' else 'singles' end;
      insert into rounds(id,tour_id,round_number,name,round_date,tee_time,format,status,holes,published)
      values(rid,tid,r,'QA Round '||r,'2098-11-01'::date+(r-1),'09:00',fmt,'active',18,true);
      n := case when r=3 then 8 else 4 end;
      for i in 1..n loop
        if r=3 then aa:=array[ps[i]]; bb:=array[ps[i+8]];
        else aa:=ps[(2*i-1):(2*i)]; bb:=ps[(2*i+7):(2*i+8)]; end if;
        saved := admin_save_match_setup_atomic(null,tid,rid,i,fmt,'planned',ta,tb,null,null,
          '09:'||lpad(((i-1)*7)::text,2,'0'),true,null,aa,bb);
        mids := array_append(mids,(saved->'match'->>'id')::uuid);
      end loop;
      bm := gen_random_uuid(); bms := array_append(bms,bm); opts := '{}';
      insert into bet_markets(id,tour_id,round_id,title,market_type,market_scope,status,required,closes_at)
      values(bm,tid,rid,'QA Round '||r||' pool',case when r=2 then 'team_result' else 'player_performance' end,
        'general_pot','open',true,clock_timestamp()+r*interval '1 hour');
      for i in 1..(case when r=2 then 2 else 16 end) loop
        opts:=array_append(opts,gen_random_uuid());
        insert into bet_options(id,market_id,label,linked_player_id,linked_team_id,sort_order)
        values(opts[i],bm,'QA option '||i,case when r<>2 then ps[i] else null end,
          case when r=2 then case when i=1 then ta else tb end else null end,i);
      end loop;
      for i in 1..16 loop
        oid:=case when r=2 then opts[case when i<=8 then 1 else 2 end] else opts[i] end;
        vals:=jsonb_build_object('market_id',bm,'option_id',oid,'bettor_name','QA Player '||i,
          'bettor_player_id',ps[i],'stake_text','£10','stake_amount_pence',1000,
          'public_edit_token_hash','qa-token-'||i,'device_id','qa-device-'||i);
        -- Exercise create, edit, void and re-entry on every round.
        saved:=save_public_bet_atomic('create',null,vals);
        if i=1 then
          bid:=(saved->>'id')::uuid;
          perform save_public_bet_atomic('edit',bid,vals||jsonb_build_object('stake_amount_pence',500,'stake_text','£5'));
          rejected:=false;
          begin perform save_public_bet_atomic('edit',bid,vals||jsonb_build_object('public_edit_token_hash','wrong'));
          exception when others then rejected:=true; end;
          if not rejected then raise exception 'Wrong edit token was accepted'; end if;
        end if;
        if i=16 then
          perform save_public_bet_atomic('void',(saved->>'id')::uuid,vals);
          perform save_public_bet_atomic('create',null,vals);
        end if;
      end loop;
      saved:=apply_bet_defaults_atomic(tid,clock_timestamp()+r*interval '1 hour'+interval '1 minute',null,1000,500);
      if jsonb_array_length(saved->'unresolved')<>0 then raise exception 'Unresolved automatic picks: %',saved; end if;
      saved:=apply_bet_defaults_atomic(tid,clock_timestamp()+r*interval '1 hour'+interval '1 minute',null,1000,500);
      if jsonb_array_length(saved->'insertedBetIds')<>0 then raise exception 'Defaults duplicated on repeat'; end if;
      if (select sum(stake_amount_pence) from bets where market_id=bm and status='active')<>16000 then
        raise exception 'Round pot differs from £160'; end if;
      rejected:=false;
      begin perform save_public_bet_atomic('create',null,vals);
      exception when others then rejected:=true; end;
      if not rejected then raise exception 'Closed market accepted a new pick'; end if;
      for i in 1..n loop
        j:=case r when 1 then i when 2 then 4+i else 8+i end;
        -- Round totals: 3–1, 2–2, 4–4, including two halves in each later round.
        pa:=case when r=1 then case when i<=3 then 1 else 0 end
          when r=2 then case when i=1 then 1 when i in(2,3) then .5 else 0 end
          else case when i<=3 then 1 when i in(4,5) then .5 else 0 end end;
        pb:=1-pa; margin:=case when pa=.5 then 'AS' else '3 & 2' end;
        perform admin_submit_match_result_atomic(tid,mids[j],pa,pb,margin,true,false,'QA rehearsal',null);
      end loop;
      perform admin_save_round_prize_result_atomic(null,tid,rid,
        case when r=2 then 'team_gross' else 'individual_stableford' end,'QA playing winner',
        case when r<>2 then ps[1] else null end,case when r=2 then ta else null end,
        case when r=2 then '65 gross' else '40 points' end,case when r=2 then 65 else 40 end,
        case when r=2 then 'strokes' else 'points' end,null,bm,true,opts[1],'QA result');
      if (select sum(payout_amount_pence) from bets where market_id=bm and status='active')<>16000 then
        raise exception 'Settlement did not conserve the pot'; end if;
      -- Re-settlement, winner correction, and restoration must never compound payouts.
      perform admin_settle_bet_market_atomic(bm,opts[1],'Repeated save');
      perform admin_settle_bet_market_atomic(bm,opts[2],'QA corrected winner');
      if (select sum(payout_amount_pence) from bets where market_id=bm and status='active')<>16000 then
        raise exception 'Correction did not conserve the pot'; end if;
      perform admin_settle_bet_market_atomic(bm,opts[1],'QA restored winner');
      update rounds set status='complete' where id=rid;
    end loop;
    -- Clear and restore a result to check both derived tables are rebuilt.
    perform admin_submit_match_result_atomic(tid,mids[1],null,null,null,true,true,'QA rehearsal','Clear test');
    if (select count(*) from player_match_results where tour_id=tid)<>44 then raise exception 'Clear left result rows'; end if;
    perform admin_submit_match_result_atomic(tid,mids[1],1,0,'3 & 2',true,false,'QA rehearsal','Restore test');
    if (select count(*) from player_match_results where tour_id=tid)<>48 then raise exception 'Expected 48 player results'; end if;
    if (select final_points from tour_team_results where tour_id=tid and team_id=ta)<>9
      or (select final_points from tour_team_results where tour_id=tid and team_id=tb)<>7 then
      raise exception 'Expected final score 9–7'; end if;
    if exists(select player_id from player_match_results where tour_id=tid group by player_id having count(*)<>3) then
      raise exception 'Player statistics do not contain exactly three rounds each'; end if;
    if (select sum(payout_amount_pence-stake_amount_pence) from bets where market_id=any(bms) and status='active')<>0 then
      raise exception 'Cumulative player net balances do not sum to zero'; end if;
    update tours set status='complete' where id=tid;
    select jsonb_build_object(
      'players',16,'rounds',3,'matches',16,'playerResultRows',48,'teamScore',jsonb_build_array(9,7),
      'totalStakePence',48000,'totalPayoutPence',48000,
      'leaderboard',(select jsonb_agg(x order by x.net_pence desc,x.bettor_name) from(
        select bettor_name,sum(stake_amount_pence) stake_pence,sum(payout_amount_pence) payout_pence,
          sum(payout_amount_pence-stake_amount_pence) net_pence from bets where market_id=any(bms)
          and status='active' group by bettor_name)x),
      'snapshot',(select jsonb_build_object(
        'tours',(select jsonb_agg(t) from tours t where id=tid),
        'players',(select jsonb_agg(t) from players t where id=any(ps)),
        'rounds',(select jsonb_agg(t) from rounds t where tour_id=tid),
        'matches',(select jsonb_agg(t) from matches t where tour_id=tid),
        'tour_teams',(select jsonb_agg(t) from tour_teams t where tour_id=tid),
        'tour_players',(select jsonb_agg(t) from tour_players t where tour_id=tid),
        'tour_team_members',(select jsonb_agg(t) from tour_team_members t where tour_id=tid),
        'tour_team_results',(select jsonb_agg(t) from tour_team_results t where tour_id=tid),
        'match_participants',(select jsonb_agg(t) from match_participants t where match_id=any(mids)),
        'player_match_results',(select jsonb_agg(t) from player_match_results t where tour_id=tid),
        'bet_markets',(select jsonb_agg(t) from bet_markets t where tour_id=tid),
        'bet_options',(select jsonb_agg(t) from bet_options t where market_id=any(bms)),
        'bets',(select jsonb_agg(t) from bets t where market_id=any(bms)),
        'round_prize_results',(select jsonb_agg(t) from round_prize_results t where tour_id=tid)))
    ) into evidence;
    raise exception using message=evidence::text,errcode='ZX001';
  exception when sqlstate 'ZX001' then
    get stacked diagnostics report=message_text;
    perform set_config('qa.rehearsal_result',report,false);
  end;
end $$;
select current_setting('qa.rehearsal_result')::jsonb as rehearsal;
