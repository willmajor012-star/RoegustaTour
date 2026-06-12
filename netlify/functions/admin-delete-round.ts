import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, runRows, withAdminSupabase } from './_adminSupabase';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body) => {
  const id = optionalString(body.id);
  const tourId = optionalString(body.tourId);
  if (!id) return badRequest('Round ID is required.');
  if (!tourId) return badRequest('Tour ID is required.');

  const rounds = await runRows<{ id: string; tour_id: string; status: string }>(supabase.from('rounds').select('id, tour_id, status').eq('id', id).limit(1), 'find round to delete');
  if (rounds.length === 0) return badRequest('Round does not exist.');
  if (rounds[0].tour_id !== tourId) return badRequest('Round does not belong to this tour.');
  if (rounds[0].status === 'complete') return badRequest('Complete rounds cannot be deleted from admin.');
  if (rounds[0].status === 'active') return badRequest('Active rounds cannot be deleted from admin. Move the round back to draft or planned first.');

  const [completedMatches, playerResults, protectedMarkets, allMarkets] = await Promise.all([
    runRows(supabase.from('matches').select('id').eq('round_id', id).eq('status', 'complete').limit(1), 'completed round matches for delete'),
    runRows(supabase.from('player_match_results').select('id').eq('round_id', id).limit(1), 'round player results for delete'),
    runRows<{ id: string }>(supabase.from('bet_markets').select('id').eq('round_id', id).in('status', ['open', 'closed', 'settled']).limit(1), 'protected round Bet Punto markets for delete'),
    runRows<{ id: string }>(supabase.from('bet_markets').select('id').eq('round_id', id), 'round Bet Punto markets for delete'),
  ]);
  if (completedMatches.length > 0) return badRequest('Rounds with completed matches cannot be deleted. Move or reopen those matches first.');
  if (playerResults.length > 0) return badRequest('Rounds with player match results cannot be deleted. Result history is protected.');
  if (protectedMarkets.length > 0) return badRequest('Rounds linked to open, closed or settled Bet Punto markets cannot be deleted. Void those markets first.');

  const marketIds = allMarkets.map((market) => market.id);
  const bets = marketIds.length > 0 ? await runRows(supabase.from('bets').select('id').in('market_id', marketIds).limit(1), 'round Bet Punto bets for delete') : [];
  if (bets.length > 0) return badRequest('Rounds with Bet Punto bets cannot be deleted. Bet history is protected.');

  const matches = await runRows(supabase.from('matches').select('id').eq('round_id', id).limit(1), 'round matches for delete');
  if (matches.length > 0) return badRequest('Rounds with draft, planned or active matches cannot be deleted. Delete or move the matches first.');

  const deleted = await supabase.from('rounds').delete().eq('id', id);
  if (deleted.error) throw new Error(`delete round: ${deleted.error.message}`);

  return jsonResponse(200, { ok: true, deletedRoundId: id });
});
