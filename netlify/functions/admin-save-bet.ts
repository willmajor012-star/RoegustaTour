import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalNumber, optionalString, runRows, runSingle, withAdminSupabase } from './_adminSupabase';
import { mapBet } from './_mappers';
import { writeAuditLog } from './_audit';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

function stakeText(stakeAmountPence: number) {
  return `£${(stakeAmountPence / 100).toFixed(stakeAmountPence % 100 === 0 ? 0 : 2)}`;
}

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body, session) => {
  const id = optionalString(body.id);
  const marketId = optionalString(body.marketId);
  const optionId = optionalString(body.optionId);
  const bettorName = optionalString(body.bettorName);
  const bettorPlayerId = optionalString(body.bettorPlayerId);
  const stakeAmountPence = optionalNumber(body.stakeAmountPence);
  const comment = optionalString(body.comment);
  const adminNotes = optionalString(body.adminNotes);
  const voidReason = optionalString(body.voidReason);
  const status = optionalString(body.status) ?? 'active';

  if (!optionId) return badRequest('Option is required.');
  if (!bettorName) return badRequest('Bettor name is required.');
  if (stakeAmountPence === null || !Number.isInteger(stakeAmountPence) || stakeAmountPence <= 0) return badRequest('Stake must be a positive pounds-and-pence amount.');
  if (!['active', 'void'].includes(status)) return badRequest('Bet status is invalid.');

  const optionRows = await runRows<{ market_id: string }>(supabase.from('bet_options').select('market_id').eq('id', optionId).limit(1), 'find bet option');
  if (optionRows.length === 0) return badRequest('Option must exist.');
  const effectiveMarketId = marketId ?? optionRows[0].market_id;
  if (String(optionRows[0].market_id) !== effectiveMarketId) return badRequest('Option does not belong to this market.');

  const previous = id ? await runRows<Record<string, unknown>>(supabase.from('bets').select('*').eq('id', id).limit(1), 'find bet') : [];
  if (id && previous.length === 0) return badRequest('Bet must exist.');

  const row = {
    market_id: effectiveMarketId,
    option_id: optionId,
    bettor_name: bettorName.slice(0, 120),
    bettor_player_id: bettorPlayerId,
    stake_text: stakeText(stakeAmountPence),
    stake_amount_pence: stakeAmountPence,
    comment: comment?.slice(0, 240) ?? null,
    admin_entered: true,
    admin_notes: adminNotes,
    void_reason: status === 'void' ? (voidReason ?? adminNotes ?? 'Voided by admin') : null,
    status,
    outcome_status: status === 'void' ? 'void' : 'pending',
    payout_status: 'not_applicable',
    updated_at: new Date().toISOString(),
  };

  const saved = await runSingle<Record<string, unknown>>(id
    ? supabase.from('bets').update(row).eq('id', id).select('*').single()
    : supabase.from('bets').insert(row).select('*').single(), 'save admin bet');

  await writeAuditLog(supabase, session, id ? 'bet.admin_override_updated' : 'bet.admin_override_created', 'bet', String(saved.id), { previous: previous[0] ?? null, next: row });
  return jsonResponse(200, { ok: true, bet: mapBet(saved) });
});
