import type { SupabaseClient } from '@supabase/supabase-js';
import { BET_PUNTO_MINIMUM_STAKE_PENCE, BET_PUNTO_STAKE_INCREMENT_PENCE } from '../../src/lib/betting';
import { runRows } from './_adminSupabase';

type MarketRow = {
  id: string;
  tour_id: string;
  market_type: string;
  status: string;
  closes_at: string | null;
  required: boolean | null;
};

type PlayerRow = { id: string; display_name: string; active: boolean };
type TourPlayerRow = { player_id: string };
type MemberRow = { player_id: string; team_id: string };
type OptionRow = { id: string; market_id: string; linked_player_id: string | null; linked_team_id: string | null };
type BetRow = { market_id: string; bettor_player_id: string | null; stake_amount_pence: number | string | null; status: string; outcome_status: string | null };

function stakePence(row: BetRow) {
  const value = typeof row.stake_amount_pence === 'number' ? row.stake_amount_pence : Number(row.stake_amount_pence);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

export type AutomaticDefaultResult = {
  dueMarketIds: string[];
  closedMarketIds: string[];
  insertedBetIds: string[];
  unresolved: Array<{ marketId: string; playerId: string; reason: string }>;
};

export async function applyAutomaticBetDefaultsForTour(
  supabase: SupabaseClient,
  tourId: string,
  now = Date.now(),
  options: { includeSettledMarketId?: string } = {},
): Promise<AutomaticDefaultResult> {
  const markets = await runRows<MarketRow>(
    supabase.from('bet_markets').select('id, tour_id, market_type, status, closes_at, required').eq('tour_id', tourId).eq('required', true).in('status', ['open', 'closed', 'settled']),
    'find due required Bet Punto markets',
  );
  const dueMarkets = markets.filter((market) => {
    if (market.status === 'settled' && market.id !== options.includeSettledMarketId) return false;
    const closesAt = market.closes_at ? Date.parse(market.closes_at) : Number.NaN;
    return Number.isFinite(closesAt) && closesAt <= now;
  });
  const result: AutomaticDefaultResult = { dueMarketIds: dueMarkets.map((market) => market.id), closedMarketIds: [], insertedBetIds: [], unresolved: [] };
  if (dueMarkets.length === 0) return result;

  const marketIds = dueMarkets.map((market) => market.id);
  const [tourPlayers, memberRows, optionRows, betRows] = await Promise.all([
    runRows<TourPlayerRow>(supabase.from('tour_players').select('player_id').eq('tour_id', tourId).eq('attending', true), 'find automatic-default tour players'),
    runRows<MemberRow>(supabase.from('tour_team_members').select('player_id, team_id').eq('tour_id', tourId), 'find automatic-default team membership'),
    runRows<OptionRow>(supabase.from('bet_options').select('id, market_id, linked_player_id, linked_team_id').in('market_id', marketIds), 'find automatic-default options'),
    runRows<BetRow>(supabase.from('bets').select('market_id, bettor_player_id, stake_amount_pence, status, outcome_status').in('market_id', marketIds).eq('status', 'active'), 'find existing required-market bets'),
  ]);
  const playerIds = tourPlayers.map((row) => row.player_id);
  const players = playerIds.length > 0
    ? await runRows<PlayerRow>(supabase.from('players').select('id, display_name, active').in('id', playerIds), 'find automatic-default player names')
    : [];
  const activePlayers = players.filter((player) => player.active);
  const teamByPlayer = new Map(memberRows.map((member) => [member.player_id, member.team_id]));

  for (const market of dueMarkets) {
    const marketOptions = optionRows.filter((option) => option.market_id === market.id);
    const marketBets = betRows.filter((bet) => bet.market_id === market.id && bet.outcome_status !== 'void');
    for (const player of activePlayers) {
      const alreadyStaked = marketBets
        .filter((bet) => bet.bettor_player_id === player.id)
        .reduce((total, bet) => total + stakePence(bet), 0);
      if (alreadyStaked >= BET_PUNTO_MINIMUM_STAKE_PENCE) continue;

      const targetOption = market.market_type === 'player_performance'
        ? marketOptions.find((option) => option.linked_player_id === player.id)
        : market.market_type === 'team_result'
          ? marketOptions.find((option) => option.linked_team_id === teamByPlayer.get(player.id))
          : undefined;
      if (!targetOption) {
        result.unresolved.push({ marketId: market.id, playerId: player.id, reason: market.market_type === 'team_result' ? 'No option matches the player’s tour team.' : 'No self option exists for this player.' });
        continue;
      }

      const shortfall = BET_PUNTO_MINIMUM_STAKE_PENCE - alreadyStaked;
      const stakeAmountPence = Math.ceil(shortfall / BET_PUNTO_STAKE_INCREMENT_PENCE) * BET_PUNTO_STAKE_INCREMENT_PENCE;
      const betId = crypto.randomUUID();
      const inserted = await supabase.from('bets').insert({
        id: betId,
        market_id: market.id,
        option_id: targetOption.id,
        bettor_name: player.display_name.slice(0, 120),
        bettor_player_id: player.id,
        stake_text: `£${(stakeAmountPence / 100).toFixed(0)}`,
        stake_amount_pence: stakeAmountPence,
        comment: alreadyStaked > 0 ? 'Automatic minimum top-up at first tee' : 'Automatic default at first tee',
        admin_entered: true,
        entry_source: 'automatic_default',
        admin_notes: market.market_type === 'team_result' ? 'Automatic default to own team at the fixed market close.' : 'Automatic default to self at the fixed market close.',
        status: 'active',
        outcome_status: 'pending',
        payout_status: 'not_applicable',
        created_at: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
      });
      if (inserted.error) {
        if (/duplicate key|bets_one_active_automatic_default_idx/i.test(inserted.error.message)) continue;
        throw new Error(`add automatic Bet Punto default: ${inserted.error.message}`);
      }
      result.insertedBetIds.push(betId);
    }

    if (market.status === 'open') {
      const closed = await supabase.from('bet_markets').update({ status: 'closed' }).eq('id', market.id);
      if (closed.error) throw new Error(`close required Bet Punto market: ${closed.error.message}`);
      result.closedMarketIds.push(market.id);
    }
  }

  return result;
}

export async function applyAutomaticBetDefaultsForMarket(supabase: SupabaseClient, marketId: string, now = Date.now()) {
  const markets = await runRows<{ tour_id: string }>(supabase.from('bet_markets').select('tour_id').eq('id', marketId).limit(1), 'find automatic-default market tour');
  if (markets.length === 0) throw new Error('Automatic-default market does not exist.');
  const result = await applyAutomaticBetDefaultsForTour(supabase, markets[0].tour_id, now, { includeSettledMarketId: marketId });
  return { ...result, unresolved: result.unresolved.filter((row) => row.marketId === marketId) };
}
