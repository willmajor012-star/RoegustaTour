import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalNumber, optionalString, runRows, runSingle, withAdminSupabase } from './_adminSupabase';
import { mapRoundPrizeResult } from './_mappers';
import type { RoundPrizeResult } from '../../src/lib/types';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;
const prizeTypes: RoundPrizeResult['prizeType'][] = ['individual_stableford', 'team_gross', 'custom'];

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body) => {
  const id = optionalString(body.id);
  const tourId = optionalString(body.tourId);
  const roundId = optionalString(body.roundId);
  const prizeType = optionalString(body.prizeType) as RoundPrizeResult['prizeType'] | null;
  const title = optionalString(body.title);
  const published = typeof body.published === 'boolean' ? body.published : true;
  if (!tourId) return badRequest('Tour ID is required.');
  if (!roundId) return badRequest('Round is required.');
  if (!prizeType || !prizeTypes.includes(prizeType)) return badRequest('Prize type is invalid.');
  if (!title) return badRequest('Prize title is required.');

  const rounds = await runRows<{ id: string; tour_id: string }>(supabase.from('rounds').select('id, tour_id').eq('id', roundId).limit(1), 'find prize round');
  if (rounds.length === 0) return badRequest('Round must exist.');
  if (rounds[0].tour_id !== tourId) return badRequest('Round does not belong to this tour.');
  if (id) {
    const existing = await runRows<{ id: string; tour_id: string }>(supabase.from('round_prize_results').select('id, tour_id').eq('id', id).limit(1), 'find prize result');
    if (existing.length === 0) return badRequest('Prize result must exist.');
    if (existing[0].tour_id !== tourId) return badRequest('Prize result does not belong to this tour.');
  }

  const winnerPlayerId = optionalString(body.winnerPlayerId);
  const winnerTeamId = optionalString(body.winnerTeamId);
  const row = {
    id: id ?? crypto.randomUUID(),
    tour_id: tourId,
    round_id: roundId,
    prize_type: prizeType,
    title,
    winner_player_id: prizeType === 'team_gross' ? null : winnerPlayerId,
    winner_team_id: prizeType === 'team_gross' ? winnerTeamId : null,
    winning_score_text: optionalString(body.winningScoreText),
    score_value: optionalNumber(body.scoreValue),
    score_unit: optionalString(body.scoreUnit),
    notes: optionalString(body.notes),
    linked_bet_market_id: optionalString(body.linkedBetMarketId),
    published,
    updated_at: new Date().toISOString(),
  };
  const query = id ? supabase.from('round_prize_results').update(row).eq('id', id).select('*').single() : supabase.from('round_prize_results').insert(row).select('*').single();
  const saved = await runSingle<Record<string, unknown>>(query, 'save round prize result');
  return jsonResponse(200, { ok: true, roundPrizeResult: mapRoundPrizeResult(saved) });
});
