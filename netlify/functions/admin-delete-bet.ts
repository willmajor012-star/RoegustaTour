import { type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, runRows, withAdminSupabase } from './_adminSupabase';
import { writeAuditLog } from './_audit';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body, session) => {
  const id = optionalString(body.id);
  if (!id) return badRequest('Bet ID is required.');

  const existing = await runRows<{ id: string; market_id: string; status: string }>(supabase.from('bets').select('id, market_id, status').eq('id', id).limit(1), 'find bet to delete');
  if (existing.length === 0) return badRequest('Bet does not exist.');
  await writeAuditLog(supabase, session, 'bet.delete_blocked', 'bet', id, { marketId: existing[0].market_id, status: existing[0].status });
  return badRequest('Bets with history cannot be deleted. Void the bet instead.');
});
