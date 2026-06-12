import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, runRows, withAdminSupabase } from './_adminSupabase';

export const handler: (event: FunctionEvent) => Promise<FunctionResponse> = (event) => withAdminSupabase(event, 'POST', async (supabase, body) => {
  const id = optionalString(body.id);
  const tourId = optionalString(body.tourId);
  if (!id) return badRequest('Match ID is required.');
  if (!tourId) return badRequest('Tour ID is required.');

  const matches = await runRows<{ id: string; tour_id: string; status: string; published?: boolean }>(supabase.from('matches').select('id, tour_id, status, published').eq('id', id).limit(1), 'find match to delete');
  if (matches.length === 0) return badRequest('Match does not exist.');
  const match = matches[0];
  if (match.tour_id !== tourId) return badRequest('Match does not belong to this tour.');
  if (match.status === 'complete') return badRequest('Complete matches cannot be deleted. Change the status away from complete only if you intentionally want to remove generated results first.');
  if (match.published === true) return badRequest('Published matches cannot be deleted through the draft match safe-delete flow. Unpublish the match first if it is safe to remove.');

  const [results, markets] = await Promise.all([
    runRows(supabase.from('player_match_results').select('id').eq('match_id', id).limit(1), 'player results for match delete'),
    runRows<{ id: string; status: string }>(supabase.from('bet_markets').select('id, status').eq('match_id', id), 'Bet Punto markets for match delete'),
  ]);
  if (results.length > 0) return badRequest('Matches with player result rows cannot be deleted. Remove or regenerate results by changing the match status first.');

  const protectedMarkets = markets.filter((market) => market.status !== 'void');
  if (protectedMarkets.length > 0) return badRequest('Matches linked to open, closed or settled Bet Punto markets cannot be deleted. Void those markets first.');

  const marketIds = markets.map((market) => market.id);
  const bets = marketIds.length > 0 ? await runRows(supabase.from('bets').select('id').in('market_id', marketIds).limit(1), 'Bet Punto bets for match delete') : [];
  if (bets.length > 0) return badRequest('Matches with Bet Punto bets cannot be deleted. Bet history is protected.');

  const participantDelete = await supabase.from('match_participants').delete().eq('match_id', id);
  if (participantDelete.error) throw new Error(`delete match participants: ${participantDelete.error.message}`);
  const deleted = await supabase.from('matches').delete().eq('id', id);
  if (deleted.error) throw new Error(`delete match: ${deleted.error.message}`);

  return jsonResponse(200, { ok: true, deletedMatchId: id });
});
