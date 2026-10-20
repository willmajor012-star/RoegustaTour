import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, runRows, runSingle, withAdminSupabase } from './_adminSupabase';
import { mapTourTeamMember } from './_mappers';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body) => {
  const tourId = optionalString(body.tourId);
  const teamId = optionalString(body.teamId);
  const rawPlayerIds = Array.isArray(body.playerIds) ? body.playerIds : null;

  if (!tourId) return badRequest('Tour ID is required.');
  if (!teamId) return badRequest('Team ID is required.');
  if (!rawPlayerIds) return badRequest('Player IDs must be an array.');

  const playerIds = rawPlayerIds.map((value) => optionalString(value)).filter((value): value is string => Boolean(value));
  if (new Set(playerIds).size !== playerIds.length) return badRequest('Player IDs must be unique.');

  const teams = await runRows(supabase.from('tour_teams').select('id').eq('tour_id', tourId).eq('id', teamId).limit(1), 'find team');
  if (teams.length === 0) return badRequest('Team must exist for this tour.');

  if (playerIds.length > 0) {
    const [players, attendingPlayers] = await Promise.all([
      runRows(supabase.from('players').select('id, active').in('id', playerIds), 'find member players'),
      runRows(supabase.from('tour_players').select('player_id').eq('tour_id', tourId).eq('attending', true).in('player_id', playerIds), 'find attending players'),
    ]);
    if (players.length !== playerIds.length) return badRequest('All selected players must exist.');
    if (players.some((player) => player.active === false)) return badRequest('Inactive players cannot be assigned to a team.');
    if (attendingPlayers.length !== playerIds.length) return badRequest('Only attending players can be assigned to a team.');
  }

  const memberRows = await runSingle<Record<string, unknown>[]>(supabase.rpc('admin_save_team_members_atomic', {
    p_tour_id: tourId,
    p_team_id: teamId,
    p_player_ids: playerIds,
  }), 'save team membership atomically');
  return jsonResponse(200, { ok: true, tourTeamMembers: memberRows.map(mapTourTeamMember) });
});
