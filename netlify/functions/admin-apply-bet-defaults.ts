import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, runRows, runSingle, withAdminSupabase } from './_adminSupabase';
import { applyAutomaticBetDefaultsForMarket } from './_betDefaults';
import { writeAuditLog } from './_audit';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body, session) => {
  const marketId = optionalString(body.marketId);
  const tourId = optionalString(body.tourId);
  if (!marketId) return badRequest('Market ID is required.');

  const markets = await runRows<{ id: string; tour_id: string; status: string; result_option_id: string | null; result_text: string | null }>(
    supabase.from('bet_markets').select('id, tour_id, status, result_option_id, result_text').eq('id', marketId).limit(1),
    'find Bet Punto market for automatic-default check',
  );
  if (markets.length === 0) return badRequest('Bet Punto market does not exist.');
  if (tourId && markets[0].tour_id !== tourId) return badRequest('Bet Punto market does not belong to the selected tour.');

  const result = await applyAutomaticBetDefaultsForMarket(supabase, marketId);
  if (
    markets[0].status === 'settled'
    && markets[0].result_option_id
    && (result.insertedBetIds.length > 0 || result.updatedBetIds.length > 0)
  ) {
    await runSingle(
      supabase.rpc('admin_settle_bet_market_atomic', {
        p_market_id: marketId,
        p_result_option_id: markets[0].result_option_id,
        p_result_text: markets[0].result_text,
      }),
      're-settle Bet Punto market after automatic-default reconciliation',
    );
  }
  await writeAuditLog(supabase, session, 'bet_market.automatic_defaults_checked', 'bet_market', marketId, result);

  return jsonResponse(200, { ok: true, result });
});
