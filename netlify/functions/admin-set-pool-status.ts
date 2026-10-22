import { jsonResponse, type FunctionEvent } from './_adminAuth';
import { badRequest, optionalString, runSingle, withAdminSupabase } from './_adminSupabase';
import { writeAuditLog } from './_audit';
export const handler = (event: FunctionEvent) => withAdminSupabase(event, 'POST', async (db, body, session) => {
  const marketId = optionalString(body.marketId), tourId = optionalString(body.tourId), status = optionalString(body.status);
  if (!marketId || !tourId || !status || !['draft', 'open', 'closed', 'void'].includes(status)) return badRequest('Choose a pool and valid status.');
  const market = await runSingle<Record<string, unknown>>(db.from('bet_markets').select('*').eq('id', marketId).eq('tour_id', tourId).single(), 'find pool');
  if (!market.pool_key) return badRequest('Use the market editor for this market.');
  if (status === 'void') await runSingle(db.rpc('admin_void_bet_market_atomic', { p_market_id: marketId }), 'void pool');
  else await runSingle(db.rpc('admin_set_tour_pool_status', { p_market_id: marketId, p_tour_id: tourId, p_status: status, p_actor: session.actorLabel ?? 'Tour admin' }), 'change pool status');
  await writeAuditLog(db, session, 'bet_pool.status', 'bet_market', marketId, { previousStatus: market.status, status, tourId });
  return jsonResponse(200, { ok: true });
});
