import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, runRows, withAdminSupabase } from './_adminSupabase';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;
export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body) => {
  const id = optionalString(body.id);
  const tourId = optionalString(body.tourId);
  if (!id) return badRequest('Prize result ID is required.');
  if (!tourId) return badRequest('Tour ID is required.');
  const rows = await runRows<{ id: string; tour_id: string }>(supabase.from('round_prize_results').select('id, tour_id').eq('id', id).limit(1), 'find prize result');
  if (rows.length === 0) return badRequest('Prize result must exist.');
  if (rows[0].tour_id !== tourId) return badRequest('Prize result does not belong to this tour.');
  const removed = await supabase.from('round_prize_results').delete().eq('id', id);
  if (removed.error) throw new Error(`delete prize result: ${removed.error.message}`);
  return jsonResponse(200, { ok: true, deletedRoundPrizeResultId: id });
});
