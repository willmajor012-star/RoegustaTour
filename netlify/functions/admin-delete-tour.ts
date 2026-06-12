import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, runRows, withAdminSupabase } from './_adminSupabase';

const protectedYears = new Set([2022, 2023, 2024, 2025]);

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body) => {
  const id = optionalString(body.id);
  if (!id) return badRequest('Tour ID is required.');

  const tours = await runRows<{ id: string; name: string; year: number; status: string }>(supabase.from('tours').select('id, name, year, status').eq('id', id).limit(1), 'find tour to delete');
  if (tours.length === 0) return badRequest('Tour does not exist.');
  const tour = tours[0];

  if (protectedYears.has(Number(tour.year))) return badRequest('Roegusta tours from 2022, 2023, 2024 and 2025 are protected and cannot be deleted from admin.');
  if (tour.status === 'complete' || tour.status === 'archived') return badRequest('Complete or archived tours cannot be deleted from admin. Archive protects historic data.');

  const [completedMatches, playerResults, historicalStats, protectedMarkets, allMarkets] = await Promise.all([
    runRows(supabase.from('matches').select('id').eq('tour_id', id).eq('status', 'complete').limit(1), 'completed matches for tour delete'),
    runRows(supabase.from('player_match_results').select('id').eq('tour_id', id).limit(1), 'player results for tour delete'),
    runRows(supabase.from('historical_player_stats').select('id').eq('tour_id', id).limit(1), 'historical stats for tour delete').catch(() => []),
    runRows<{ id: string; status: string }>(supabase.from('bet_markets').select('id, status').eq('tour_id', id).in('status', ['open', 'closed', 'settled']).limit(1), 'protected Bet Punto markets for tour delete'),
    runRows<{ id: string }>(supabase.from('bet_markets').select('id').eq('tour_id', id), 'Bet Punto markets for tour delete'),
  ]);

  if (completedMatches.length > 0 || playerResults.length > 0 || historicalStats.length > 0) {
    return badRequest('Tours with completed matches, player results or historical stats cannot be deleted. Archive the tour instead.');
  }
  if (protectedMarkets.length > 0) return badRequest('Tours with open, closed or settled Bet Punto markets cannot be deleted. Void those markets first.');

  const marketIds = allMarkets.map((market) => market.id);
  const bets = marketIds.length > 0 ? await runRows(supabase.from('bets').select('id').in('market_id', marketIds).limit(1), 'Bet Punto bets for tour delete') : [];
  if (bets.length > 0) return badRequest('Tours with Bet Punto bets cannot be deleted. Bet history is protected.');

  const deleted = await supabase.from('tours').delete().eq('id', id);
  if (deleted.error) throw new Error(`delete tour: ${deleted.error.message}`);

  return jsonResponse(200, { ok: true, deletedTourId: id });
});
