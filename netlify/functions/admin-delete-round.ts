import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, runRows, withAdminSupabase } from './_adminSupabase';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body) => {
  const id = optionalString(body.id);
  const tourId = optionalString(body.tourId);
  if (!id) return badRequest('Round ID is required.');
  if (!tourId) return badRequest('Tour ID is required.');

  const rounds = await runRows<{ id: string; tour_id: string }>(supabase.from('rounds').select('id, tour_id').eq('id', id).limit(1), 'find round to delete');
  if (rounds.length === 0) return badRequest('Round does not exist.');
  if (rounds[0].tour_id !== tourId) return badRequest('Round does not belong to this tour.');

  const matches = await runRows(supabase.from('matches').select('id').eq('round_id', id).limit(1), 'round matches for delete');
  if (matches.length > 0) return badRequest('Rounds with matches cannot be deleted. Delete or move the matches first.');

  const deleted = await supabase.from('rounds').delete().eq('id', id);
  if (deleted.error) throw new Error(`delete round: ${deleted.error.message}`);

  return jsonResponse(200, { ok: true, deletedRoundId: id });
});
