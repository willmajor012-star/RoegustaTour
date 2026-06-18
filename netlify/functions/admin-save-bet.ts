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
  if (!bettorPlayerId) return badRequest('Choose a live tour player for this bet.');
  if (stakeAmountPence === null || !Number.isInteger(stakeAmountPence) || stakeAmountPence <= 0) return badRequest('Stake must be a positive pounds-and-pence amount.');
  if (!['active', 'void'].includes(status)) return badRequest('Bet status is invalid.');

  const optionRows = await runRows<{ market_id: string; linked_player_id: string | null; bet_markets: { tour_id: string } | { tour_id: string }[] | null }>(supabase.from('bet_options').select('market_id, linked_player_id, bet_markets(tour_id)').eq('id', optionId).limit(1), 'find bet option');
  if (optionRows.length === 0) return badRequest('Option must exist.');
  const effectiveMarketId = marketId ?? optionRows[0].market_id;
  if (String(optionRows[0].market_id) !== effectiveMarketId) return badRequest('Option does not belong to this market.');
  const marketRow = Array.isArray(optionRows[0].bet_markets) ? optionRows[0].bet_markets[0] : optionRows[0].bet_markets;
  const tourId = marketRow?.tour_id;
  if (!tourId) return badRequest('Bet option must belong to a tour market.');
  const liveBettors = await runRows<{ player_id: string; players: { display_name: string; active: boolean } | { display_name: string; active: boolean }[] | null }>(supabase.from('tour_players').select('player_id, players(display_name, active)').eq('tour_id', tourId).eq('attending', true).eq('player_id', bettorPlayerId).limit(1), 'find live admin bettor');
  const liveBettorPlayer = liveBettors[0] ? (Array.isArray(liveBettors[0].players) ? liveBettors[0].players[0] : liveBettors[0].players) : null;
  if (!liveBettorPlayer?.active) return badRequest('Bettor must be an active attending player on this tour.');
  if (optionRows[0].linked_player_id) {
    const optionPlayer = await runRows<{ player_id: string; players: { active: boolean } | { active: boolean }[] | null }>(supabase.from('tour_players').select('player_id, players(active)').eq('tour_id', tourId).eq('attending', true).eq('player_id', optionRows[0].linked_player_id).limit(1), 'find live option player');
    const linked = optionPlayer[0] ? (Array.isArray(optionPlayer[0].players) ? optionPlayer[0].players[0] : optionPlayer[0].players) : null;
    if (!linked?.active) return badRequest('Bet option must be a live attending player on this tour.');
  }

  const previous = id ? await runRows<Record<string, unknown>>(supabase.from('bets').select('*').eq('id', id).limit(1), 'find bet') : [];
  if (id && previous.length === 0) return badRequest('Bet must exist.');

  const previousBet = previous[0];
  const row = {
    market_id: effectiveMarketId,
    option_id: optionId,
    bettor_name: liveBettorPlayer.display_name.slice(0, 120),
    bettor_player_id: bettorPlayerId,
    stake_text: stakeText(stakeAmountPence),
    stake_amount_pence: stakeAmountPence,
    comment: comment?.slice(0, 240) ?? null,
    admin_entered: true,
    admin_notes: adminNotes,
    void_reason: status === 'void' ? (voidReason ?? adminNotes ?? 'Voided by admin') : null,
    status,
    outcome_status: status === 'void' ? 'void' : (optionalString(previousBet?.outcome_status) ?? 'pending'),
    payout_status: status === 'void' ? 'not_applicable' : (optionalString(previousBet?.payout_status) ?? 'not_applicable'),
    payout_amount_pence: status === 'void' ? null : (typeof previousBet?.payout_amount_pence === 'number' ? previousBet.payout_amount_pence : previousBet?.payout_amount_pence ?? null),
    payout_notes: status === 'void' ? null : (optionalString(previousBet?.payout_notes) ?? null),
    updated_at: new Date().toISOString(),
  };

  const saved = await runSingle<Record<string, unknown>>(id
    ? supabase.from('bets').update(row).eq('id', id).select('*').single()
    : supabase.from('bets').insert(row).select('*').single(), 'save admin bet');

  await writeAuditLog(supabase, session, id ? 'bet.admin_override_updated' : 'bet.admin_override_created', 'bet', String(saved.id), { previous: previous[0] ?? null, next: row });
  return jsonResponse(200, { ok: true, bet: mapBet(saved) });
});
