import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, runRows, withAdminSupabase } from './_adminSupabase';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body) => {
  const id = optionalString(body.id);
  if (!id) return badRequest('Bet ID is required.');

  const existing = await runRows<{ id: string }>(supabase.from('bets').select('id').eq('id', id).limit(1), 'find bet to delete');
  if (existing.length === 0) return badRequest('Bet does not exist.');

  const deleted = await supabase.from('bets').delete().eq('id', id);
  if (deleted.error) throw new Error(`delete bet: ${deleted.error.message}`);

  return jsonResponse(200, { ok: true, deletedBetId: id });
});
