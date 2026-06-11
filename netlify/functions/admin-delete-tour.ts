import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, runRows, withAdminSupabase } from './_adminSupabase';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body) => {
  const id = optionalString(body.id);
  if (!id) return badRequest('Tour ID is required.');

  const tours = await runRows<{ id: string; name: string }>(supabase.from('tours').select('id, name').eq('id', id).limit(1), 'find tour to delete');
  if (tours.length === 0) return badRequest('Tour does not exist.');

  const [completedMatches, playerResults, historicalStats] = await Promise.all([
    runRows(supabase.from('matches').select('id').eq('tour_id', id).eq('status', 'complete').limit(1), 'completed matches for tour delete'),
    runRows(supabase.from('player_match_results').select('id').eq('tour_id', id).limit(1), 'player results for tour delete'),
    runRows(supabase.from('historical_player_stats').select('id').eq('tour_id', id).limit(1), 'historical stats for tour delete').catch(() => []),
  ]);

  if (completedMatches.length > 0 || playerResults.length > 0 || historicalStats.length > 0) {
    return badRequest('Tours with completed matches or player results cannot be deleted. Archive the tour instead.');
  }

  const deleted = await supabase.from('tours').delete().eq('id', id);
  if (deleted.error) throw new Error(`delete tour: ${deleted.error.message}`);

  return jsonResponse(200, { ok: true, deletedTourId: id });
});
