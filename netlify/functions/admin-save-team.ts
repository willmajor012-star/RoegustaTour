import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, runRows, runSingle, withAdminSupabase } from './_adminSupabase';
import { mapTourTeam } from './_mappers';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body) => {
  const id = optionalString(body.id);
  const tourId = optionalString(body.tourId);
  const name = optionalString(body.name);
  const sortOrder = typeof body.sortOrder === 'number' ? body.sortOrder : Number(body.sortOrder);
  const captainPlayerId = optionalString(body.captainPlayerId);

  if (!tourId) return badRequest('Tour ID is required.');
  if (!name) return badRequest('Team name is required.');
  if (!Number.isFinite(sortOrder)) return badRequest('Sort order must be numeric.');

  if (captainPlayerId) {
    const captains = await runRows(supabase.from('players').select('id, active').eq('id', captainPlayerId).limit(1), 'find captain');
    if (captains.length === 0) return badRequest('Captain must be a real player.');
    if (captains[0].active === false) return badRequest('Inactive players cannot be team captains.');
  }

  const row = {
    id: id ?? crypto.randomUUID(),
    tour_id: tourId,
    name,
    colour: optionalString(body.colour),
    captain_player_id: captainPlayerId,
    sort_order: sortOrder,
  };
  const query = id
    ? supabase.from('tour_teams').update(row).eq('id', id).select('*').single()
    : supabase.from('tour_teams').insert(row).select('*').single();
  const saved = await runSingle<Record<string, unknown>>(query, 'save team');

  return jsonResponse(200, { ok: true, tourTeam: mapTourTeam(saved) });
});
