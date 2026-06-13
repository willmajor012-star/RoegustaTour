import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, runRows, runSingle, withAdminSupabase } from './_adminSupabase';
import { mapTourTeam } from './_mappers';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body) => {
  const teamId = optionalString(body.teamId);
  const tourId = optionalString(body.tourId);
  const published = typeof body.published === 'boolean' ? body.published : null;
  if (!teamId) return badRequest('Team ID is required.');
  if (!tourId) return badRequest('Tour ID is required.');
  if (published === null) return badRequest('Published flag is required.');

  const teams = await runRows(supabase.from('tour_teams').select('id, tour_id').eq('id', teamId).limit(1), 'find team publication target');
  if (teams.length === 0) return badRequest('Team must exist.');
  if (teams[0].tour_id !== tourId) return badRequest('Team does not belong to this tour.');

  const saved = await runSingle<Record<string, unknown>>(supabase.from('tour_teams').update({ published }).eq('id', teamId).select('*').single(), 'update team published flag');

  // TODO: insert audit_log row for team roster publication changes when the audit schema/helper lands.
  return jsonResponse(200, { ok: true, tourTeam: mapTourTeam(saved) });
});
