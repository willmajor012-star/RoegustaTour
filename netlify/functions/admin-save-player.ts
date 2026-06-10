import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, runRows, runSingle, withAdminSupabase } from './_adminSupabase';
import { mapPlayer } from './_mappers';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body) => {
  const displayName = optionalString(body.displayName);
  if (!displayName) return badRequest('Display name is required.');

  const id = optionalString(body.id) ?? crypto.randomUUID();
  const active = typeof body.active === 'boolean' ? body.active : true;
  const row = {
    id,
    display_name: displayName,
    nickname: optionalString(body.nickname),
    initials: optionalString(body.initials),
    active,
  };

  const query = optionalString(body.id)
    ? supabase.from('players').update(row).eq('id', id).select('*').single()
    : supabase.from('players').insert(row).select('*').single();
  const saved = await runSingle<Record<string, unknown>>(query, 'save player');

  if (!active) {
    const openTours = await runRows<{ id: string }>(supabase.from('tours').select('id').in('status', ['planned', 'active']), 'find non-archived active/planned tours');
    const tourIds = openTours.map((tour) => tour.id);
    if (tourIds.length > 0) {
      const attendance = await supabase.from('tour_players').update({ attending: false }).eq('player_id', id).in('tour_id', tourIds);
      if (attendance.error) throw new Error(`clear inactive player attendance: ${attendance.error.message}`);

      const memberships = await supabase.from('tour_team_members').delete().eq('player_id', id).in('tour_id', tourIds);
      if (memberships.error) throw new Error(`clear inactive player team memberships: ${memberships.error.message}`);

      const captaincies = await supabase.from('tour_teams').update({ captain_player_id: null }).eq('captain_player_id', id).in('tour_id', tourIds);
      if (captaincies.error) throw new Error(`clear inactive player captaincies: ${captaincies.error.message}`);
    }
  }

  return jsonResponse(200, { ok: true, player: mapPlayer(saved) });
});
