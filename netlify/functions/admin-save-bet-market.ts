import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalNumber, optionalString, runRows, runSingle, withAdminSupabase } from './_adminSupabase';
import { mapBetMarket, mapBetOption } from './_mappers';
import { normalizeMarketTitle } from '../../src/lib/betPuntoRules';
import { writeAuditLog } from './_audit';
import { requiredMarketDeadlineForRound } from './_betMarketDeadline';
import { applyAutomaticBetDefaultsForMarket } from './_betDefaults';
import type { BetMarket, BetOption } from '../../src/lib/types';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

const marketTypes: BetMarket['marketType'][] = ['match_winner', 'player_performance', 'team_result', 'over_under', 'special', 'custom'];
const marketScopes: BetMarket['marketScope'][] = ['general_pot', 'special'];
const statuses: BetMarket['status'][] = ['draft', 'open', 'closed', 'settled', 'void'];
const sides: NonNullable<BetOption['linkedMatchSide']>[] = ['A', 'B', 'halved'];
const betPuntoSchemaMessage0013 = 'Bet Punto settlement columns are not available in the live schema yet. Run Supabase migration 0013_bet_punto_round_market_schema_refresh.sql; it repairs Bet Punto round/settlement columns and reloads the Supabase schema cache.';
const betPuntoSchemaMessage0014 = 'Bet Punto draft/required market support is not available in the live schema yet. Run Supabase migration 0014_bet_punto_tour_reset_required_draft.sql, then reload the Supabase/PostgREST schema cache.';

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
  const required = Boolean(body.required);
  let closesAt = optionalString(body.closesAt);

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
  if (required && !roundId) return badRequest('Required Bet Punto markets must be linked to a round.');
  if (required && !['player_performance', 'team_result'].includes(marketType)) return badRequest('Required Bet Punto markets must be highest Stableford or lowest scramble gross.');

  const duplicateRows = await runRows<{ id: string; title: string; market_scope: string; round_id: string | null; match_id: string | null; status: string }>(
    supabase.from('bet_markets').select('id, title, market_scope, round_id, match_id, status').eq('tour_id', tourId).eq('status', 'open').eq('market_scope', marketScope),
    'find duplicate open Bet Punto markets',
  );
  const duplicate = duplicateRows.find((market) => market.id !== id
    && normalizeMarketTitle(market.title) === normalizeMarketTitle(title)
    && (market.round_id || null) === (roundId || null)
    && (market.match_id || null) === (matchId || null));
  if (duplicate) return badRequest('An identical open Bet Punto market already exists for this tour, scope, title, round and match. Close, settle or edit the existing market first.');

  const tours = await runRows(supabase.from('tours').select('id').eq('id', tourId).limit(1), 'find bet market tour');
  if (tours.length === 0) return badRequest('Tour must exist.');
  if (roundId) {
    const rounds = await runRows<{ id: string; tour_id: string }>(supabase.from('rounds').select('id, tour_id').eq('id', roundId).limit(1), 'find bet market round');
    if (rounds.length === 0 || rounds[0].tour_id !== tourId) return badRequest('Round must belong to this tour.');
    if (required) {
      const deadline = await requiredMarketDeadlineForRound(supabase, roundId);
      if (!deadline.closesAt) return badRequest(deadline.warning ?? 'Set a valid first tee time before saving this required market.');
      closesAt = deadline.closesAt;
    }
  }
  if (matchId) {
    const matches = await runRows<{ id: string; tour_id: string }>(supabase.from('matches').select('id, tour_id').eq('id', matchId).limit(1), 'find bet market match');
    if (matches.length === 0 || matches[0].tour_id !== tourId) return badRequest('Match must belong to this tour.');
  }
  const linkedPlayerIds = [...new Set(options.map((option) => option.linkedPlayerId).filter((playerId): playerId is string => Boolean(playerId)))];
  if (linkedPlayerIds.length > 0) {
    const liveOptionPlayers = await runRows<{ player_id: string; players: { active: boolean } | { active: boolean }[] | null }>(supabase.from('tour_players').select('player_id, players(active)').eq('tour_id', tourId).eq('attending', true).in('player_id', linkedPlayerIds), 'find live option players');
    const validLivePlayerIds = new Set(liveOptionPlayers.filter((row) => { const player = Array.isArray(row.players) ? row.players[0] : row.players; return player?.active; }).map((row) => row.player_id));
    if (linkedPlayerIds.some((playerId) => !validLivePlayerIds.has(playerId))) return badRequest('Player-linked Bet Punto options must be active attending players on this tour.');
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
    closes_at: closesAt,
    result_option_id: null,
    result_text: optionalString(body.resultText),
    required,
    defaults_applied_at: null,
  };

  const query = id
    ? supabase.from('bet_markets').update(marketRow).eq('id', id).select('*').single()
    : supabase.from('bet_markets').insert(marketRow).select('*').single();
  try {
    await runSingle<Record<string, unknown>>(query, 'save bet market');
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/required|draft|status|bet_markets_status_check|schema cache/i.test(message)) return badRequest(betPuntoSchemaMessage0014);
    if (/market_scope|result_option_id|result_text|round_id|match_id|closes_at/i.test(message)) return badRequest(betPuntoSchemaMessage0013);
    throw error;
  }

  let updatedMarket: Record<string, unknown>;
  let optionRows: Record<string, unknown>[];
  try {
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
    updatedMarket = await runSingle<Record<string, unknown>>(supabase.from('bet_markets').update({ result_option_id: resultOptionId }).eq('id', marketId).select('*').single(), 'save bet result option');
    optionRows = await runRows<Record<string, unknown>>(supabase.from('bet_options').select('*').eq('market_id', marketId).order('sort_order', { ascending: true }), 'saved bet options');
    if (status === 'settled' && resultOptionId) {
      if (required) {
        if (!closesAt || Date.parse(closesAt) > Date.now()) return badRequest('This market cannot settle before its fixed first-tee close time.');
        const defaults = await applyAutomaticBetDefaultsForMarket(supabase, marketId);
        if (defaults.unresolved.length > 0) {
          await supabase.from('bet_markets').update({ status: 'closed' }).eq('id', marketId);
          return badRequest('Automatic defaults could not be assigned for every attending player. Check player options and team assignments before settling.');
        }
      }
      const settlement = await runSingle<{ settlementSummary: { totalPotPence: number; settledBetCount: number; winningBetCount: number } }>(supabase.rpc('admin_settle_bet_market_atomic', {
        p_market_id: marketId,
        p_result_option_id: resultOptionId,
        p_result_text: optionalString(body.resultText),
      }), 'settle saved Bet Punto market atomically');
      const settlementSummary = settlement.settlementSummary;
      await writeAuditLog(supabase, session, 'bet_market.settled_via_save', 'bet_market', marketId, { tourId, resultOptionId, settlementSummary });
    }
    if (status === 'void') {
      await runSingle(supabase.rpc('admin_void_bet_market_atomic', { p_market_id: marketId }), 'void Bet Punto market atomically');
      await writeAuditLog(supabase, session, 'bet_market.voided', 'bet_market', marketId, { tourId });
    }
  } catch (error) {
    if (!id) {
      await supabase.from('bet_options').delete().eq('market_id', marketId);
      await supabase.from('bet_markets').delete().eq('id', marketId);
    }
    throw error;
  }

  return jsonResponse(200, { ok: true, betMarket: mapBetMarket(updatedMarket), betOptions: optionRows.map(mapBetOption) });
});
