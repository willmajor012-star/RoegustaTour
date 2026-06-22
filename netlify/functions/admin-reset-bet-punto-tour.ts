import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, runRows, withAdminSupabase } from './_adminSupabase';
import { writeAuditLog } from './_audit';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

const REQUIRED_CONFIRMATION = 'RESET BET PUNTO';

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body, session) => {
  const tourId = optionalString(body.tourId);
  const confirmation = optionalString(body.confirmation);
  const forceCurrent = body.forceCurrent === true;
  if (!tourId) return badRequest('Tour ID is required.');
  if (confirmation !== REQUIRED_CONFIRMATION) return badRequest(`Type ${REQUIRED_CONFIRMATION} to reset Bet Punto for this tour.`);

  const tours = await runRows<{ id: string; name: string; status: string; is_current_public?: boolean | null }>(
    supabase.from('tours').select('id, name, status, is_current_public').eq('id', tourId).limit(1),
    'find reset tour',
  );
  if (tours.length === 0) return badRequest('Tour does not exist.');
  const tour = tours[0];
  const isCurrentLike = tour.is_current_public || tour.status === 'active';
  if (isCurrentLike && !forceCurrent) return badRequest('This is the current/active tour. Tick the strong confirmation before resetting its Bet Punto data.');

  const markets = await runRows<{ id: string }>(supabase.from('bet_markets').select('id').eq('tour_id', tourId), 'find tour Bet Punto markets');
  const marketIds = markets.map((market) => market.id);
  let deletedBetCount = 0;
  let deletedOptionCount = 0;
  if (marketIds.length > 0) {
    const [bets, options] = await Promise.all([
      runRows<{ id: string }>(supabase.from('bets').select('id').in('market_id', marketIds), 'count reset bets'),
      runRows<{ id: string }>(supabase.from('bet_options').select('id').in('market_id', marketIds), 'count reset options'),
    ]);
    deletedBetCount = bets.length;
    deletedOptionCount = options.length;

    const deletedBets = await supabase.from('bets').delete().in('market_id', marketIds);
    if (deletedBets.error) throw new Error(`delete reset bets: ${deletedBets.error.message}`);
    const deletedOptions = await supabase.from('bet_options').delete().in('market_id', marketIds);
    if (deletedOptions.error) throw new Error(`delete reset options: ${deletedOptions.error.message}`);
    const deletedMarkets = await supabase.from('bet_markets').delete().eq('tour_id', tourId);
    if (deletedMarkets.error) throw new Error(`delete reset markets: ${deletedMarkets.error.message}`);
  }

  await writeAuditLog(supabase, session, 'bet_punto.tour_reset', 'tour', tourId, {
    tourName: tour.name,
    tourStatus: tour.status,
    forceCurrent,
    deletedMarketCount: markets.length,
    deletedOptionCount,
    deletedBetCount,
  });

  return jsonResponse(200, { ok: true, tourId, deletedMarketCount: markets.length, deletedOptionCount, deletedBetCount });
});
