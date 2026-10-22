begin;
create or replace function admin_set_tour_pool_status(p_market_id uuid,p_tour_id uuid,p_status text,p_actor text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare pool bet_markets%rowtype; comp jsonb; attendance integer; entry_size integer; expected_entries integer; result jsonb;
begin
  if p_status is null or p_status not in ('draft','open','closed') then raise exception 'Invalid pool publication status.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tour_id::text,0));
  select * into pool from bet_markets where id=p_market_id and tour_id=p_tour_id for update;
  if not found or pool.pool_key is null then raise exception 'Choose a configured pool on this tour.'; end if;
  if pool.status in ('settled','void') then raise exception 'A settled or void pool cannot be reopened here.'; end if;
  if p_status='draft' and exists(select 1 from bets where market_id=pool.id and status='active' and outcome_status is distinct from 'void') then
    raise exception 'This pool has bets. Close betting to keep their history visible.';
  end if;
  if p_status='open' then
    if pool.closes_at is null or pool.closes_at<=clock_timestamp() then raise exception 'This pool has reached its cutoff.'; end if;
    select c into comp from tour_operations o,lateral jsonb_array_elements(o.state->'competitions') c where o.tour_id=p_tour_id and c->>'key'=pool.competition_key;
    if comp is null or not coalesce((comp->>'entriesPublished')::boolean,false) then raise exception 'Publish the competition draw before opening this pool.'; end if;
    select count(*) into attendance from tour_players where tour_id=p_tour_id and attending;
    entry_size:=case when comp->>'entryKind'='individual' then 1 else 2 end;
    expected_entries:=attendance/entry_size;
    if attendance=0 or attendance%entry_size<>0 or jsonb_array_length(comp->'entries')<>expected_entries
      or exists(select 1 from jsonb_array_elements(comp->'entries') e where jsonb_array_length(e->'playerIds')<>entry_size)
      or (select count(distinct p) from jsonb_array_elements(comp->'entries') e,lateral jsonb_array_elements_text(e->'playerIds') p)<>attendance
      or (select count(*) from jsonb_array_elements(comp->'entries') e,lateral jsonb_array_elements_text(e->'playerIds') p join tour_players tp on tp.player_id=p::uuid and tp.tour_id=p_tour_id and tp.attending)<>attendance then
      raise exception 'The published draw must include every attending golfer exactly once.';
    end if;
    if (select count(distinct o.linked_entry_id) from bet_options o where o.market_id=pool.id and o.active and exists(select 1 from jsonb_array_elements(comp->'entries') e where e->>'id'=o.linked_entry_id::text))<>expected_entries then
      raise exception 'Publish all competition selections before opening this pool.';
    end if;
  end if;
  update bet_markets set status=p_status where id=pool.id returning to_jsonb(bet_markets.*) into result;
  insert into audit_log(actor_label,action,entity_type,entity_id,payload) values(p_actor,'bet_pool.publication','bet_market',pool.id,jsonb_build_object('previousStatus',pool.status,'status',p_status,'tourId',p_tour_id));
  return result;
end $$;
revoke all on function admin_set_tour_pool_status(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function admin_set_tour_pool_status(uuid,uuid,text,text) to service_role;
notify pgrst,'reload schema';
commit;
