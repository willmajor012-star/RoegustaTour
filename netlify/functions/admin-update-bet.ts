import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalNumber, optionalString, runRows, runSingle, withAdminSupabase } from './_adminSupabase';
import { mapBet } from './_mappers';
import { writeAuditLog } from './_audit';
import type { Bet } from '../../src/lib/types';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

const statuses: Bet['status'][] = ['active', 'void'];
const outcomeStatuses: Bet['outcomeStatus'][] = ['pending', 'won', 'lost', 'void', 'push'];
const payoutStatuses: Bet['payoutStatus'][] = ['unpaid', 'paid', 'not_applicable'];

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body, session) => {
  const id = optionalString(body.id);
  const status = optionalString(body.status) as Bet['status'] | null;
  const outcomeStatus = optionalString(body.outcomeStatus) as Bet['outcomeStatus'] | null;
  const payoutStatus = optionalString(body.payoutStatus) as Bet['payoutStatus'] | null;
  const payoutAmountPence = optionalNumber(body.payoutAmountPence);
  const adminNotes = optionalString(body.adminNotes);
  const voidReason = optionalString(body.voidReason);

  if (!id) return badRequest('Bet ID is required.');
  if (!status || !statuses.includes(status)) return badRequest('Bet status is invalid.');
  if (!outcomeStatus || !outcomeStatuses.includes(outcomeStatus)) return badRequest('Bet outcome status is invalid.');
  if (!payoutStatus || !payoutStatuses.includes(payoutStatus)) return badRequest('Payout status is invalid.');
  if (payoutAmountPence !== null && (!Number.isInteger(payoutAmountPence) || payoutAmountPence < 0)) return badRequest('Payout amount must be zero or greater.');

  const existing = await runRows<Record<string, unknown>>(supabase.from('bets').select('*').eq('id', id).limit(1), 'find bet');
  if (existing.length === 0) return badRequest('Bet must exist.');

  const saved = await runSingle<Record<string, unknown>>(supabase.from('bets').update({
    status,
    outcome_status: outcomeStatus,
    payout_status: payoutStatus,
    payout_amount_pence: payoutAmountPence,
    payout_notes: optionalString(body.payoutNotes),
    admin_notes: adminNotes,
    void_reason: status === 'void' ? (voidReason ?? adminNotes ?? 'Voided by admin') : null,
    updated_at: new Date().toISOString(),
  }).eq('id', id).select('*').single(), 'update bet');

  await writeAuditLog(supabase, session, status === 'void' ? 'bet.voided' : 'bet.updated', 'bet', id, { previous: existing[0], next: { status, outcomeStatus, payoutStatus, payoutAmountPence, payoutNotes: optionalString(body.payoutNotes) } });

  return jsonResponse(200, { ok: true, bet: mapBet(saved) });
});
