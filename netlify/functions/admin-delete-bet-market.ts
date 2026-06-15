import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, runRows, withAdminSupabase } from './_adminSupabase';
import { writeAuditLog } from './_audit';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body, session) => {
  const id = optionalString(body.id);
  const tourId = optionalString(body.tourId);
  if (!id) return badRequest('Bet market ID is required.');
  if (!tourId) return badRequest('Tour ID is required.');

  const existing = await runRows<{ id: string; status: string }>(supabase.from('bet_markets').select('id, status').eq('id', id).eq('tour_id', tourId).limit(1), 'find bet market to delete');
  if (existing.length === 0) return badRequest('Bet market does not exist for this tour.');

  const bets = await runRows<{ id: string }>(supabase.from('bets').select('id').eq('market_id', id), 'find market bets before delete');
  if (bets.length > 0) {
    await writeAuditLog(supabase, session, 'bet_market.delete_blocked', 'bet_market', id, { tourId, status: existing[0].status, betCount: bets.length });
    return badRequest(`Bet Punto market has ${bets.length} actual bet${bets.length === 1 ? '' : 's'} and cannot be hard-deleted. Close or void it instead.`);
  }

  const deletedOptions = await supabase.from('bet_options').delete().eq('market_id', id);
  if (deletedOptions.error) throw new Error(`delete bet options: ${deletedOptions.error.message}`);
  const deleted = await supabase.from('bet_markets').delete().eq('id', id).eq('tour_id', tourId);
  if (deleted.error) throw new Error(`delete bet market: ${deleted.error.message}`);
  await writeAuditLog(supabase, session, 'bet_market.deleted_unused', 'bet_market', id, { tourId, status: existing[0].status });

  return jsonResponse(200, { ok: true, deletedBetMarketId: id });
});
