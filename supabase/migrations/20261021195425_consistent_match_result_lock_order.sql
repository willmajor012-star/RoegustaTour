begin;
create or replace function admin_submit_match_result_atomic(p_tour_id uuid,p_match_id uuid,p_points_side_a numeric,p_points_side_b numeric,p_result_text text,p_published boolean,p_clear_result boolean,p_actor_label text,p_correction_reason text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare result jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tour_id::text,0));
  result:=legacy_submit_match_result_atomic(p_tour_id,p_match_id,p_points_side_a,p_points_side_b,p_result_text,p_published,p_clear_result,p_actor_label,p_correction_reason);
  perform refresh_tour_competition_totals(p_tour_id);
  return jsonb_set(result,'{tourTeamResults}',coalesce((select jsonb_agg(to_jsonb(t)) from tour_team_results t where tour_id=p_tour_id),'[]'));
end $$;

notify pgrst,'reload schema';
commit;
