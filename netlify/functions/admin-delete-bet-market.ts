import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, runRows, withAdminSupabase } from './_adminSupabase';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body) => {
  const id = optionalString(body.id);
  const tourId = optionalString(body.tourId);
  if (!id) return badRequest('Bet market ID is required.');
  if (!tourId) return badRequest('Tour ID is required.');

  const existing = await runRows<{ id: string }>(supabase.from('bet_markets').select('id').eq('id', id).eq('tour_id', tourId).limit(1), 'find bet market to delete');
  if (existing.length === 0) return badRequest('Bet market does not exist for this tour.');

  const deleted = await supabase.from('bet_markets').delete().eq('id', id).eq('tour_id', tourId);
  if (deleted.error) throw new Error(`delete bet market: ${deleted.error.message}`);

  return jsonResponse(200, { ok: true, deletedBetMarketId: id });
});
