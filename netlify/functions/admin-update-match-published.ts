import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, runSingle, withAdminSupabase } from './_adminSupabase';
import { mapMatch } from './_mappers';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body) => {
  const tourId = optionalString(body.tourId);
  const matchId = optionalString(body.matchId);
  const published = typeof body.published === 'boolean' ? body.published : null;

  if (!tourId) return badRequest('Tour ID is required.');
  if (!matchId) return badRequest('Match ID is required.');
  if (published === null) return badRequest('Published flag is required.');

  const saved = await runSingle<Record<string, unknown>>(supabase.from('matches').update({ published }).eq('id', matchId).eq('tour_id', tourId).select('*').single(), 'update match published flag');
  return jsonResponse(200, { ok: true, match: mapMatch(saved) });
});
