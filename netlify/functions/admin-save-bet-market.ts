import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalNumber, optionalString, runRows, runSingle, withAdminSupabase } from './_adminSupabase';
import { mapBetMarket, mapBetOption } from './_mappers';
import { settleBetMarketRows } from './_betSettlement';
import { writeAuditLog } from './_audit';
import type { BetMarket, BetOption } from '../../src/lib/types';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

const marketTypes: BetMarket['marketType'][] = ['match_winner', 'player_performance', 'team_result', 'over_under', 'special', 'custom'];
const marketScopes: BetMarket['marketScope'][] = ['general_pot', 'special'];
const statuses: BetMarket['status'][] = ['open', 'closed', 'settled', 'void'];
const sides: NonNullable<BetOption['linkedMatchSide']>[] = ['A', 'B', 'halved'];
const marketScopeSchemaMessage = 'Bet Punto market scope is not available in the live schema yet. Run the latest Supabase migrations, then refresh the admin page.';

type OptionInput = {
  id?: string;
  label: string;
  linkedPlayerId?: string | null;
  linkedTeamId?: string | null;
  linkedMatchSide?: BetOption['linkedMatchSide'] | null;
  oddsDecimal?: number | null;
  sortOrder: number;
};

function parseOptions(value: unknown): OptionInput[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((entry, index) => {
    const row = entry as Record<string, unknown>;
    return {
      id: optionalString(row.id) ?? undefined,
      label: optionalString(row.label) ?? '',
      linkedPlayerId: optionalString(row.linkedPlayerId),
      linkedTeamId: optionalString(row.linkedTeamId),
      linkedMatchSide: optionalString(row.linkedMatchSide) as BetOption['linkedMatchSide'] | null,
      oddsDecimal: optionalNumber(row.oddsDecimal),
      sortOrder: optionalNumber(row.sortOrder) ?? index,
    };
  });
}

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body, session) => {
  const id = optionalString(body.id);
  const tourId = optionalString(body.tourId);
  const roundId = optionalString(body.roundId);
  const matchId = optionalString(body.matchId);
  const title = optionalString(body.title);
  const marketType = optionalString(body.marketType) as BetMarket['marketType'] | null;
  const marketScope = optionalString(body.marketScope) as BetMarket['marketScope'] | null;
  const status = optionalString(body.status) as BetMarket['status'] | null;
  const options = parseOptions(body.options);
  const resultOptionId = optionalString(body.resultOptionId);

  if (!tourId) return badRequest('Tour ID is required.');
  if (!title) return badRequest('Market title is required.');
  if (!marketType || !marketTypes.includes(marketType)) return badRequest('Market type is invalid.');
  if (!marketScope || !marketScopes.includes(marketScope)) return badRequest('Market scope is invalid.');
  if (!status || !statuses.includes(status)) return badRequest('Market status is invalid.');
  if (!options || options.length === 0) return badRequest('At least one option is required.');
  if (options.some((option) => option.label.trim().length === 0)) return badRequest('Every option needs a label.');
  if (options.some((option) => option.oddsDecimal !== null && option.oddsDecimal !== undefined && option.oddsDecimal <= 0)) return badRequest('Special odds must be greater than zero.');
  if (options.some((option) => option.linkedMatchSide && !sides.includes(option.linkedMatchSide))) return badRequest('Linked match side is invalid.');
  if (status === 'settled' && !resultOptionId) return badRequest('Settled markets require a result option.');
  if (resultOptionId && !options.some((option) => option.id === resultOptionId)) return badRequest('Result option must be one of this market\'s saved options.');

  const tours = await runRows(supabase.from('tours').select('id').eq('id', tourId).limit(1), 'find bet market tour');
  if (tours.length === 0) return badRequest('Tour must exist.');
  if (roundId) {
    const rounds = await runRows<{ id: string; tour_id: string }>(supabase.from('rounds').select('id, tour_id').eq('id', roundId).limit(1), 'find bet market round');
    if (rounds.length === 0 || rounds[0].tour_id !== tourId) return badRequest('Round must belong to this tour.');
  }
  if (matchId) {
    const matches = await runRows<{ id: string; tour_id: string }>(supabase.from('matches').select('id, tour_id').eq('id', matchId).limit(1), 'find bet market match');
    if (matches.length === 0 || matches[0].tour_id !== tourId) return badRequest('Match must belong to this tour.');
  }

  const marketId = id ?? crypto.randomUUID();
  const marketRow = {
    id: marketId,
    tour_id: tourId,
    round_id: roundId,
    match_id: matchId,
    title,
    description: optionalString(body.description),
    market_type: marketType,
    market_scope: marketScope,
    status,
    closes_at: optionalString(body.closesAt),
    result_option_id: null,
    result_text: optionalString(body.resultText),
  };

  const query = id
    ? supabase.from('bet_markets').update(marketRow).eq('id', id).select('*').single()
    : supabase.from('bet_markets').insert(marketRow).select('*').single();
  try {
    await runSingle<Record<string, unknown>>(query, 'save bet market');
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('market_scope') && message.toLowerCase().includes('schema cache')) return badRequest(marketScopeSchemaMessage);
    throw error;
  }

  const existingOptions = await runRows<{ id: string }>(supabase.from('bet_options').select('id').eq('market_id', marketId), 'existing bet options');
  const nextIds = new Set(options.map((option) => option.id).filter(Boolean));
  const deleteIds = existingOptions.map((option) => option.id).filter((optionId) => !nextIds.has(optionId));
  if (deleteIds.length > 0) {
    const optionBets = await runRows<{ option_id: string }>(supabase.from('bets').select('option_id').in('option_id', deleteIds).limit(1), 'find bets for removed options');
    if (optionBets.length > 0) return badRequest('Options with logged bets cannot be removed. Rename or close the market instead.');
    const deleted = await supabase.from('bet_options').delete().in('id', deleteIds);
    if (deleted.error) throw new Error(`delete bet options: ${deleted.error.message}`);
  }

  for (const option of options) {
    const optionRow = {
      id: option.id ?? crypto.randomUUID(),
      market_id: marketId,
      label: option.label.trim(),
      linked_player_id: option.linkedPlayerId,
      linked_team_id: option.linkedTeamId,
      linked_match_side: option.linkedMatchSide,
      odds_decimal: option.oddsDecimal,
      sort_order: option.sortOrder,
    };
    const saved = option.id
      ? await supabase.from('bet_options').update(optionRow).eq('id', option.id)
      : await supabase.from('bet_options').insert(optionRow);
    if (saved.error) throw new Error(`save bet option: ${saved.error.message}`);
  }

  if (status === 'settled' && !resultOptionId) return badRequest('Settled markets require a result option.');
  if (resultOptionId) {
    const resultOptions = await runRows<{ id: string }>(supabase.from('bet_options').select('id').eq('id', resultOptionId).eq('market_id', marketId).limit(1), 'find result option');
    if (resultOptions.length === 0) return badRequest('Result option must belong to this market.');
  }
  const updatedMarket = await runSingle<Record<string, unknown>>(supabase.from('bet_markets').update({ result_option_id: resultOptionId }).eq('id', marketId).select('*').single(), 'save bet result option');
  const optionRows = await runRows<Record<string, unknown>>(supabase.from('bet_options').select('*').eq('market_id', marketId).order('sort_order', { ascending: true }), 'saved bet options');
  if (status === 'settled' && resultOptionId) {
    const settlementSummary = await settleBetMarketRows(supabase, marketId, marketScope, resultOptionId);
    await writeAuditLog(supabase, session, 'bet_market.settled_via_save', 'bet_market', marketId, { tourId, resultOptionId, settlementSummary });
  }
  if (status === 'void') {
    await writeAuditLog(supabase, session, 'bet_market.voided', 'bet_market', marketId, { tourId });
    const voided = await supabase.from('bets').update({ outcome_status: 'void', payout_amount_pence: null, payout_status: 'not_applicable' }).eq('market_id', marketId).eq('status', 'active');
    if (voided.error) throw new Error(`void market bets: ${voided.error.message}`);
  }

  return jsonResponse(200, { ok: true, betMarket: mapBetMarket(updatedMarket), betOptions: optionRows.map(mapBetOption) });
});
