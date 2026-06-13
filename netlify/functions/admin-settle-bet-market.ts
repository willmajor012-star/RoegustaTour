import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, runRows, runSingle, withAdminSupabase } from './_adminSupabase';
import { mapBet, mapBetMarket } from './_mappers';
import { writeAuditLog } from './_audit';
import { settleBetMarketRows } from './_betSettlement';
import type { BetMarket } from '../../src/lib/types';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;
type MarketRow = { id: string; status: BetMarket['status']; market_scope: BetMarket['marketScope']; result_option_id?: string | null; result_text?: string | null };

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body, session) => {
  const marketId = optionalString(body.marketId);
  const resultOptionId = optionalString(body.resultOptionId);
  const settlementNote = optionalString(body.settlementNote);
  const correction = body.correction === true || body.confirmCorrection === true;
  if (!marketId) return badRequest('Market ID is required.');
  if (!resultOptionId) return badRequest('Result option is required.');

  const market = await runSingle<MarketRow>(supabase.from('bet_markets').select('*').eq('id', marketId).single(), 'find settlement market');
  if (market.status === 'void') return badRequest('Void markets cannot be settled.');
  if (market.status === 'settled' && !correction) return badRequest('Market is already settled. Confirm correction mode to resettle it.');

  const options = await runRows<{ id: string }>(supabase.from('bet_options').select('id').eq('market_id', marketId), 'settlement market options');
  if (options.length === 0) return badRequest('Market must have options before settlement.');
  if (!options.some((option) => option.id === resultOptionId)) return badRequest('Result option must belong to this market.');

  const previous = { status: market.status, resultOptionId: market.result_option_id, resultText: market.result_text };
  const updatedMarket = await runSingle<Record<string, unknown>>(supabase.from('bet_markets').update({
    status: 'settled',
    result_option_id: resultOptionId,
    result_text: settlementNote ?? market.result_text ?? null,
  }).eq('id', marketId).select('*').single(), 'settle bet market');
  const settlementSummary = await settleBetMarketRows(supabase, marketId, market.market_scope, resultOptionId);
  await writeAuditLog(supabase, session, correction ? 'bet_market.settlement_corrected' : 'bet_market.settled', 'bet_market', marketId, { previous, next: { status: 'settled', resultOptionId, settlementNote }, settlementSummary });
  const bets = await runRows<Record<string, unknown>>(supabase.from('bets').select('*').eq('market_id', marketId), 'settled market bets');
  return jsonResponse(200, { ok: true, betMarket: mapBetMarket(updatedMarket), bets: bets.map(mapBet), settlementSummary });
});
