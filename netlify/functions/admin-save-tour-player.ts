import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalNumber, optionalString, runRows, runSingle, withAdminSupabase } from './_adminSupabase';
import { mapTourPlayer, mapTourTeamMember } from './_mappers';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body) => {
  const tourId = optionalString(body.tourId);
  const playerId = optionalString(body.playerId);
  if (!tourId) return badRequest('Tour ID is required.');
  if (!playerId) return badRequest('Player ID is required.');

  const attending = typeof body.attending === 'boolean' ? body.attending : false;
  const tourHandicap = optionalNumber(body.tourHandicap);
  if (tourHandicap !== null && (tourHandicap < -10 || tourHandicap > 54)) return badRequest('Handicap must be blank or between -10 and 54.');

  if (attending) {
    const players = await runRows(supabase.from('players').select('id, active').eq('id', playerId).limit(1), 'find attendance player');
    if (players.length === 0) return badRequest('Player must exist.');
    if (players[0].active === false) return badRequest('Inactive players cannot be marked as attending.');
  }

  const existing = await runRows(supabase.from('tour_players').select('id').eq('tour_id', tourId).eq('player_id', playerId).limit(1), 'find tour player');
  const values = {
    tour_id: tourId,
    player_id: playerId,
    attending,
    tour_handicap: tourHandicap,
    notes: optionalString(body.notes),
  };

  const query = existing[0]?.id
    ? supabase.from('tour_players').update(values).eq('id', existing[0].id).select('*').single()
    : supabase.from('tour_players').insert({ id: crypto.randomUUID(), ...values }).select('*').single();
  const saved = await runSingle<Record<string, unknown>>(query, 'save tour player');

  if (!attending) {
    const removeMembership = await supabase
      .from('tour_team_members')
      .delete()
      .eq('tour_id', tourId)
      .eq('player_id', playerId);

    if (removeMembership.error) {
      throw new Error(`remove absent player team membership: ${removeMembership.error.message}`);
    }
  }

  const memberRows = await runRows(supabase.from('tour_team_members').select('*').eq('tour_id', tourId), 'tour team members after attendance save');

  return jsonResponse(200, { ok: true, tourPlayer: mapTourPlayer(saved), tourTeamMembers: memberRows.map(mapTourTeamMember) });
});
