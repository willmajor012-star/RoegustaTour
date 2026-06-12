import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, runRows, withAdminSupabase } from './_adminSupabase';

export const handler: (event: FunctionEvent) => Promise<FunctionResponse> = (event) => withAdminSupabase(event, 'POST', async (supabase, body) => {
  const id = optionalString(body.id);
  const tourId = optionalString(body.tourId);
  if (!id) return badRequest('Team ID is required.');
  if (!tourId) return badRequest('Tour ID is required.');

  const teams = await runRows<{ id: string; tour_id: string; name: string }>(supabase.from('tour_teams').select('id, tour_id, name').eq('id', id).limit(1), 'find team to delete');
  if (teams.length === 0) return badRequest('Team does not exist.');
  if (teams[0].tour_id !== tourId) return badRequest('Team does not belong to this tour.');

  const [completedSideMatches, participantRows, playerResults, betOptions, tourTeamResults] = await Promise.all([
    runRows(supabase.from('matches').select('id').eq('tour_id', tourId).eq('status', 'complete').or(`side_a_team_id.eq.${id},side_b_team_id.eq.${id}`).limit(1), 'completed side matches for team delete'),
    runRows<{ id: string; match_id: string }>(supabase.from('match_participants').select('id, match_id').eq('team_id', id), 'match participants for team delete'),
    runRows(supabase.from('player_match_results').select('id').eq('team_id', id).limit(1), 'player results for team delete'),
    runRows(supabase.from('bet_options').select('id').eq('linked_team_id', id).limit(1), 'Bet Punto options for team delete'),
    runRows(supabase.from('tour_team_results').select('id').eq('tour_id', tourId).eq('team_id', id).limit(1), 'tour team result history for team delete'),
  ]);

  if (completedSideMatches.length > 0) return badRequest('Teams used as a side in completed matches cannot be deleted.');
  if (tourTeamResults.length > 0) return badRequest('Teams with tour result history cannot be deleted. Result history is protected.');
  if (participantRows.length > 0) {
    const participantMatchIds = [...new Set(participantRows.map((row) => row.match_id))];
    const completedParticipantMatches = participantMatchIds.length > 0
      ? await runRows(supabase.from('matches').select('id').in('id', participantMatchIds).eq('status', 'complete').limit(1), 'completed participant matches for team delete')
      : [];
    if (completedParticipantMatches.length > 0) return badRequest('Teams with participants in completed matches cannot be deleted.');
    return badRequest('Teams with match participants cannot be deleted. Delete or reassign those draft/planned/active matches first.');
  }
  if (playerResults.length > 0) return badRequest('Teams referenced by player match results cannot be deleted.');
  if (betOptions.length > 0) return badRequest('Teams linked to Bet Punto options cannot be deleted.');

  const activeMatches = await runRows(supabase.from('matches').select('id').eq('tour_id', tourId).or(`side_a_team_id.eq.${id},side_b_team_id.eq.${id}`).limit(1), 'non-completed matches for team delete');
  if (activeMatches.length > 0) return badRequest('Teams assigned to existing matches cannot be deleted. Delete or reassign those draft/planned/active matches first.');

  const memberDelete = await supabase.from('tour_team_members').delete().eq('team_id', id);
  if (memberDelete.error) throw new Error(`delete team members: ${memberDelete.error.message}`);
  const deleted = await supabase.from('tour_teams').delete().eq('id', id);
  if (deleted.error) throw new Error(`delete team: ${deleted.error.message}`);

  return jsonResponse(200, { ok: true, deletedTeamId: id });
});
