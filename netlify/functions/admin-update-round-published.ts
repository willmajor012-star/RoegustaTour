import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, runRows, runSingle, withAdminSupabase } from './_adminSupabase';
import { mapRound } from './_mappers';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body) => {
  const roundId = optionalString(body.roundId);
  const tourId = optionalString(body.tourId);
  const published = typeof body.published === 'boolean' ? body.published : null;
  if (!roundId) return badRequest('Round ID is required.');
  if (!tourId) return badRequest('Tour ID is required.');
  if (published === null) return badRequest('Published flag is required.');

  const rounds = await runRows(supabase.from('rounds').select('id, tour_id').eq('id', roundId).limit(1), 'find round publication target');
  if (rounds.length === 0) return badRequest('Round must exist.');
  if (rounds[0].tour_id !== tourId) return badRequest('Round does not belong to this tour.');

  const saved = await runSingle<Record<string, unknown>>(supabase.from('rounds').update({ published }).eq('id', roundId).select('*').single(), 'update round published flag');

  // TODO: insert audit_log row for round publication changes when the audit schema/helper lands.
  return jsonResponse(200, { ok: true, round: mapRound(saved) });
});
