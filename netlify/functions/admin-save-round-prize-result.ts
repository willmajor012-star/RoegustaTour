import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalNumber, optionalString, runRows, runSingle, withAdminSupabase } from './_adminSupabase';
import { mapBetMarket, mapRoundPrizeResult } from './_mappers';
import { applyAutomaticBetDefaultsForMarket } from './_betDefaults';
import { writeAuditLog } from './_audit';
import type { BetMarket, RoundPrizeResult } from '../../src/lib/types';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;
const prizeTypes: RoundPrizeResult['prizeType'][] = ['individual_stableford', 'team_gross', 'custom'];

type LinkedMarketRow = {
  id: string;
  tour_id: string;
  round_id: string | null;
  market_type: BetMarket['marketType'];
  market_scope: BetMarket['marketScope'];
  status: BetMarket['status'];
  closes_at: string | null;
  required: boolean | null;
  result_option_id: string | null;
};
type AtomicPrizeSave = {
  roundPrizeResult: Record<string, unknown>;
  settlement: {
    betMarket: Record<string, unknown>;
    settlementSummary: { totalPotPence: number; settledBetCount: number; winningBetCount: number };
  } | null;
};

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body, session) => {
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
  let linkedBetMarketId = optionalString(body.linkedBetMarketId);
  if (published && prizeType === 'individual_stableford' && !winnerPlayerId) return badRequest('Choose the highest Stableford player before publishing.');
  if (published && prizeType === 'team_gross' && !winnerTeamId) return badRequest('Choose the lowest scramble gross team before publishing.');
  if (winnerPlayerId) {
    const players = await runRows<{ id: string }>(supabase.from('players').select('id').eq('id', winnerPlayerId).limit(1), 'find prize winner player');
    if (players.length === 0) return badRequest('Winner player must exist.');
    const attending = await runRows<{ player_id: string }>(supabase.from('tour_players').select('player_id').eq('tour_id', tourId).eq('player_id', winnerPlayerId).eq('attending', true).limit(1), 'find prize winner tour player');
    if (attending.length === 0) return badRequest('Winner player must be attending this tour.');
  }
  if (winnerTeamId) {
    const teams = await runRows<{ id: string }>(supabase.from('tour_teams').select('id').eq('id', winnerTeamId).eq('tour_id', tourId).limit(1), 'find prize winner team');
    if (teams.length === 0) return badRequest('Winner team must belong to this tour.');
  }
  let linkedMarket: LinkedMarketRow | undefined;
  if (prizeType !== 'custom') {
    const marketType = prizeType === 'team_gross' ? 'team_result' : 'player_performance';
    const markets = linkedBetMarketId
      ? await runRows<LinkedMarketRow>(supabase.from('bet_markets').select('id, tour_id, round_id, market_type, market_scope, status, closes_at, required, result_option_id').eq('id', linkedBetMarketId).limit(1), 'find linked prize Bet Punto market')
      : await runRows<LinkedMarketRow>(supabase.from('bet_markets').select('id, tour_id, round_id, market_type, market_scope, status, closes_at, required, result_option_id').eq('tour_id', tourId).eq('round_id', roundId).eq('market_type', marketType).in('status', ['open', 'closed', 'settled']), 'find round prize Bet Punto market');
    linkedMarket = markets.find((market) => market.tour_id === tourId && market.round_id === roundId && market.market_type === marketType && market.required) ?? markets.find((market) => market.tour_id === tourId && market.round_id === roundId && market.market_type === marketType);
    if (linkedBetMarketId && !linkedMarket) return badRequest('Linked Bet Punto market must belong to this tour, round and prize type.');
    linkedBetMarketId = linkedMarket?.id ?? null;
  } else if (linkedBetMarketId) {
    const markets = await runRows<LinkedMarketRow>(supabase.from('bet_markets').select('id, tour_id, round_id, market_type, market_scope, status, closes_at, required, result_option_id').eq('id', linkedBetMarketId).limit(1), 'find linked custom prize Bet Punto market');
    linkedMarket = markets.find((market) => market.tour_id === tourId && market.round_id === roundId);
    if (!linkedMarket) return badRequest('Linked Bet Punto market must belong to this tour and round.');
  }

  let winnerOptionId: string | undefined;
  if (published && linkedMarket) {
    if (linkedMarket.status === 'void' || linkedMarket.status === 'draft') return badRequest('The linked Bet Punto market must be open or closed before publishing its playing winner.');
    const closeTime = linkedMarket.closes_at ? Date.parse(linkedMarket.closes_at) : Number.NaN;
    if (linkedMarket.required && !Number.isFinite(closeTime)) return badRequest('The linked market has no valid fixed first-tee close time.');
    if (linkedMarket.required && closeTime > Date.now()) return badRequest('The playing winner cannot be published before the market closes at the first tee time.');
    const options = await runRows<{ id: string; linked_player_id: string | null; linked_team_id: string | null }>(
      supabase.from('bet_options').select('id, linked_player_id, linked_team_id').eq('market_id', linkedMarket.id),
      'find playing winner Bet Punto option',
    );
    winnerOptionId = options.find((option) => prizeType === 'team_gross' ? option.linked_team_id === winnerTeamId : option.linked_player_id === winnerPlayerId)?.id;
    if (!winnerOptionId) return badRequest('The linked Bet Punto market has no option matching this playing winner.');
    if (linkedMarket.required) {
      const defaults = await applyAutomaticBetDefaultsForMarket(supabase, linkedMarket.id);
      if (defaults.unresolved.length > 0) return badRequest('Automatic defaults could not be assigned for every attending player. Check player options and team assignments before publishing the winner.');
    }
  }
  const saved = await runSingle<AtomicPrizeSave>(supabase.rpc('admin_save_round_prize_result_atomic', {
    p_id: id,
    p_tour_id: tourId,
    p_round_id: roundId,
    p_prize_type: prizeType,
    p_title: title,
    p_winner_player_id: prizeType === 'team_gross' ? null : winnerPlayerId,
    p_winner_team_id: prizeType === 'team_gross' ? winnerTeamId : null,
    p_winning_score_text: optionalString(body.winningScoreText),
    p_score_value: optionalNumber(body.scoreValue),
    p_score_unit: optionalString(body.scoreUnit),
    p_notes: optionalString(body.notes),
    p_linked_bet_market_id: linkedBetMarketId,
    p_published: published,
    p_winner_option_id: winnerOptionId ?? null,
    p_market_result_text: optionalString(body.winningScoreText) ?? title,
  }), 'save prize result and settle linked market atomically');
  const settledMarket = saved.settlement?.betMarket;
  const settlementSummary = saved.settlement?.settlementSummary;
  if (published && linkedMarket && winnerOptionId && settlementSummary) {
    await writeAuditLog(supabase, session, linkedMarket.status === 'settled' ? 'bet_market.settlement_corrected_from_prize' : 'bet_market.settled_from_prize', 'bet_market', linkedMarket.id, {
      tourId,
      roundId,
      prizeResultId: String(saved.roundPrizeResult.id),
      winnerOptionId,
      settlementSummary,
    });
  }
  return jsonResponse(200, {
    ok: true,
    roundPrizeResult: mapRoundPrizeResult(saved.roundPrizeResult),
    betMarket: settledMarket ? mapBetMarket(settledMarket) : undefined,
    settlementSummary,
  });
});
